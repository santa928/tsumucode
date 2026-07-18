import path from 'node:path';
import { loadChapterPackage } from './loadChapterPackage';

const CONCEPT_KINDS = new Set(['concept', 'comparison', 'diagram', 'code']);
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: npm run content:check:chapter -- <chapter.yaml>');

const loaded = await loadChapterPackage(path.resolve(sourcePath));
const conceptSlides = loaded.slides.filter(({ frontmatter }) =>
  CONCEPT_KINDS.has(frontmatter.kind),
).length;
const standardExercises = loaded.exercises.filter(
  ({ countsTowardStandardExerciseTotal }) => countsTowardStandardExerciseTotal,
).length;

process.stdout.write(
  `${loaded.chapter.id}: ${String(loaded.lessons.length)} lessons / ${String(conceptSlides)} concept slides / ${String(standardExercises)} standard exercises\n`,
);
