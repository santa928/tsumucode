/** Shared candidate checks; the full storage roundtrip has one separately owned suite. */
import { createPlaywrightConfig } from './playwright.config';
const config = createPlaywrightConfig(process.env['BASE_PATH']);
export default { ...config, testIgnore: ['manifest-progress-roundtrip.spec.ts'] };
