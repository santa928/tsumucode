import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify, TextDecoder } from 'node:util';

const exec = promisify(execFile);

/** CI must provide the event Source; local checks may explicitly use HEAD. */
export function resolveCandidateSource(environment, localHead) {
  const required = environment.TSUMUCODE_CI_SOURCE_REQUIRED;
  const ci = environment.CI === 'true' || environment.CI === '1';
  const source = environment.TSUMUCODE_CI_SOURCE_SHA ?? (ci ? environment.GITHUB_SHA : undefined);
  if (required !== undefined && required !== '1') throw Error('Invalid CI Source mode');
  if ((required === '1' || ci) && !source) throw Error('Missing CI Source');
  if (ci && environment.GITHUB_SHA && source !== environment.GITHUB_SHA)
    throw Error('Conflicting CI Source');
  return source ?? localHead();
}

/**
 * Compare compiler input to the event-bound Git tree, without consulting the index.
 * Git metadata and a non-concurrently-mutated checkout are trusted inputs. This is
 * not an approval, receipt check, sandbox, or defense against a concurrent writer.
 */
export async function assertCandidateContentSource(rootInput, source, environment) {
  if (!/^[a-f0-9]{40}$/u.test(source)) throw Error('Invalid candidate source');
  const root = path.resolve(rootInput);
  const git = async (...args) =>
    (await exec('/usr/bin/git', ['-c', `safe.directory=${root}`, '-c', 'core.fsmonitor=false', ...args], {
      cwd: root, env: { ...environment, GIT_NO_REPLACE_OBJECTS: '1' }, encoding: 'buffer', timeout: 10000, maxBuffer: 8 * 1024 * 1024,
    })).stdout;
  if ((await git('rev-parse', 'HEAD')).toString('utf8').trim() !== source)
    throw Error('Candidate source differs');
  const raw = await git('ls-tree', '-r', '-l', '-z', '--full-tree', source, '--', 'content');
  const entries = new TextDecoder('utf-8', { fatal: true }).decode(raw).split('\0');
  if (entries.pop() !== '' || !entries.length || entries.length > 10000)
    throw Error('Invalid candidate content tree');
  const expected = new Map();
  let total = 0;
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\s+(\d+)\t(content\/[^\0]+)$/u.exec(entry);
    if (!match) throw Error('Invalid candidate content tree');
    const [, mode, oid, sizeText, relative] = match;
    const parts = relative.split('/');
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0 || size > 16 * 1024 * 1024 ||
      parts.some((part) => !part || part === '.' || part === '..' || part === '.git') ||
      relative.includes('\\') ||
      Array.from(relative).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }) ||
      expected.has(relative))
      throw Error('Invalid candidate content tree');
    total += size;
    if (total > 128 * 1024 * 1024) throw Error('Candidate content exceeds limit');
    expected.set(relative, { mode, oid, size });
  }
  const knownCourses = new Set([...expected.keys()].map((name) => name.split('/')[1]));
  const seen = new Set();
  async function visit(relative) {
    const absolute = path.join(root, ...relative.split('/'));
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw Error('Unsafe candidate content');
    if (info.isDirectory()) {
      if (relative.split('/').length === 2 && !knownCourses.has(relative.split('/')[1]))
        throw Error('Unexpected candidate course');
      for (const entry of await readdir(absolute)) await visit(`${relative}/${entry}`);
      return;
    }
    if (!info.isFile()) throw Error('Unsafe candidate content');
    const row = expected.get(relative);
    if (!row) throw Error('Unexpected candidate content');
    if ((row.mode === '100755') !== Boolean(info.mode & 0o111))
      throw Error('Candidate content mode differs');
    if (info.size !== row.size) throw Error('Candidate content bytes differ');
    const bytes = await readFile(absolute);
    const digest = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (bytes.length !== row.size || digest !== row.oid) throw Error('Candidate content bytes differ');
    seen.add(relative);
  }
  await visit('content');
  if (seen.size !== expected.size) throw Error('Candidate content missing');
}
