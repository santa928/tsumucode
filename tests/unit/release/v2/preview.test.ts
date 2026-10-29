// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashArtifact } from '../../../../scripts/release/v2/identity';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
describe('same-build authoring preview', () => {
  it('uses identical app bytes with separate authoring data and leaves deployable bytes intact', async () => {
    const { createAuthoringPreview } = await import('../../../../scripts/release/v2/prepare');
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-preview-'));
    roots.push(root);
    const publicData = path.join(root, 'dist/generated/content');
    const authoringData = path.join(root, '.release-v2/authoring-public/generated/content');
    await mkdir(publicData, { recursive: true });
    await mkdir(authoringData, { recursive: true });
    await writeFile(path.join(root, 'dist/index.html'), '<script src="app.js"></script>');
    await writeFile(path.join(root, 'dist/app.js'), 'same app bytes');
    await writeFile(path.join(publicData, 'catalog-v3.json'), 'published only');
    await writeFile(path.join(authoringData, 'catalog-v3.json'), 'published and drafts');
    const original = await hashArtifact(path.join(root, 'dist'));
    await createAuthoringPreview(root);
    expect(await readFile(path.join(root, '.release-v2/authoring-dist/app.js'), 'utf8')).toBe(
      'same app bytes',
    );
    expect(
      await readFile(
        path.join(root, '.release-v2/authoring-dist/generated/content/catalog-v3.json'),
        'utf8',
      ),
    ).toBe('published and drafts');
    expect(await hashArtifact(path.join(root, 'dist'))).toEqual(original);
    await expect(createAuthoringPreview(root)).rejects.toThrow();
  });
});
