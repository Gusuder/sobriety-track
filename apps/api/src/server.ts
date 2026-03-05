import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { pool } from './db/pool.js';
import { authRoutes } from './routes/auth.js';
import { entriesRoutes } from './routes/entries.js';
import { goalsRoutes } from './routes/goals.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { profileRoutes } from './routes/profile.js';

const insecureProductionSecrets = new Set(['change-me', 'change-me-super-secret', 'secret', 'password', '12345678']);
if (env.NODE_ENV === 'production' && insecureProductionSecrets.has(env.JWT_SECRET)) {
  throw new Error('Unsafe JWT_SECRET for production environment');
}

const app = Fastify({ logger: true, trustProxy: env.TRUST_PROXY });
const startedAt = Date.now();
const latencySamplesMs: number[] = [];
const maxLatencySamples = 500;
const metrics = {
  totalRequests: 0,
  status2xx: 0,
  status3xx: 0,
  status4xx: 0,
  status5xx: 0,
  authFailures: 0,
  authFailuresByEndpointStatus: {} as Record<string, number>,
  serverErrors: 0
};
const csrfSafeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function parseCookies(headerValue?: string) {
  const cookies: Record<string, string> = {};
  if (!headerValue) return cookies;
  for (const chunk of headerValue.split(';')) {
    const [name, ...rest] = chunk.trim().split('=');
    if (!name || rest.length === 0) continue;
    cookies[name] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}

function authEndpointFromUrl(url: string) {
  const path = url.split('?')[0];
  if (!path.startsWith('/api/auth/')) {
    return '';
  }

  const endpoint = path.slice('/api/auth/'.length).trim().toLowerCase();
  return endpoint || 'unknown';
}

function addLatencySample(ms: number) {
  latencySamplesMs.push(ms);
  if (latencySamplesMs.length > maxLatencySamples) {
    latencySamplesMs.shift();
  }
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[index];
}

const allowedOrigins = new Set(
  (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    if (allowedOrigins.size === 0) {
      cb(null, env.NODE_ENV !== 'production');
      return;
    }
    cb(null, allowedOrigins.has(origin));
  },
  credentials: true
});
app.register(fastifyJwt, { secret: env.JWT_SECRET });

app.addHook('onRequest', async (request) => {
  request.requestStartHrTime = process.hrtime.bigint();
});

app.addHook('onSend', async (_request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (env.NODE_ENV === 'production') {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

app.addHook('onResponse', async (request, reply) => {
  metrics.totalRequests += 1;
  const statusCode = reply.statusCode;

  if (statusCode >= 500) {
    metrics.status5xx += 1;
    metrics.serverErrors += 1;
  } else if (statusCode >= 400) {
    metrics.status4xx += 1;
  } else if (statusCode >= 300) {
    metrics.status3xx += 1;
  } else {
    metrics.status2xx += 1;
  }

  if ((statusCode === 401 || statusCode === 429) && request.url.startsWith('/api/auth/')) {
    metrics.authFailures += 1;
    const endpoint = authEndpointFromUrl(request.url);
    const key = `${endpoint}:${statusCode}`;
    metrics.authFailuresByEndpointStatus[key] = (metrics.authFailuresByEndpointStatus[key] ?? 0) + 1;
  }

  if (request.requestStartHrTime) {
    const durationMs = Number(process.hrtime.bigint() - request.requestStartHrTime) / 1_000_000;
    addLatencySample(durationMs);
  }
});

app.addHook('preHandler', async (request, reply) => {
  if (csrfSafeMethods.has(request.method)) {
    return;
  }
  const path = request.url.split('?')[0];
  if (!path.startsWith('/api/')) {
    return;
  }

  const cookies = parseCookies(request.headers.cookie);
  const accessTokenCookie = cookies.access_token;
  if (!accessTokenCookie) {
    return;
  }
  const csrfCookie = cookies.csrf_token;
  const csrfHeader = String(request.headers['x-csrf-token'] ?? '');
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return reply.status(403).send({ error: 'CSRF token mismatch' });
  }
});

app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies.access_token;
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    const payload = app.jwt.verify<{ userId: number; login: string }>(token);
    (request as any).user = { userId: payload.userId, login: payload.login };
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
});

app.get('/health', async () => ({ status: 'ok' }));
app.get('/ready', async (_request, reply) => {
  try {
    await pool.query('SELECT 1');
    return { status: 'ready' };
  } catch (err) {
    app.log.error({ err }, 'Readiness check failed');
    return reply.status(503).send({ status: 'not_ready' });
  }
});
app.get('/metrics', async (request, reply) => {
  if (env.NODE_ENV === 'production') {
    const providedToken = String(request.headers['x-metrics-token'] ?? '');
    if (providedToken !== env.METRICS_TOKEN) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  }
  const sampleCount = latencySamplesMs.length;
  const avgLatencyMs =
    sampleCount === 0 ? 0 : latencySamplesMs.reduce((sum, value) => sum + value, 0) / sampleCount;
  const p95LatencyMs = percentile(latencySamplesMs, 95);
  const maxLatencyMs = sampleCount === 0 ? 0 : Math.max(...latencySamplesMs);

  return {
    status: 'ok',
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    requests: {
      total: metrics.totalRequests,
      byStatusClass: {
        '2xx': metrics.status2xx,
        '3xx': metrics.status3xx,
        '4xx': metrics.status4xx,
        '5xx': metrics.status5xx
      }
    },
    errors: {
      authFailures: metrics.authFailures,
      authFailuresByEndpointStatus: metrics.authFailuresByEndpointStatus,
      serverErrors: metrics.serverErrors
    },
    latencyMs: {
      avg: Number(avgLatencyMs.toFixed(2)),
      p95: Number(p95LatencyMs.toFixed(2)),
      max: Number(maxLatencyMs.toFixed(2)),
      samples: sampleCount
    }
  };
});
app.register(authRoutes, { prefix: '/api' });
app.register(entriesRoutes, { prefix: '/api' });
app.register(goalsRoutes, { prefix: '/api' });
app.register(onboardingRoutes, { prefix: '/api' });
app.register(profileRoutes, { prefix: '/api' });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForDatabase = async (maxAttempts = 15) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runMigrations();
      app.log.info({ attempt }, 'Database is ready');
      return;
    } catch (err) {
      app.log.warn({ attempt, err }, 'Database is not ready yet, retrying...');
      if (attempt === maxAttempts) {
        throw err;
      }
      await sleep(2000);
    }
  }
};

const start = async () => {
  await waitForDatabase();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
};

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});

