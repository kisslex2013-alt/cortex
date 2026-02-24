import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['packages/*/src/**/*.test.ts'],
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            include: ['packages/*/src/**/*.ts'],
            exclude: ['**/__tests__/**', '**/*.test.ts', '**/index.ts'],
        },
    },
});
