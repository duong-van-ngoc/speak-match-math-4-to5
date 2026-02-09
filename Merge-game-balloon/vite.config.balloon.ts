import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const _dirname = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist/balloon',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(_dirname, 'index_balloon.html'),
            },
            output: {
                entryFileNames: 'assets/[name]-[hash].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]'
            }
        },
    },
    base: './' // Quan trọng để asset load tương đối
})
