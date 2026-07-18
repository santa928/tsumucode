/** 任意のBASE_PATHを前提に、React／Tailwind／alias設定を副作用なくexportする。 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { normalizePublicBasePath } from './src/shared/lib/resolvePublicAsset';

/** GitHub Pages project siteで使える先頭・末尾Slash付きPathへ正規化する。 */
export function normalizeBasePath(value: string | undefined): string {
  return normalizePublicBasePath(value);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: normalizeBasePath(env.BASE_PATH),
    plugins: [react(), tailwindcss()],
    test: { maxWorkers: 2 },
    build: { manifest: true },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  };
});
