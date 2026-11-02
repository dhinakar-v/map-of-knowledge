/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Static GitHub Pages build. There is NO backend: all data is pre-built JSON under public/data/
// (see export_static.py), and search runs in the browser. Change the deploy sub-path in ONE place:
// the BASE below (Project Pages serve under https://<user>.github.io/<repo>/, so base must be "/<repo>/").
// Override at build time with  BASE_PATH=/my-repo/ npm run build  if the repo name differs.
const BASE = process.env.BASE_PATH ?? '/map-of-knowledge/'

export default defineConfig({
  base: BASE,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // npm test: component tests in a simulated browser (jsdom)
  test: {
    environment: 'jsdom',
  },
})
