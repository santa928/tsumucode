import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';
import { readStages, unknownStages } from './probe-stage-lib.mjs';
export { markOnSpawn, markProbeStage, readStages, writeStage } from './probe-stage-lib.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result =
    process.argv.length === 3 && process.argv[2] ? readStages(process.argv[2]) : unknownStages();
  console.log('Fixed probe stage observations', JSON.stringify(result));
}
