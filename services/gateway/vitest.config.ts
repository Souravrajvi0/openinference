import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      JWT_SECRET: 'test-jwt-secret-with-enough-length-for-validation',
      DATABASE_URL: 'postgresql://sentinel:sentinel@localhost:5432/openinference',
      REDIS_URL: 'redis://localhost:6379',
    },
  },
});
