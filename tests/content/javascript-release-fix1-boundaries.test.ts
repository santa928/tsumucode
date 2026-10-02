// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createJavascriptInputManifest,
  compareJavascriptLearningInputs,
} from '../../scripts/release/javascriptInputHashes';
import { assertPromotionDiff } from '../../scripts/release/verifyReleasePromotion';
import { assertProductUnchanged } from '../../scripts/release/verifyReleaseApproval';
import { hashReleaseCandidateTree } from '../../scripts/release/releaseHashes';

const git = vi.hoisted(() => ({ changed: [] as string[], tracked: [] as string[] }));
vi.mock('node:child_process', () => ({
  execFile: Object.assign(() => {}, {
    [Symbol.for('nodejs.util.promisify.custom')]: async (_command: string, args: string[]) => {
      if (args.includes('--quiet')) {
        const excluded = args
          .filter((arg) => arg.startsWith(':(exclude,literal)'))
          .map((arg) => arg.slice(':(exclude,literal)'.length));
        if (git.changed.some((file) => !excluded.includes(file)))
          throw Object.assign(new Error('Product changed'), { code: 1 });
      }
      return {
        stdout: args.includes('--name-only')
          ? git.changed.join('\0') + '\0'
          : args.includes('ls-files') && !args.includes('--others')
            ? git.tracked.join('\0') + '\0'
            : '',
        stderr: '',
      };
    },
  }),
}));
const buildInputs = [
  'compose.yaml',
  'compose.learning.yaml',
  'scripts/docker-compose.sh',
  'Dockerfile',
  'Dockerfile.learning',
  'scripts/learn.sh',
  'scripts/local/controller.mjs',
  '.env.sample',
  'lighthouserc.cjs',
  '.github/workflows/pages.yml',
];
const frontend =
  'schemaVersion: 1\nid: frontend\ntitle: fixed\ndescription: fixed\npublicationStatus: published\nsteps:\n  - courseId: html-css\n    role: required\n    prerequisiteCourseIds: []\n';
const registration =
  '  - courseId: javascript\n    role: required\n    prerequisiteCourseIds: [html-css]\n';
/** 原独立REDと同じ公開metadataだけの対照に、実build/実行設定を含める。実Course/承認/Gitを作らない。 */
function files(published = false): Map<string, Uint8Array> {
  return new Map(
    Object.entries({
      'content/javascript/course.yaml': `id: javascript\npublicationStatus: ${published ? 'published' : 'draft'}\nrevision: 2026-10-02.99\n`,
      'content/learning-paths/frontend.yaml': frontend + (published ? registration : ''),
      'package.json': '{}',
      'package-lock.json': '{}',
      'src/core/example.ts': 'export const value = 1;',
      ...Object.fromEntries(buildInputs.map((file) => [file, 'unchanged build configuration'])),
    }).map(([file, text]) => [file, new TextEncoder().encode(text)]),
  );
}
describe('I01 fixed build input boundary', () => {
  it('元対照: 許可metadataだけの変更を受理する', () => {
    expect(
      compareJavascriptLearningInputs(
        createJavascriptInputManifest('a'.repeat(40), files()),
        createJavascriptInputManifest('b'.repeat(40), files(true)),
      ),
    ).toEqual(['content/javascript/course.yaml', 'content/learning-paths/frontend.yaml']);
  });
  it.each(buildInputs)('%sの変更と削除をmetadata-onlyへ数えない', (file) => {
    const draft = createJavascriptInputManifest('a'.repeat(40), files());
    const changed = files(true);
    changed.set(file, new TextEncoder().encode('changed build configuration'));
    expect(() =>
      compareJavascriptLearningInputs(
        draft,
        createJavascriptInputManifest('b'.repeat(40), changed),
      ),
    ).toThrow();
    changed.delete(file);
    expect(() =>
      compareJavascriptLearningInputs(
        draft,
        createJavascriptInputManifest('b'.repeat(40), changed),
      ),
    ).toThrow();
  });
  it('自動Compose override追加も学習入力を変える', () => {
    const changed = files(true);
    changed.set('compose.override.yaml', new TextEncoder().encode('services: changed'));
    expect(() =>
      compareJavascriptLearningInputs(
        createJavascriptInputManifest('a'.repeat(40), files()),
        createJavascriptInputManifest('b'.repeat(40), changed),
      ),
    ).toThrow();
  });
});
describe('I02 exact JS record-only boundary', () => {
  const revision = '2026-10-02.99';
  const rejected = [
    'docs/quality/unregistered-evidence.yaml',
    'docs/quality/private-raw-log.txt',
    'docs/superpowers/private.md',
    'docs/quality/content-review.yaml',
    'content/html-css/release-history.yaml',
    'docs/quality/post-deploy/javascript/2026-10-02.98.yaml',
    'docs/quality/post-deploy/2026-10-02.99.yaml',
    'src/core/example.ts',
  ];
  beforeEach(() => {
    git.changed = [];
    git.tracked = [];
  });
  it.each(rejected)('%sをpromotionとP→Mで拒否する', async (file) => {
    git.changed = [file];
    await expect(
      assertPromotionDiff('/synthetic-root', 'a'.repeat(40), 'javascript', revision),
    ).rejects.toThrow();
    await expect(
      assertProductUnchanged(
        '/synthetic-root',
        'a'.repeat(40),
        'b'.repeat(40),
        'javascript',
        revision,
      ),
    ).rejects.toThrow();
  });
  it.each([
    'docs/quality/javascript-release-checklist.yaml',
    'docs/quality/javascript-release-approval.yaml',
    'content/javascript/release-history.yaml',
    'docs/quality/post-deploy/javascript/2026-10-02.99.yaml',
  ])('%sだけを同じliteral集合で許可する', async (file) => {
    git.changed = [file];
    await expect(
      assertPromotionDiff('/synthetic-root', 'a'.repeat(40), 'javascript', revision),
    ).resolves.toBeUndefined();
    await expect(
      assertProductUnchanged(
        '/synthetic-root',
        'a'.repeat(40),
        'b'.repeat(40),
        'javascript',
        revision,
      ),
    ).resolves.toBeUndefined();
  });
  const temporary: string[] = [];
  afterEach(async () => {
    for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true });
  });
  it('candidate treeも未登録docsを含み、登録済み記録だけを除外する（Git書込なし）', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'js-release-fix1-tree-'));
    temporary.push(root);
    const registered = 'docs/quality/javascript-release-checklist.yaml';
    const unknown = 'docs/quality/private-raw-log.txt';
    await mkdir(path.join(root, 'docs/quality'), { recursive: true });
    await writeFile(path.join(root, registered), 'record-before');
    await writeFile(path.join(root, unknown), 'raw-before');
    git.tracked = [registered, unknown];
    const original = await hashReleaseCandidateTree(root, new Map(), 'javascript', revision);
    await writeFile(path.join(root, registered), 'record-after');
    expect(await hashReleaseCandidateTree(root, new Map(), 'javascript', revision)).toBe(original);
    await writeFile(path.join(root, unknown), 'raw-after');
    expect(await hashReleaseCandidateTree(root, new Map(), 'javascript', revision)).not.toBe(
      original,
    );
  });
});
