import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Con un PostgreSQL real todas las pruebas comparten la misma base: van una tras otra.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
