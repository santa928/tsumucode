// @vitest-environment node
import { it } from 'vitest';
import { expectChapterConceptCoverage } from './concept-coverage';

it.each([
  ['react-ch01', 12],
  ['react-ch02', 4],
  ['react-ch03', 2],
  ['react-ch04', 1],
] as const)('%sの初回記述前にコードと図の読解段階を揃える', async (chapter, count) => {
  const lessons = Array.from(
    { length: count },
    (_, index) => `${chapter}-l${String(index + 1).padStart(2, '0')}`,
  ).flatMap((lesson) =>
    ['react-ch01-l06', 'react-ch01-l11'].includes(lesson)
      ? [lesson, `${lesson}-compose`]
      : [lesson],
  );
  await expectChapterConceptCoverage(chapter, lessons, 'content/react');
});
