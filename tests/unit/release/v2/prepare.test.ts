// @vitest-environment node
import { mkdtemp, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CourseCatalogV3Schema } from '../../../../src/core/content/deliverySchema';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
describe('single compilation release preparation', () => {
  it('produces public and authoring trees plus the plan from one source traversal', async () => {
    const { prepareRelease } = await import('../../../../scripts/release/v2/prepare');
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-prepare-'));
    roots.push(root);
    const publicOutput = path.join(root, 'public/generated/content'),
      authoringOutput = path.join(root, 'authoring/generated/content');
    const result = await prepareRelease(path.resolve('content'), publicOutput, authoringOutput);
    const published = CourseCatalogV3Schema.parse(
      JSON.parse(await readFile(path.join(publicOutput, 'catalog-v3.json'), 'utf8')),
    );
    const authoring = CourseCatalogV3Schema.parse(
      JSON.parse(await readFile(path.join(authoringOutput, 'catalog-v3.json'), 'utf8')),
    );
    expect(published.courses.every((course) => course.publicationStatus === 'published')).toBe(
      true,
    );
    expect(authoring.courses.some((course) => course.publicationStatus === 'draft')).toBe(true);
    expect(result.inventory.courses.map((course) => course.id)).toEqual(
      authoring.courses.map((course) => course.id),
    );
    expect(result.plan.publishedCourses).toEqual(published.courses.map((course) => course.id));
    const first = published.courses[0]!;
    expect(
      await readFile(
        path.join(publicOutput, first.indexPath.replace('generated/content/', '')),
        'utf8',
      ),
    ).toBe(
      await readFile(
        path.join(authoringOutput, first.indexPath.replace('generated/content/', '')),
        'utf8',
      ),
    );
  }, 30000);
  it.each(['owned', 'symlink'])(
    'rejects an authoring output with %s ownership before compilation',
    async (kind) => {
      const { prepareRelease } = await import('../../../../scripts/release/v2/prepare');
      const root = await mkdtemp(path.join(os.tmpdir(), 'release-prepare-owner-'));
      roots.push(root);
      const owner = path.join(root, 'owner');
      await mkdir(owner);
      const target = path.join(root, 'authoring');
      if (kind === 'owned') await mkdir(target);
      else await symlink(owner, target);
      await expect(
        prepareRelease(
          path.join(root, 'unread-source'),
          path.join(root, 'public/generated/content'),
          target,
        ),
      ).rejects.toThrow(/ownership|symlink/);
    },
  );
  it('does not allow authoring and public paths to alias', async () => {
    const { prepareRelease } = await import('../../../../scripts/release/v2/prepare');
    await expect(
      prepareRelease(
        path.resolve('content'),
        '/tmp/same/generated/content',
        '/tmp/same/generated/content',
      ),
    ).rejects.toThrow();
  });
});
