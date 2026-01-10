import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['js/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['../web/js/**/*.js'],
            exclude: [
                '../web/js/**/*.test.js',
                '../web/js/vendor/**'
            ],
            thresholds: {
                statements: 80,
                branches: 80,
                functions: 80,
                lines: 80
            }
        },
        setupFiles: ['./js/setup.js']
    },
    resolve: {
        alias: {
            '@': '../web/js',
            // Mock ComfyUI's app module
            '../../../scripts/app.js': resolve(__dirname, './js/mocks/app.js'),
            '../../scripts/app.js': resolve(__dirname, './js/mocks/app.js'),
            // Mock workflow_groups.js
            './workflow_groups.js': resolve(__dirname, './js/mocks/workflow_groups.js')
        }
    }
});
