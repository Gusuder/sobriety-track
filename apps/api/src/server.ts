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

const app = Fastify({ logger: true });

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
  }
});
app.register(fastifyJwt, { secret: env.JWT_SECRET });

app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
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

