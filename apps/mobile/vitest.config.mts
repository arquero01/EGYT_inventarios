import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const simulacion = (archivo: string) => fileURLToPath(new URL(`./test/simulaciones/${archivo}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@react-native-async-storage/async-storage': simulacion('asyncStorage.ts'),
      'expo-crypto': simulacion('expoCrypto.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
