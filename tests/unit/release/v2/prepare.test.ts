// @vitest-environment node
import { mkdtemp, readFile, rm, cp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CourseCatalogV3Schema } from '../../../../src/core/content/deliverySchema';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
describe('single compilation release preparation', () => {
  it('produces one sanitized tree with draft indexes and the same known-course inventory', async () => {
    const { prepareRelease } = await import('../../../../scripts/release/v2/prepare');
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-prepare-'));
    roots.push(root);
    const sourceRoot = path.join(root, 'source');
    await cp(path.resolve('tests/fixtures/foundation-content'), sourceRoot, { recursive: true });
    await cp(path.join(sourceRoot, 'html-css'), path.join(sourceRoot, 'new-topic'), {
      recursive: true,
    });
    const coursePath = path.join(sourceRoot, 'new-topic/course.yaml');
    await writeFile(
      coursePath,
      (await readFile(coursePath, 'utf8'))
        .replace('id: html-css', 'id: new-topic')
        .replace('publicationStatus: published', 'publicationStatus: draft'),
    );
    const output = path.join(root, 'public/generated/content');
    const result = await prepareRelease(sourceRoot, output);
    const catalog = CourseCatalogV3Schema.parse(
      JSON.parse(await readFile(path.join(output, 'catalog-v3.json'), 'utf8')),
    );
    expect(catalog.courses.map(({ id }) => id)).toEqual(['html-css', 'new-topic']);
    expect(catalog.courses.find(({ id }) => id === 'new-topic')?.publicationStatus).toBe('draft');
    expect(result.inventory.courses.map(({ id }) => id)).toEqual(
      catalog.courses.map(({ id }) => id),
    );
    expect(result.plan.publishedCourses).toEqual(['html-css']);
    expect(Reflect.get(catalog, 'progressCatalog')).toBeUndefined();
    await expect(readFile(path.join(output, 'progress-catalog.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const lesson = await readFile(
      path.join(output, 'courses/new-topic/lessons/lesson-first-heading.json'),
      'utf8',
    );
    expect(lesson).not.toMatch(/solutionFiles|fixtures/u);
  });
});
