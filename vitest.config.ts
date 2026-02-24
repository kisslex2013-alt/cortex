import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['packages/*/src/**/*.test.{ts,tsx}'],
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            include: ['packages/*/src/**/*.{ts,tsx}'],
            exclude: ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/index.ts'],
        },
    },
});
