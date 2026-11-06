import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { CompiledCourseArtifacts } from '../../content/compileCourse';
import { javascriptLearnerContentProjection } from '../javascriptLessonEvaluation';
import { hashBytes, hashValue } from './identity';
import { DigestSchema, type ReleaseInventory } from './schema';
import { ReferenceOnlyCarrySchema } from './learnerMovement';

export const PYTHON_REFERENCE_UPDATE = 'list-alias-and-console-references-v1';
export const PYTHON_REFERENCE_BASE = '16bbf55442a3166193c3e7de07c06d644126968d';
export const PYTHON_REFERENCE_EB2_BASE = 'eb2fe6f8e06409569f173efb2fe6275c46a535cf';
export const PYTHON_REFERENCE_CANDIDATE = '19cbed7d95cac527d17b58f3522cdf4f05466b92';
const fixed = [
  {
    id: 'python-basics-ch01-l05',
    chapter: 'python-basics-ch01',
    count: 18,
    glossary: 'python-list',
    previousTarget: 'python-basics-ch01-l05',
    currentTarget: 'python-basics-ch01-l05-values',
    previousPrerequisite: 'python-basics-ch01-l04',
    currentPrerequisite: 'python-basics-ch01-l05-iterate',
    next: null,
    previousFiles: 'c61650b8dc7949399d4eaaf29132258e22dd86b6b987c8409126437c4802ba0a',
    currentFiles: '845c1465adfe3bdbfa9e1e5639462f08db7f2ce2f0bc130d5c5de3bb765d9447',
    previousInventory: '017df98660f6b6b4a07dd7e817c210a6107fbff19090bee099b8cbf71897b113',
    currentInventory: '0bddaed828b3f39e525ad03f0c3d6bc8c6685c0e9574026bc8cfb0faa760f66a',
    before: "prerequisiteLessonIds: ['python-basics-ch01-l04']",
    after: "prerequisiteLessonIds: ['python-basics-ch01-l05-iterate']",
  },
  {
    id: 'python-basics-ch02-l01',
    chapter: 'python-basics-ch02',
    count: 49,
    glossary: 'python-exception',
    previousTarget: 'python-basics-ch01-l09',
    currentTarget: 'python-basics-ch01-l13',
    previousPrerequisite: 'python-basics-ch01-l09',
    currentPrerequisite: 'python-basics-ch01-l13',
    next: null,
    previousFiles: '9ff4196063142324a141606bc9dba16b7fece3313376e7c09edc9b2aa8b2e303',
    currentFiles: 'c4f52e2bea2b2d47f5e43aaae41b739272a0cac37ec162701aa7220d4b01f275',
    previousInventory: 'bf5e8de6c012a753dc054104540a3cd11e2a96eef1a50c1e8f3eb7d56e622757',
    currentInventory: '901ca15fd08cb894f27579d181d4d9dcb2a3a5d0381ee73ad7f52df37881a41c',
    before: 'prerequisiteLessonIds: [python-basics-ch01-l09]',
    after: 'prerequisiteLessonIds: [python-basics-ch01-l13]',
  },
] as const;
const ProjectionSchema = z.record(z.string(), z.json());
const RowSchema = z
  .object({
    courseId: z.literal('python-basics'),
    lessonId: z.enum(['python-basics-ch01-l05', 'python-basics-ch02-l01']),
    projection: ProjectionSchema,
    targetProjection: ProjectionSchema,
    nextLessonId: z.string().nullable(),
    lessonSource: z.string().max(16 * 1024),
    files: z
      .array(
        z
          .object({
            path: z.string().regex(/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/u),
            bytes: z.number().int().nonnegative(),
            sha256: DigestSchema,
          })
          .strict(),
      )
      .min(18)
      .max(49),
  })
  .strict();
export const PythonReferenceOriginalsSchema = z
  .object({ previous: z.array(RowSchema).length(2), current: z.array(RowSchema).length(2) })
  .strict();
export type PythonReferenceRows = z.infer<typeof PythonReferenceOriginalsSchema>['current'];

/** 固定2教材の全regular fileを採取する。Git archive側と現Compiler側で同じ関数を使う。 */
export async function capturePythonReferenceOriginals(
  courseRoot: string,
  compilation: CompiledCourseArtifacts,
  side: 'previous' | 'current',
): Promise<PythonReferenceRows> {
  if (compilation.runtime.id !== 'python-basics')
    throw Error('Fixed Python reference course differs');
  const lessons = compilation.runtime.phases.flatMap((phase) =>
    phase.chapters.flatMap((chapter) => chapter.lessons),
  );
  const projection = (id: string) => {
    const lesson = lessons.find((row) => row.id === id);
    if (!lesson) throw Error('Missing fixed Python reference target: ' + id);
    return javascriptLearnerContentProjection(
      lesson,
      compilation.runtime.glossary,
      compilation.assets,
    );
  };
  const rows = [];
  for (const spec of fixed) {
    const directory = path.join(courseRoot, 'chapters', spec.chapter, 'lessons', spec.id);
    let parent = path.resolve(courseRoot);
    for (const part of ['', 'chapters', spec.chapter, 'lessons', spec.id]) {
      parent = path.join(parent, part);
      if (!(await lstat(parent)).isDirectory())
        throw Error('Fixed Python reference parent must be a real directory');
    }
    const files: z.infer<typeof RowSchema>['files'] = [];
    async function visit(relative = '') {
      const current = path.join(directory, relative);
      if (!(await lstat(current)).isDirectory())
        throw Error('Fixed Python reference source directory differs');
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const name = relative ? relative + '/' + entry.name : entry.name;
        if (entry.isDirectory()) await visit(name);
        else {
          const file = path.join(directory, name);
          if (!entry.isFile() || !(await lstat(file)).isFile())
            throw Error('Fixed Python reference requires regular files');
          const bytes = await readFile(file);
          files.push({ path: name, bytes: bytes.length, sha256: hashBytes(bytes) });
        }
      }
    }
    await visit();
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const bytes = await readFile(path.join(directory, 'lesson.yaml'));
    const lessonSource = bytes.toString('utf8');
    if (!Buffer.from(lessonSource).equals(bytes))
      throw Error('Fixed Python lesson source is not UTF-8');
    rows.push(
      RowSchema.parse({
        courseId: 'python-basics',
        lessonId: spec.id,
        projection: projection(spec.id),
        targetProjection: projection(
          side === 'previous' ? spec.previousTarget : spec.currentTarget,
        ),
        nextLessonId: lessons.find((row) => row.id === spec.id)!.nextLessonId ?? null,
        lessonSource,
        files,
      }),
    );
  }
  return rows;
}

/** digestの除外をせず、実Gitの既知67fileと参照1fieldだけの差分を保全する。 */
export function verifyPythonReferenceOriginals(
  input: unknown,
  inventory: ReleaseInventory,
  baseline: { inventory: ReleaseInventory; sourceCommit: string; sourceRecordDigest: string },
  candidateContentCommit: string,
  declarationDigest: string,
) {
  const originals = PythonReferenceOriginalsSchema.parse(input);
  if (
    (baseline.sourceCommit !== PYTHON_REFERENCE_BASE &&
      baseline.sourceCommit !== PYTHON_REFERENCE_EB2_BASE) ||
    candidateContentCommit !== PYTHON_REFERENCE_CANDIDATE
  )
    throw Error('Fixed Python reference source differs');
  const carries = new Map<string, z.infer<typeof ReferenceOnlyCarrySchema>>();
  const course = (source: ReleaseInventory) =>
    source.courses.find(
      (row) => row.id === 'python-basics' && row.publicationStatus === 'published',
    );
  for (const [index, spec] of fixed.entries()) {
    for (const side of ['previous', 'current'] as const) {
      const row = originals[side][index]!;
      const previous = side === 'previous';
      const source = previous ? baseline.inventory : inventory;
      const lesson = course(source)?.lessons.find((lesson) => lesson.id === spec.id);
      const targetId = previous ? spec.previousTarget : spec.currentTarget;
      const target = course(source)?.lessons.find((lesson) => lesson.id === targetId);
      const prerequisite = previous ? spec.previousPrerequisite : spec.currentPrerequisite;
      const yaml = row.files.find((file) => file.path === 'lesson.yaml');
      if (
        row.lessonId !== spec.id ||
        row.files.length !== spec.count ||
        new Set(row.files.map((file) => file.path)).size !== spec.count ||
        hashValue(row.files) !== (previous ? spec.previousFiles : spec.currentFiles) ||
        !yaml ||
        yaml.bytes !== Buffer.byteLength(row.lessonSource) ||
        yaml.sha256 !== hashBytes(Buffer.from(row.lessonSource))
      )
        throw Error('Fixed Python reference raw originals differ');
      if (
        !lesson ||
        hashValue(lesson) !== (previous ? spec.previousInventory : spec.currentInventory) ||
        row.projection.id !== spec.id ||
        row.projection.kind !== lesson.kind ||
        hashValue(row.projection) !== lesson.learnerDigest
      )
        throw Error('Fixed Python reference learner projection differs');
      if (
        !target ||
        row.targetProjection.id !== targetId ||
        hashValue(row.targetProjection) !== target.learnerDigest ||
        !Array.isArray(row.targetProjection.slides) ||
        row.targetProjection.slides.filter(
          (slide) =>
            typeof slide === 'object' &&
            slide !== null &&
            !Array.isArray(slide) &&
            slide.id === targetId + '-s01',
        ).length !== 1 ||
        !course(source)?.lessons.some((lesson) => lesson.id === prerequisite)
      )
        throw Error('Fixed Python reference target differs');
      if (
        row.nextLessonId !== spec.next ||
        lesson.navigationDigest !== hashValue({ prerequisites: [prerequisite], next: spec.next })
      )
        throw Error('Fixed Python reference navigation differs');
    }
    const previous = originals.previous[index]!;
    const current = originals.current[index]!;
    if (
      previous.lessonSource.split(spec.before).length !== 2 ||
      previous.lessonSource.replace(spec.before, spec.after) !== current.lessonSource
    )
      throw Error('Fixed Python prerequisite delta differs');
    const mapped = structuredClone(previous.projection);
    if (!Array.isArray(mapped.glossary) || mapped.glossary.length !== 1)
      throw Error('Fixed Python glossary coverage differs');
    const glossary = mapped.glossary[0];
    const currentGlossary = Array.isArray(current.projection.glossary)
      ? current.projection.glossary[0]
      : undefined;
    if (
      typeof glossary !== 'object' ||
      glossary === null ||
      Array.isArray(glossary) ||
      glossary.id !== spec.glossary ||
      glossary.firstSlideId !== spec.previousTarget + '-s01' ||
      typeof currentGlossary !== 'object' ||
      currentGlossary === null ||
      Array.isArray(currentGlossary) ||
      currentGlossary.id !== spec.glossary ||
      currentGlossary.firstSlideId !== spec.currentTarget + '-s01'
    )
      throw Error('Fixed Python glossary reference delta differs');
    glossary.firstSlideId = spec.currentTarget + '-s01';
    if (hashValue(mapped) !== hashValue(current.projection))
      throw Error('Fixed Python reference visible fields differ');
    const oldLesson = course(baseline.inventory)!.lessons.find((lesson) => lesson.id === spec.id)!;
    const lesson = course(inventory)!.lessons.find((lesson) => lesson.id === spec.id)!;
    if (
      oldLesson.exerciseDigest !== hashValue(oldLesson.exercises) ||
      lesson.exerciseDigest !== hashValue(lesson.exercises) ||
      hashValue(oldLesson.exercises) !== hashValue(lesson.exercises)
    )
      throw Error('Fixed Python reference execution/grading differs');
    carries.set(
      'python-basics/' + spec.id,
      ReferenceOnlyCarrySchema.parse({
        kind: 'reference-only',
        courseId: 'python-basics',
        fromLessonId: spec.id,
        toLessonId: spec.id,
        sourceCommit: baseline.sourceCommit,
        sourceRecordDigest: baseline.sourceRecordDigest,
        fromLearnerDigest: oldLesson.learnerDigest,
        candidateContentCommit,
        toLearnerDigest: lesson.learnerDigest,
        movementDeclarationDigest: declarationDigest,
      }),
    );
  }
  return carries;
}
