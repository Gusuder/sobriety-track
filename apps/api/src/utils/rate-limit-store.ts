type LimitRecord = { count: number; resetAt: number };

export type IncrementResult = {
  count: number;
  retryAfterSec: number;
};

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<IncrementResult>;
}

class InMemoryRateLimitStore implements RateLimitStore {
  private readonly store = new Map<string, LimitRecord>();

  async increment(key: string, windowMs: number): Promise<IncrementResult> {
    const now = Date.now();
    const record = this.store.get(key);
    if (!record || record.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return { count: 1, retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)) };
    }

    record.count += 1;
    this.store.set(key, record);
    return {
      count: record.count,
      retryAfterSec: Math.max(1, Math.ceil((record.resetAt - now) / 1000))
    };
  }
}

class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly client: {
      eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
    }
  ) {}

  async increment(key: string, windowMs: number): Promise<IncrementResult> {
    const script = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;
    const result = (await this.client.eval(script, {
      keys: [key],
      arguments: [String(windowMs)]
    })) as [number, number];

    const count = Number(result?.[0] ?? 1);
    const ttlMs = Number(result?.[1] ?? windowMs);
    return {
      count,
      retryAfterSec: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000))
    };
  }
}

let singletonStorePromise: Promise<RateLimitStore> | undefined;

async function buildStore(redisUrl?: string): Promise<RateLimitStore> {
  if (!redisUrl) {
    return new InMemoryRateLimitStore();
  }

  try {
    const redisModule = await import('redis');
    const client = redisModule.createClient({ url: redisUrl });
    client.on('error', () => {
      // Logged in caller; keep handler to avoid unhandled error event.
    });
    await client.connect();
    return new RedisRateLimitStore(client);
  } catch (error) {
    // Fallback keeps auth endpoints operational if redis is unavailable.
    console.warn('Redis rate-limit store unavailable, using in-memory fallback', error);
    return new InMemoryRateLimitStore();
  }
}

export async function getRateLimitStore(redisUrl?: string): Promise<RateLimitStore> {
  if (!singletonStorePromise) {
    singletonStorePromise = buildStore(redisUrl);
  }
  return singletonStorePromise;
}
