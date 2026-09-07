import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/database/**/*.test.ts'],
    clearMocks: true,
    coverage: { include: ['src/lib/auth/**/*.ts', 'src/lib/cart/**/*.ts', 'src/proxy.ts'] },
  },
});
