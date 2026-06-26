import { getRedis } from './redis';

const FAILURE_THRESHOLD = 5;
const WINDOW_SEC = 60;
const OPEN_SEC = 30;

export class CircuitOpenError extends Error {
  constructor(provider: string) {
    super(`Provider ${provider} is temporarily unavailable (circuit open)`);
    this.name = 'CircuitOpenError';
  }
}

export async function assertCircuitClosed(provider: string): Promise<void> {
  const open = await getRedis().get(`circuit:${provider}:open`);
  if (open) throw new CircuitOpenError(provider);
}

export async function recordProviderSuccess(provider: string): Promise<void> {
  await getRedis().del(`circuit:${provider}:failures`);
}

export async function recordProviderFailure(provider: string): Promise<void> {
  const redis = getRedis();
  const failuresKey = `circuit:${provider}:failures`;
  const count = await redis.incr(failuresKey);
  if (count === 1) await redis.expire(failuresKey, WINDOW_SEC);
  if (count >= FAILURE_THRESHOLD) {
    await redis.set(`circuit:${provider}:open`, '1', 'EX', OPEN_SEC);
  }
}
