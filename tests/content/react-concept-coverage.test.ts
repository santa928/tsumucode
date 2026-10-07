// @vitest-environment node
import { it } from 'vitest';
import { expectChapterConceptCoverage } from './concept-coverage';

it.each([
  ['react-ch01', 12],
  ['react-ch02', 2],
  ['react-ch03', 1],
] as const)('%sの初回記述前にコードと図の読解段階を揃える', async (chapter, count) => {
  await expectChapterConceptCoverage(
    chapter,
    Array.from(
      { length: count },
      (_, index) => `${chapter}-l${String(index + 1).padStart(2, '0')}`,
    ),
    'content/react',
  );
});
