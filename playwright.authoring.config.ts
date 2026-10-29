/** Source checks use the authoring projection; the public storage boundary runs separately. */
import { createPlaywrightConfig } from './playwright.config';
const config = createPlaywrightConfig(process.env['BASE_PATH'], 'authoring');
export default { ...config, testIgnore: ['manifest-progress-roundtrip.spec.ts'] };
