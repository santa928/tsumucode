import { spawnSync } from 'node:child_process';
import { resolvePrCiWorkerLimit } from './prCiWorkerCap';

const args = process.argv.slice(2);
let npmArgs: string[];
if (args.length === 1 && args[0] === 'fast') {
  npmArgs = ['run', 'check:ci'];
} else if (args.length === 2 && args[0] === 'prepush' && /^[0-9a-f]{40}$/u.test(args[1]!)) {
  npmArgs = ['run', 'check:prepush', '--', args[1]!];
} else {
  throw new Error('Invalid PR CI check arguments');
}
const env = { ...process.env };
const limit = resolvePrCiWorkerLimit(env['TSUMUCODE_TEST_MAX_WORKERS']);
if (limit === undefined) delete env['TSUMUCODE_TEST_MAX_WORKERS'];
else env['TSUMUCODE_TEST_MAX_WORKERS'] = limit;
const result = spawnSync('npm', npmArgs, { stdio: 'inherit', env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
