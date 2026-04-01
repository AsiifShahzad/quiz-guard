import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:8000',
            '/ws': { target: 'ws://localhost:8000', ws: true },
            '/login': 'http://localhost:8000',
            '/logout': 'http://localhost:8000',
            '/signup': 'http://localhost:8000',
            '/me': 'http://localhost:8000',
            '/session': 'http://localhost:8000',
            '/courses': 'http://localhost:8000',
            '/projects': 'http://localhost:8000',
        },
    },
});