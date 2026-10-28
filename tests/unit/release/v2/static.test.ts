// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { compileCourse } from '../../../../scripts/content/compileCourse';
import {
  buildSplitContentDelivery,
  writeSplitContentDeliveryTree,
} from '../../../../scripts/content/splitContentDelivery';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function artifact() {
  const compilation = await compileCourse('content/html-css');
  const renamed = { ...compilation, runtime: { ...compilation.runtime, id: 'future-topic' } };
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-static-'));
  roots.push(root);
  await mkdir(path.join(root, 'generated/content'), { recursive: true });
  await writeSplitContentDeliveryTree(
    path.join(root, 'generated/content'),
    buildSplitContentDelivery([renamed], [], 'public'),
  );
  await writeFile(path.join(root, 'index.html'), '<p>Public static app</p>');
  return { root, inventory: buildInventory([renamed]) };
}
describe('generic public artifact gate', () => {
  it('accepts a future topic without a fixed course-name registry', async () => {
    const { checkStaticArtifact } = await import('../../../../scripts/release/checkStaticArtifact');
    const { root, inventory } = await artifact();
    expect((await checkStaticArtifact(root, inventory)).files).toBeGreaterThan(0);
  });
  it.each(['missing-course', 'draft', 'missing-lesson', 'extra-lesson', 'private-payload'])(
    'rejects %s from the expected public inventory',
    async (failure) => {
      const { checkStaticArtifact } =
        await import('../../../../scripts/release/checkStaticArtifact');
      const { root, inventory } = await artifact();
      if (failure === 'missing-course') inventory.courses[0]!.id = 'other-topic';
      if (failure === 'draft') inventory.courses[0]!.publicationStatus = 'draft';
      if (failure === 'missing-lesson')
        await rm(
          path.join(root, 'generated/content/courses/future-topic/lessons/html-css-ch01-l01.json'),
        );
      if (failure === 'extra-lesson')
        await writeFile(
          path.join(root, 'generated/content/courses/future-topic/lessons/undeclared.json'),
          '{}',
        );
      if (failure === 'private-payload')
        await writeFile(path.join(root, 'leak.json'), '\u007b"solutionFiles":[]\u007d');
      await expect(checkStaticArtifact(root, inventory)).rejects.toThrow();
    },
  );
});

it.each(['hash', 'missing', 'unknown-payload'])(
  'rejects progress metadata %s before publication',
  async (failure) => {
    const { root, inventory } = await artifact();
    const { checkStaticArtifact } = await import('../../../../scripts/release/checkStaticArtifact');
    const file = path.join(root, 'generated/content/progress-catalog.json');
    if (failure === 'missing') await rm(file);
    else if (failure === 'hash') await writeFile(file, '{}');
    else {
      const { readFile } = await import('node:fs/promises');
      const { canonicalSha256 } = await import('../../../../scripts/content/splitCourseArtifacts');
      const catalogPath = path.join(root, 'generated/content/catalog-v3.json');
      const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as {
        progressCatalog: { sha256: string };
      };
      const value = { schemaVersion: 1, courses: [{ unsupported: true }] };
      const { stringifyCanonicalJson } = await import('../../../../scripts/content/compileCourse');
      await writeFile(file, stringifyCanonicalJson(value));
      catalog.progressCatalog.sha256 = canonicalSha256(value);
      await writeFile(catalogPath, stringifyCanonicalJson(catalog));
    }
    await expect(checkStaticArtifact(root, inventory)).rejects.toThrow();
  },
);
