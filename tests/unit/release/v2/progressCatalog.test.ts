// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compileCourse } from '../../../../scripts/content/compileCourse';
import { buildSplitContentDelivery } from '../../../../scripts/content/splitContentDelivery';
import { canonicalSha256 } from '../../../../scripts/content/splitCourseArtifacts';

describe('public projection preserves known dormant progress contracts', () => {
  it('keeps draft identity and migration metadata without publishing draft lessons or files', async () => {
    const source = await compileCourse('content/html-css');
    const draft = {
      ...source,
      runtime: { ...source.runtime, id: 'dormant-course', publicationStatus: 'draft' as const },
    };
    const delivery = buildSplitContentDelivery([source, draft], [], 'public');
    const { ProgressCatalogSchema } = await import('../../../../src/core/content/progressCatalog');
    const progress = ProgressCatalogSchema.parse(Reflect.get(delivery, 'progressCatalog'));
    expect(delivery.catalog.courses.map(({ id }) => id)).toEqual(['html-css']);
    expect(progress.courses.map(({ id }) => id)).toEqual(['dormant-course', 'html-css']);
    expect(delivery.catalog).toMatchObject({
      progressCatalog: {
        path: 'generated/content/progress-catalog.json',
        sha256: canonicalSha256(progress),
      },
    });
    expect(JSON.stringify(progress)).not.toMatch(
      /"(?:title|description|goal|content|solutionFiles|fixtures|files|manifestPath)"/u,
    );
    expect(
      progress.courses[0]!.phases[0]!.chapters[0]!.lessons[0]!.exercises.length,
    ).toBeGreaterThan(0);
  });
  it('rejects duplicate courses and unknown learner payload fields', async () => {
    const { ProgressCatalogSchema } = await import('../../../../src/core/content/progressCatalog');
    const source = await compileCourse('content/html-css');
    const delivery = buildSplitContentDelivery([source], [], 'public');
    const progress = ProgressCatalogSchema.parse(Reflect.get(delivery, 'progressCatalog'));
    expect(() =>
      ProgressCatalogSchema.parse({
        ...progress,
        courses: [...progress.courses, progress.courses[0]],
      }),
    ).toThrow();
    expect(() =>
      ProgressCatalogSchema.parse({
        ...progress,
        courses: [{ ...progress.courses[0], solutionFiles: [] }],
      }),
    ).toThrow();
  });
});
