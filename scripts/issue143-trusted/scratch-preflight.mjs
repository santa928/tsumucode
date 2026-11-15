import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

export function mountFlag(mountinfo, target) {
  const entries = mountinfo.split('\n').map((line) => line.split(' - ')[0].split(' '));
  const matches = entries.filter((parts) => parts[4] === target);
  if (matches.length !== 1 || !matches[0][5]) return 'unknown';
  return matches[0][5].split(',').includes('noexec') ? 'noexec' : 'exec';
}

export function executionClass(result) {
  if (result.error?.code === 'EACCES') return 'denied';
  if (!result.error && result.status === 0 && result.signal === null) return 'allowed';
  return 'other';
}

export async function probe(parent) {
  const dir = await mkdtemp(join(parent, 'issue143-exec-probe-'));
  try {
    const file = join(dir, 'probe');
    await writeFile(file, '#!/bin/sh\nexit 0\n');
    await chmod(file, 0o700);
    return executionClass(spawnSync(file, [], { stdio: 'ignore', timeout: 1000 }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  try {
    const mounts = await readFile('/proc/self/mountinfo', 'utf8');
    const currentFlag = mountFlag(mounts, '/tmp');
    const scratchFlag = mountFlag(mounts, '/mock-tmp');
    const currentProbe = await probe('/tmp');
    const scratchProbe = await probe('/mock-tmp');
    console.log(`tmp mount=${currentFlag} probe=${currentProbe}`);
    console.log(`scratch mount=${scratchFlag} probe=${scratchProbe}`);
    if (scratchFlag !== 'exec' || scratchProbe !== 'allowed') process.exitCode = 1;
  } catch {
    console.error('scratch preflight unavailable');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
