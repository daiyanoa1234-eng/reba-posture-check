/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// GitHub Pages ではリポジトリ名のサブパスで配信するため BASE_PATH で切り替える
const base = process.env.BASE_PATH ?? '/';

export default defineConfig(({ mode }) => ({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    preact(),
    // `npm run dev:https` 時のみ自己署名証明書で HTTPS 配信（LAN 内のスマホ確認用）
    ...(mode === 'https' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'REBA 姿勢評価（端末内解析）',
        short_name: 'REBA評価',
        description: '作業動画から骨格を推定し、REBA の仮評価と評価者による確定を行う。動画は端末外に送信しない。',
        lang: 'ja',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0a3a7a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 初回アクセス時に、解析に必要な WASM と軽量モデルまで含めてキャッシュする
        globPatterns: [
          '**/*.{js,css,html,svg,png,webmanifest}',
          'mediapipe/wasm/vision_wasm_internal.{js,wasm}',
          // スマホの初期値（高精度）で使う標準モデルまで含める。最高精度用の heavy は初回使用時にキャッシュ
          'models/pose_landmarker_{lite,full}.task',
        ],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // 標準モデル(full)は選択して初めて使うときに取得し、以後はキャッシュから使う
            urlPattern: ({ url }) => url.pathname.endsWith('.task'),
            handler: 'CacheFirst',
            options: { cacheName: 'pose-models', expiration: { maxEntries: 4 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
