import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type {
  AuthoringExercise,
  CompiledCourseArtifacts,
} from '../../../../scripts/content/compileCourse';
import { PublicProvenanceManifestSchema } from '../../../../scripts/content/sourceSchema';
import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import { MovementInputsSchema } from '../../../../scripts/release/v2/movement';
import { DigestSchema } from '../../../../scripts/release/v2/schema';
import { javascriptLearnerContentSha256 } from '../../../../scripts/release/javascriptLessonEvaluation';
import {
  ExerciseSchema,
  GlossaryEntrySchema,
  LessonSchema,
} from '../../../../src/core/content/schema';

const FIXED = [
  { id: 'react-ch01-l01', profile: 'props-card-v1', goal: undefined, fixtures: 5 },
  { id: 'react-ch03-l01', profile: 'quiz-workshop-v1', goal: 'quiz-card', fixtures: 8 },
  { id: 'react-ch03-l02', profile: 'quiz-workshop-v1', goal: 'quiz-state', fixtures: 9 },
  { id: 'react-ch04-l01', profile: 'quiz-capstone-v1', goal: 'quiz-capstone', fixtures: 8 },
] as const;
const FROM_SLOTS = [
  ['react-ch02-l01', 'react-ch03-l01'],
  ['react-ch02-l02', 'react-ch03-l02'],
] as const;
const FixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('synthetic-unit-protocol-not-publication-approval'),
    provenance: z
      .object({
        sourceCommit: z.literal('21dcc855413a56729206b02c5a03701207123699'),
        generatorSha256: DigestSchema,
        sourceManifestDigest: DigestSchema,
        sourceFiles: z
          .array(
            z
              .object({
                path: z.string(),
                bytes: z.number().int().nonnegative(),
                sha256: DigestSchema,
              })
              .strict(),
          )
          .length(157),
        fixedGoalIds: z.array(z.string()).length(4),
        authoredFixtureCounts: z.array(z.number()).length(4),
        authoredFixtureCount: z.literal(30),
        movedFixtureCount: z.literal(25),
        assetCount: z.literal(4),
        learnerDigests: z
          .array(z.object({ lessonId: z.string(), sha256: DigestSchema }).strict())
          .length(4),
        dataDigest: z.literal('16e0cbb1c699a7beffb28634e4a9503a308e91f6a36a94f3bfe356429a54652e'),
      })
      .strict(),
    data: z
      .object({
        lessons: z.array(LessonSchema).length(4),
        authoringExercises: z.array(z.unknown()).length(4),
        glossary: z.array(GlossaryEntrySchema),
        publicProvenance: PublicProvenanceManifestSchema,
        assets: z
          .array(
            z
              .object({
                key: z.string().startsWith('assets/react/'),
                sha256: DigestSchema,
                base64: z.string(),
              })
              .strict(),
          )
          .length(4),
      })
      .strict(),
  })
  .strict();

/** Synthetic protocol data only. Never compile or replace the candidate's actual React course. */
export async function reactMovementFixture(
  oldExercise: (
    exercise: AuthoringExercise,
    from: string,
    to: string,
    references: Record<string, string>,
  ) => AuthoringExercise,
): Promise<CompiledCourseArtifacts> {
  const location = new URL(
    '../../../fixtures/release/react-movement-unit-compiled.json',
    import.meta.url,
  );
  const value = FixtureSchema.parse(JSON.parse(await readFile(location, 'utf8')) as unknown);
  const { data, provenance } = value;
  if (
    hashValue(data) !== provenance.dataDigest ||
    hashValue({ sourceCommit: provenance.sourceCommit, files: provenance.sourceFiles }) !==
      provenance.sourceManifestDigest ||
    hashBytes(
      await readFile(
        new URL('../../../fixtures/release/react-movement-unit.generator.txt', import.meta.url),
      ),
    ) !== provenance.generatorSha256
  )
    throw Error('Fixed React unit data/generator provenance differs');
  if (
    hashValue(data.lessons.map((lesson) => lesson.id)) !== hashValue(FIXED.map((row) => row.id)) ||
    hashValue(provenance.fixedGoalIds) !== hashValue(FIXED.map((row) => row.id)) ||
    hashValue(provenance.authoredFixtureCounts) !== hashValue(FIXED.map((row) => row.fixtures))
  )
    throw Error('Fixed React unit goal coverage differs');
  const originals = MovementInputsSchema.shape.current.parse([
    { courseId: 'react', exercises: data.authoringExercises },
  ])[0];
  if (!originals) throw Error('Missing fixed React authored originals');
  for (const fixed of FIXED) {
    const full = originals.exercises.find((exercise) => exercise.id === fixed.id + '-e01');
    if (
      !full ||
      full.runtime?.kind !== 'react' ||
      full.runtime.profile !== fixed.profile ||
      full.runtime.learningGoal !== fixed.goal ||
      full.fixtures.length !== fixed.fixtures
    )
      throw Error('Non-original React unit goal/profile/fixture coverage');
  }
  const assets = new Map<string, Uint8Array>();
  for (const asset of data.assets) {
    const bytes = new Uint8Array(Buffer.from(asset.base64, 'base64'));
    if (
      assets.has(asset.key) ||
      hashBytes(bytes) !== asset.sha256 ||
      Buffer.from(bytes).toString('base64') !== asset.base64
    )
      throw Error('Fixed React unit asset bytes differ');
    assets.set(asset.key, bytes);
  }
  for (const lesson of data.lessons) {
    const expected = provenance.learnerDigests.find((row) => row.lessonId === lesson.id);
    if (
      !expected ||
      expected.sha256 !== javascriptLearnerContentSha256(lesson, data.glossary, assets)
    )
      throw Error('Fixed React unit learner projection differs');
  }
  const lessons = [...data.lessons];
  const authored = [...originals.exercises];
  // The two reused-ID slots are copies of the same old Props/State goals, not new Reading lessons.
  // Reuse the existing typed inverse mapping; no string/body/code replacement or general mapper.
  for (const [from, to] of FROM_SLOTS) {
    const lesson = data.lessons.find((row) => row.id === to);
    const full = originals.exercises.find((row) => row.id === to + '-e01');
    if (!lesson || !full) throw Error('Missing fixed React from-slot');
    const previous = oldExercise(full, from, to, {});
    const { solutionFiles, fixtures, ...runtimeExercise } = previous;
    void solutionFiles;
    void fixtures;
    lessons.push({ ...lesson, id: from, exercises: [ExerciseSchema.parse(runtimeExercise)] });
    authored.push(previous);
  }
  const minutes = lessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0);
  // Deliberately a partial protocol envelope, like movementFixture's synthetic previous course.
  // It is not a compiler input, public course or substitute for prepareRelease's full inventory.
  return {
    runtime: {
      schemaVersion: 1,
      id: 'react',
      title: 'Synthetic React movement unit',
      description: 'Four original goals in six protocol slots; not publication evidence.',
      audience: 'Unit protocol',
      estimatedMinutes: minutes,
      revision: 'unit-react-movement-v1',
      runnerId: 'react',
      validatorId: 'react',
      glossary: data.glossary,
      concepts: [],
      supportedDevices: { exercise: 'desktop', study: ['desktop'] },
      prerequisites: ['typescript'],
      publicationStatus: 'published',
      provenanceManifestPath: 'unit-react-movement-provenance.json',
      progressMigrations: [],
      expectedTotals: {
        chapters: 1,
        lessons: lessons.length,
        conceptSlides: lessons
          .flatMap((lesson) => lesson.slides)
          .filter((slide) => ['concept', 'comparison', 'diagram', 'code'].includes(slide.kind))
          .length,
        standardExercises: lessons
          .flatMap((lesson) => lesson.exercises)
          .filter((exercise) => exercise.kind === 'standard').length,
        guidedProjectLessons: lessons.filter((lesson) => lesson.kind === 'guided-project').length,
        capstoneLessons: lessons.filter((lesson) => lesson.kind === 'capstone').length,
        estimatedMinutes: minutes,
      },
      phases: [
        {
          id: 'unit-react-phase',
          title: 'Synthetic protocol',
          description: 'Not a public course.',
          chapters: [
            {
              id: 'unit-react-chapter',
              sequence: 1,
              title: 'Synthetic protocol',
              goal: 'Preserve movement obligations',
              estimatedMinutes: minutes,
              kind: 'standard',
              lessons,
            },
          ],
        },
      ],
    },
    authoringExercises: authored,
    publicProvenance: data.publicProvenance,
    assets,
  };
}
