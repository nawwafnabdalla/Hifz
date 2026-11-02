/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// Cloudflare Workers Builds builds every branch with the SAME project variables (including the live Supabase address and key). So this
// file decides, from the branch being built, what a non-production build may contain:
//   * the live app's branch is built exactly as before;
//   * any other branch is built with NO Supabase address or key, so a preview of it cannot reach (let alone write to) the real learning records;
//   * the phrase-audio branch is also built with phrase audio on (it still stays locked until the owner's private code is entered on a device).
// The branch name comes from Workers Builds' WORKERS_CI_BRANCH (CF_PAGES_BRANCH on Pages); with neither set (local builds, tests, CI) nothing changes.
const PRODUCTION_BRANCH = 'claude/hifz-os-feasibility-btrmfb'
const PHRASE_AUDIO_BRANCHES = ['claude/hifz-os-phrase-audio']
const branch = process.env.WORKERS_CI_BRANCH ?? process.env.CF_PAGES_BRANCH ?? ''
if (branch && branch !== PRODUCTION_BRANCH) {
  process.env.VITE_SUPABASE_URL = ''
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = ''
  if (PHRASE_AUDIO_BRANCHES.includes(branch)) process.env.VITE_PHRASE_AUDIO = '1'
}
if (branch) console.log(`[hifz] building branch "${branch}": ${branch === PRODUCTION_BRANCH ? 'production settings' : `preview settings (cloud sync off, phrase audio ${process.env.VITE_PHRASE_AUDIO === '1' ? 'on, locked behind the private test code' : 'off'})`}`)

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        // The phrase-audio test build is installable beside the real app and is named differently so the two cannot be confused on a home screen.
        name: process.env.VITE_PHRASE_AUDIO === '1' ? 'Hifz OS (test)' : 'Hifz OS',
        short_name: process.env.VITE_PHRASE_AUDIO === '1' ? 'Hifz test' : 'Hifz',
        description: 'An adaptive Qur’an memorisation companion.',
        theme_color: '#0f3d33',
        background_color: '#0f3d33',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell, bundled Qur'an text and fonts are precached so the reader,
        // planner and logging work offline. Audio is deliberately NOT cached.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf,json}'],
        // Per-recording phrase timings (<reciter>--<recording>-hash.js) are fetched on demand, never precached: they are large and need the network audio anyway.
        globIgnores: ['**/assets/*--*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: false },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
})
