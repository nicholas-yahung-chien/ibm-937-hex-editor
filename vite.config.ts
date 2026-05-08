/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages deploys under /repo-name/, so Vite's base must match.
  // Override with VITE_BASE env variable for other deployment targets.
  base: process.env.VITE_BASE ?? '/ibm-937-hex-editor/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
