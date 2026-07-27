import { beforeAll, describe, expect, it } from 'vitest';
import type { CoverageReport } from '../../scripts/content/reportConceptCoverage';
import {
  loadAuthoringCourse,
  type AuthoringCoursePackage,
} from '../../scripts/content/compileCourse';
import { assertChapterConceptCoverage, diagnosticsForChapter } from './concept-coverage';
import { EXPECTED_CONCEPTS_BY_INTRODUCTION_SLIDE } from './concept-matrix';

let authoring: AuthoringCoursePackage;

beforeAll(async () => {
  authoring = await loadAuthoringCourse('content/html-css');
}, 60_000);

const fakeCoverageReport: CoverageReport = {
  missingSlideMetadata: [
    'html-css-ch00-l01/html-css-ch00-l01-s01',
    'html-css-ch01-l01/html-css-ch01-l01-s01',
  ],
  missingExerciseMetadata: [
    'html-css-ch00-l01/html-css-ch00-l01-e01',
    'html-css-ch01-l01/html-css-ch01-l01-e01',
  ],
  unmetRequirements: [
    {
      kind: 'unmet-requirement',
      lessonId: 'html-css-ch00-l01',
      exerciseId: 'html-css-ch00-l01-e01',
      conceptId: 'html-role',
      actualLevel: 'read',
      requiredLevel: 'fill',
    },
    {
      kind: 'unmet-requirement',
      lessonId: 'html-css-ch01-l01',
      exerciseId: 'html-css-ch01-l01-e01',
      conceptId: 'html-element',
      actualLevel: 'seen',
      requiredLevel: 'fill',
    },
    {
      kind: 'missing-introduction-slide',
      lessonId: '',
      slideId: 'html-css-ch00-l01-s99',
      conceptId: 'missing-concept',
      actualLevel: undefined,
      requiredLevel: 'seen',
    },
  ],
};

/** Conceptが指定Conceptを推移的な前提として持つか調べる。 */
function hasPrerequisitePath(
  concepts: ReadonlyMap<string, AuthoringCoursePackage['runtime']['concepts'][number]>,
  conceptId: string,
  prerequisiteId: string,
  visited = new Set<string>(),
): boolean {
  if (conceptId === prerequisiteId) return true;
  if (visited.has(conceptId)) return false;
  visited.add(conceptId);
  const concept = concepts.get(conceptId);
  if (concept === undefined) return false;
  return concept.prerequisiteConceptIds.some((candidateId) =>
    hasPrerequisitePath(concepts, candidateId, prerequisiteId, new Set(visited)),
  );
}

describe('Chapter限定Concept Coverage', () => {
  it('指定Chapterに属する不足だけを返す', () => {
    const diagnostics = diagnosticsForChapter(fakeCoverageReport, 'html-css-ch00');

    expect(diagnostics).toHaveLength(4);
    expect(diagnostics.map(({ lessonId }) => lessonId)).toEqual([
      'html-css-ch00-l01',
      'html-css-ch00-l01',
      'html-css-ch00-l01',
      'html-css-ch00-l01',
    ]);
    expect(diagnostics.every(({ locationId }) => locationId.startsWith('html-css-ch00-'))).toBe(
      true,
    );
  });

  it('似た接頭辞の別Chapterを混同しない', () => {
    const report: CoverageReport = {
      missingSlideMetadata: [
        'html-css-ch01-l01/html-css-ch01-l01-s01',
        'html-css-ch010-l01/html-css-ch010-l01-s01',
      ],
      missingExerciseMetadata: [],
      unmetRequirements: [],
    };

    expect(
      diagnosticsForChapter(report, 'html-css-ch01').map(({ locationId }) => locationId),
    ).toEqual(['html-css-ch01-l01/html-css-ch01-l01-s01']);
  });

  it('Chapter Coverage assertionがLesson集合と不足ゼロを検査する', () => {
    const completeReport: CoverageReport = {
      missingSlideMetadata: [],
      missingExerciseMetadata: [],
      unmetRequirements: [],
    };

    expect(() => {
      assertChapterConceptCoverage(
        completeReport,
        'html-css-ch00',
        ['html-css-ch00-l01'],
        ['html-css-ch00-l01'],
      );
    }).not.toThrow();
    expect(() => {
      assertChapterConceptCoverage(
        completeReport,
        'html-css-ch00',
        ['html-css-ch00-l01', 'html-css-ch00-l02'],
        ['html-css-ch00-l01'],
      );
    }).toThrow(/Lesson集合/u);
    expect(() => {
      assertChapterConceptCoverage(
        fakeCoverageReport,
        'html-css-ch00',
        ['html-css-ch00-l01'],
        ['html-css-ch00-l01'],
      );
    }).toThrow(/Concept Coverage/u);
  });

  it('承認済みMatrixと同じConcept ID・初出Slideを一意に持つ', () => {
    const concepts = authoring.runtime.concepts;
    const slideIds = new Set(
      authoring.runtime.phases.flatMap(({ chapters }) =>
        chapters.flatMap(({ lessons }) =>
          lessons.flatMap(({ slides }) => slides.map(({ id }) => id)),
        ),
      ),
    );

    const expectedIntroductions = Object.entries(EXPECTED_CONCEPTS_BY_INTRODUCTION_SLIDE)
      .flatMap(([introducedBySlideId, conceptIds]) =>
        conceptIds.map((id) => ({ id, introducedBySlideId })),
      )
      .toSorted((left, right) => left.id.localeCompare(right.id, 'en'));
    const actualIntroductions = concepts
      .map(({ id, introducedBySlideId }) => ({ id, introducedBySlideId }))
      .toSorted((left, right) => left.id.localeCompare(right.id, 'en'));

    expect(actualIntroductions).toEqual(expectedIntroductions);
    expect(new Set(concepts.map(({ id }) => id)).size).toBe(concepts.length);
    expect(concepts.every(({ introducedBySlideId }) => slideIds.has(introducedBySlideId))).toBe(
      true,
    );
  });

  it('HTML、CSS、Box Model、Flex、Grid、Responsiveの前提順をGraphへ固定する', () => {
    const concepts = new Map(authoring.runtime.concepts.map((concept) => [concept.id, concept]));
    const htmlConcepts = authoring.runtime.concepts.filter(
      ({ introducedBySlideId, id }) =>
        /^html-css-ch0[1-3]-/u.test(introducedBySlideId) && id !== 'html-element',
    );
    const cssAndLayoutConcepts = authoring.runtime.concepts.filter(
      ({ introducedBySlideId, id }) =>
        (/^html-css-ch0(?:4|5|6|8|9)-/u.test(introducedBySlideId) ||
          (/^html-css-ch10-/u.test(introducedBySlideId) && id !== 'viewport-meta')) &&
        id !== 'css-rule',
    );

    expect(htmlConcepts.every(({ id }) => hasPrerequisitePath(concepts, id, 'html-element'))).toBe(
      true,
    );
    expect(
      cssAndLayoutConcepts.every(({ id }) => hasPrerequisitePath(concepts, id, 'css-rule')),
    ).toBe(true);
    expect(
      hasPrerequisitePath(concepts, 'flex-container', 'box-model-content-padding-border-margin'),
    ).toBe(true);
    expect(hasPrerequisitePath(concepts, 'grid-container', 'flex-container')).toBe(true);
    expect(hasPrerequisitePath(concepts, 'mobile-first-base', 'grid-flex-choice')).toBe(true);
    expect(hasPrerequisitePath(concepts, 'media-query', 'flex-direction')).toBe(true);
    expect(hasPrerequisitePath(concepts, 'prefers-reduced-motion', 'media-query')).toBe(true);
  });
});
