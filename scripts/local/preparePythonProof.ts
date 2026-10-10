/** 承認済み公開接続を配信前に検証する私有artifactをDocker内で作る。 */
import { access } from 'node:fs/promises';
import { build } from 'vite';
import { inlineProductionCss } from '../inline-production-css';

await access('/.dockerenv');
await import('../build/preparePythonAssets');
process.env.BASE_PATH = '/tsumucode/';
const outputRoot = '.release-issue138/local-dist';
await build({ build: { outDir: outputRoot } });
await inlineProductionCss({ distRoot: outputRoot });
console.log(`Python公開前artifact: ${outputRoot}`);
