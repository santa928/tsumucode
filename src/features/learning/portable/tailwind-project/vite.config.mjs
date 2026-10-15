import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

/** 同梱のHTMLとCSSを固定Pluginで静的な生成物へ変換する。 */
export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
});
