import { config } from '../config';

/** Shared BullMQ/ioredis connection options (writable primary required). */
export function bullmqConnection() {
  return {
    url: config.REDIS_URL,
    maxRetriesPerRequest: null as null,
  };
}
