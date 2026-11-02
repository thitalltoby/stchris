import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/server-only-stub.ts'),
      'next/headers': path.resolve(__dirname, 'tests/next-headers-stub.ts'),
      'next/navigation': path.resolve(__dirname, 'tests/next-navigation-stub.ts'),
    },
  },
});
