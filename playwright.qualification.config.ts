import { defineConfig } from '@playwright/test';
import authoringConfig from './playwright.authoring.config';

/** 固定教材と合成入力だけを使う候補Browser検証。実利用者の入力や認証を扱うsuiteには使わない。 */
export default defineConfig(authoringConfig, {
  retries: 0,
  use: {
    trace: {
      mode: 'retain-on-failure',
      screenshots: false,
      snapshots: false,
      sources: false,
      attachments: false,
    },
  },
});
