import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { z } from 'zod';
import { compileCourse } from '../../content/compileCourse';
import { computeLessonSourceHash, verifyReviewLedger } from '../../content/verifyContentReview';
import { hashBytes, hashValue, repositoryEnvironment } from './identity';
import { buildInventory } from './inventory';
import { CommitSchema, DigestSchema, IdSchema, InventorySchema } from './schema';
import { readInventoryAtSource } from './sourceInventory';

const exec = promisify(execFile);
const sourceCommit = '6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931';
const candidateReference = '9821a4eb16b7395ccf94bfbb59f467507bca97b3';
const reviewPath = 'docs/quality/content-review-python-practice.yaml';
const reviewDigest = '969bc1ef3f7f2b82516899a41db066757071b71b3099cc70392095d0587bed86';
const observationReference = '87296dd27654455c16212e41a68c106021c72ef9';
const policyPath = 'docs/quality/content-v2-receipts.json';
const LessonSchema = z
  .object({
    id: IdSchema,
    learnerDigest: DigestSchema,
    exerciseDigest: DigestSchema,
    navigationDigest: DigestSchema,
    persistenceDigest: DigestSchema,
    sourceHash: DigestSchema,
  })
  .strict();
const DeclarationSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.literal('verified-proposal-not-a-content-receipt'),
    courseId: IdSchema,
    sourceCommit: CommitSchema,
    sourceTree: CommitSchema,
    courseTree: CommitSchema,
    historicalDistTreeSha256: DigestSchema,
    proposalDigest: DigestSchema,
    independentAuditDigest: DigestSchema,
    uiObservation: z
      .object({
        recordSource: CommitSchema,
        actorCount: z.number().int(),
        method: z.literal('parent-direct-report-of-independent-computer-use'),
        observedLessonIds: z.array(IdSchema),
        independentChildImagesInspectedHere: z.boolean(),
        inferredActorRoleReceipts: z.number().int(),
        completeAllLessonThreeRoleClaim: z.boolean(),
        exactObservationTimestamp: z.string().nullable(),
        lessonMapping: z.literal('inferred-from-course-scope-not-raw-lesson-ids'),
        actorScopes: z.array(
          z
            .object({
              label: z.string(),
              observedAfter: z.string().nullable(),
              lessonIds: z.array(IdSchema),
              scope: z.array(z.string()),
              unverified: z.array(z.string()),
            })
            .strict(),
        ),
      })
      .strict(),
    performance: z
      .object({ currentRemeasurement: z.boolean(), numericalSlaClaim: z.boolean() })
      .strict(),
    unverified: z.array(z.string()),
    auditUnverified: z.array(z.string()),
    lessons: z.array(LessonSchema),
  })
  .strict();
export type PythonPracticeHistoricalDeclaration = z.infer<typeof DeclarationSchema>;

// This single frozen case is preparation for independent receipt inspection, never an approval.
const pinned: PythonPracticeHistoricalDeclaration = {
  schemaVersion: 1,
  status: 'verified-proposal-not-a-content-receipt',
  courseId: 'python-practice',
  sourceCommit,
  sourceTree: '85b143b26b35aaeb68ce11df1b8b16729a6ab966',
  courseTree: '36829dae17cb50ddaedf4fdeb0d3b0697c7531a8',
  historicalDistTreeSha256: '285276bd94e3a32dcc4ef81914fa2a50500e34dc1aafe02d34773e2b5062ef4f',
  proposalDigest: '45532dda9a592ad8982df587236a5858551ede232a640a7a1c7407d6e4a3a758',
  independentAuditDigest: '8b866039310010ca265f53fe855afedc951126903e457f0faf4cac329cccd4cd',
  uiObservation: {
    recordSource: observationReference,
    actorCount: 3,
    method: 'parent-direct-report-of-independent-computer-use',
    observedLessonIds: ['python-practice-ch01-l01', 'python-practice-ch03-l01'],
    independentChildImagesInspectedHere: false,
    inferredActorRoleReceipts: 0,
    completeAllLessonThreeRoleClaim: false,
    exactObservationTimestamp: null,
    lessonMapping: 'inferred-from-course-scope-not-raw-lesson-ids',
    actorScopes: [
      {
        label: '初見CUA',
        observedAfter: null,
        lessonIds: ['python-practice-ch01-l01'],
        scope: ['first-exercise-output-guidance', 'course-exercise-resume', 'saved-code-retention'],
        unverified: [
          'all-projects',
          'narrow-viewport',
          'all-lesson-completion-and-understanding',
          'maker-implementation',
        ],
      },
      {
        label: '応答・回復',
        observedAfter: '18:49以降の新実操作との親報告',
        lessonIds: ['python-practice-ch01-l01'],
        scope: [
          'first-exercise-save-resume-reload',
          'immediate-stop-rerun-grade',
          'edit-after-success-guidance',
          'no-other-tab-conflict-in-observed-run',
        ],
        unverified: [
          'long-running-execution-stop',
          'browser-close-restore',
          'all-lessons',
          'project-implementation',
          'independent-reset-and-fresh-import',
        ],
      },
      {
        label: '小画面・Keyboard',
        observedAfter: null,
        lessonIds: ['python-practice-ch03-l01'],
        scope: [
          '390x844-project-course-return-enter',
          'project-brief-read-space-collapse',
          'development-wording-review',
          'dialog-escape-focus-return',
        ],
        unverified: [
          'physical-smartphone',
          'voiceover',
          'all-tab-sequences',
          'real-human-beginner-understanding',
          'project-implementation-and-full-pass',
          'maker-implementation',
        ],
      },
    ],
  },
  performance: { currentRemeasurement: false, numericalSlaClaim: false },
  unverified: [
    'real-human-learning',
    'low-end-physical-device',
    'voiceover',
    'physical-touch',
    'all-tab-sequences',
    'all-project-implementation-by-personas',
    'long-running-execution-stop-by-personas',
    'original-independent-child-cua-images',
    'current-app-ui-and-runtime-by-this-proposal',
    'new-candidate-dist',
    'publication',
    'post-publication-operations',
  ],
  auditUnverified: [
    'current-dist-and-deployed-bytes',
    'original-dependency-volume-bytes',
    'current-common-ui-worker-local-client-all-routes',
    'latest-github-ci-and-issues',
    'original-child-cua-images-and-native-trace',
    'real-human-understanding-and-physical-device-performance',
    'new-independent-ui-observation',
    'all-performance-raw20-samples',
    'full-historical-source-6148-file-byte-comparison',
    'historical-dist-aggregate-tree-algorithm-reexecution',
  ],
  lessons: [
    {
      id: 'python-practice-ch01-l01',
      learnerDigest: '8b4bbbf2ddb1459f2b31dcfa008c2de31830d730ea1863dfeea01130609b180c',
      exerciseDigest: 'd20c0dee67262b42f14b74d6dbaa26bd7cda65798055fde8c12c09b1a8350021',
      navigationDigest: 'df75f58d960410c0c8db5f9d309b7057b713cc2e58fed7f045027f3218363c2e',
      persistenceDigest: '9ffaea5ca7aef124db995500e44afea9d5a41ced26a70701a5056df51a137c3e',
      sourceHash: '9d4d2d00cd605379212b52acce927a72f8258d8874fb333ecee556ede20a2f6b',
    },
    {
      id: 'python-practice-ch01-l02',
      learnerDigest: '72e66a94686a745072faeb02623a8b76783d2e552ca8c6d423cfa1907e543010',
      exerciseDigest: '4434580efc62add132f17324e53454da3354957af7039d0253d5822c838b33c1',
      navigationDigest: '1e03f2f7fddc17613580f538983e182056a8fa20bc75eacc459da801d6768476',
      persistenceDigest: '3905d7caee6a531624b9e3e0133ac2a73bc4fa33fe815fb76551fd1092dd8c52',
      sourceHash: 'aa2e8ecf42a172c8eadd25c65d1e9c0782f6ab29605ad3674fc2213e12821823',
    },
    {
      id: 'python-practice-ch01-l03',
      learnerDigest: '03f49ed4a4ab4956288e6e246506e711b5d405c3d03cca3cd9127baa3ae00203',
      exerciseDigest: 'a132da06a511bc428e2d9bdc31763c0f7e36c57c4757ba766f297a46f2a58dfa',
      navigationDigest: 'f018a68c14227bc7d25ee180c0326ed94284c7790a442a9c133a22049376dadc',
      persistenceDigest: '6454ee8c21db7287de41fa8d1d276c236b4d3f0b0814cee6d171d750c4332266',
      sourceHash: '6124d978f4927f68021fda26b4f478ca84026160f024e447f08fa102510dfd0d',
    },
    {
      id: 'python-practice-ch02-l01',
      learnerDigest: 'ce1564f40cad0aabc3bb3c1185ec7fb6b20d190450391ee6551893547cefe48c',
      exerciseDigest: '5caa5bde81123ed1fe925dd8111f2b8aaa709643ba24bbecc151e6e59c0b5718',
      navigationDigest: 'df75f58d960410c0c8db5f9d309b7057b713cc2e58fed7f045027f3218363c2e',
      persistenceDigest: '3f262022d4e8046942cec149c9c9928ac2dfa4dec78dbd12342fb4850c196a5d',
      sourceHash: '2d43ba1d8ea2722d73fa0fd2b25946ec512c16f5635b0559005f719d0722db77',
    },
    {
      id: 'python-practice-ch03-l01',
      learnerDigest: 'e82e34c6c3caffc58e1819d9386e16801cb00a74bc8ab934d145e45cda9dd288',
      exerciseDigest: '98638b94fcf67cd2f233da230bba45d5f87eb535a32a82ed196f3e46fd0ad140',
      navigationDigest: 'b6f4436d981ea9b01a21d110cc31de5b044e08fc135fe05a459520ac168892d5',
      persistenceDigest: '519cef53bb9d32d449372480bcbb669109e433a7cf3ac3e389de53ac13525253',
      sourceHash: 'a72b6ad57235d1767abbbe8b265702c0635119bf8ad269154db755beb154211c',
    },
  ],
};

/** A detached declaration is not an inspected original or a content receipt. */
export function pythonPracticeHistoricalDeclaration(): PythonPracticeHistoricalDeclaration {
  return structuredClone(pinned);
}

/** Do not let a caller rehash another course, actor scope, timestamp or lesson into this case. */
export function validatePythonPracticeHistoricalDeclaration(input: unknown) {
  const result = DeclarationSchema.safeParse(input);
  if (!result.success || hashValue(result.data) !== hashValue(pinned))
    throw Error('Historical Python practice declaration differs');
  return result.data;
}

/** Compare exact private bytes; no private original is copied into a public fixture or receipt. */
export function validatePythonPracticeHistoricalOriginals(
  proposalBytes: Uint8Array,
  independentAuditBytes: Uint8Array,
) {
  if (
    hashBytes(proposalBytes) !== pinned.proposalDigest ||
    hashBytes(independentAuditBytes) !== pinned.independentAuditDigest
  )
    throw Error('Historical Python practice original differs');
  return pythonPracticeHistoricalDeclaration();
}

const WithdrawalSchema = z
  .object({
    courseId: IdSchema,
    lessonId: IdSchema,
    learnerDigest: DigestSchema,
    sourceCommit: CommitSchema,
    reason: z.enum(['approval-withdrawn', 'known-finding']),
  })
  .strict();
interface CurrentReview {
  readonly reviewLedger: unknown;
  readonly sourceHashes: ReadonlyMap<string, string>;
  readonly withdrawals: unknown;
}

/** Check this case and inventory consistency; source freshness requires the reader below.
 * The result grants no new roles, baseline or release authority. */
export function verifyPythonPracticeHistoricalCandidate(
  inventoryInput: unknown,
  declarationInput: unknown,
  review: CurrentReview,
) {
  const declaration = validatePythonPracticeHistoricalDeclaration(declarationInput);
  const inventory = InventorySchema.parse(inventoryInput);
  const courses = inventory.courses.filter(({ id }) => id === declaration.courseId);
  const current = courses[0]?.lessons;
  if (
    courses.length !== 1 ||
    !current ||
    current.length !== declaration.lessons.length ||
    new Set(current.map(({ id }) => id)).size !== current.length ||
    current.some(({ id }) => !declaration.lessons.some((lesson) => lesson.id === id))
  )
    throw Error('Historical Python practice lesson set differs');
  if (
    review.sourceHashes.size !== declaration.lessons.length ||
    declaration.lessons.some(({ id }) => !review.sourceHashes.has(id))
  )
    throw Error('Historical Python practice current review lesson set differs');
  const currentReview = verifyReviewLedger(review.reviewLedger, review.sourceHashes);
  const withdrawals = z.array(WithdrawalSchema).parse(review.withdrawals);
  const technicalRechecks: { lesson: string; scopes: string[] }[] = [];
  for (const lesson of declaration.lessons) {
    const candidate = current.find(({ id }) => id === lesson.id)!;
    if (candidate.learnerDigest !== lesson.learnerDigest)
      throw Error('Historical Python practice learner content changed: ' + lesson.id);
    if (
      candidate.exercises.length === 0 ||
      hashValue(candidate.exercises) !== candidate.exerciseDigest
    )
      throw Error('Historical Python practice exercise inventory differs: ' + lesson.id);
    if (
      withdrawals.some(
        (row) =>
          row.courseId === declaration.courseId &&
          row.lessonId === lesson.id &&
          row.learnerDigest === lesson.learnerDigest,
      )
    )
      throw Error('Historical Python practice content withdrawal blocks publication: ' + lesson.id);
    const scopes = (['exercise', 'navigation', 'persistence'] as const).filter(
      (scope) => candidate[`${scope}Digest`] !== lesson[`${scope}Digest`],
    );
    if (scopes.length)
      technicalRechecks.push({ lesson: declaration.courseId + '/' + lesson.id, scopes });
  }
  return { ...declaration, currentReview, technicalRechecks };
}

/** Retrieve all five immutable public Git references, then compare old and current real inputs.
 * A separate identity must inspect and pin a formal receipt before shared release gates use this. */
export async function readVerifiedPythonPracticeHistoricalEvidence(
  root: string,
  inventoryInput: unknown,
  originals: { readonly proposalPath: string; readonly independentAuditPath: string },
) {
  const declaration = validatePythonPracticeHistoricalOriginals(
    await readFile(originals.proposalPath),
    await readFile(originals.independentAuditPath),
  );
  return readPythonPracticeHistoricalPublicEvidence(root, inventoryInput, declaration);
}

/** 独立認証sidecarのtrusted caller専用。原本の認証は呼出元で必須。 */
export async function readPythonPracticeHistoricalPublicEvidence(
  root: string,
  inventoryInput: unknown,
  declarationInput: unknown,
) {
  const declaration = validatePythonPracticeHistoricalDeclaration(declarationInput);
  const inventory = InventorySchema.parse(inventoryInput);
  const suppliedCourses = inventory.courses.filter(({ id }) => id === declaration.courseId);
  // Lesson raw hashes omit shared glossary/assets; bind the whole current compiled course too.
  const compiled = buildInventory([
    await compileCourse(path.join(root, 'content', declaration.courseId)),
  ]);
  if (
    suppliedCourses.length !== 1 ||
    hashValue(suppliedCourses[0]) !== hashValue(compiled.courses[0])
  )
    throw Error('Historical Python practice candidate inventory differs from current source');
  const env = await repositoryEnvironment(root);
  const git = async (...args: string[]) =>
    (await exec('git', args, { cwd: root, env, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 }))
      .stdout;
  if (
    (await git('rev-parse', sourceCommit + '^{tree}')).toString().trim() !==
      declaration.sourceTree ||
    (await git('rev-parse', sourceCommit + ':content/python-practice')).toString().trim() !==
      declaration.courseTree
  )
    throw Error('Historical Python practice source tree differs');
  const references = [
    { sourceCommit, path: reviewPath, bytes: 4289, sha256: reviewDigest },
    { sourceCommit: candidateReference, path: reviewPath, bytes: 4289, sha256: reviewDigest },
    {
      sourceCommit: observationReference,
      path: 'docs/quality/python-computer-use-acceptance.md',
      bytes: 17217,
      sha256: 'c2cb60e49161a5baf4a17b4a7d49009b5ff298a18b233ae7aaf9280a8f327eb6',
    },
    {
      sourceCommit: candidateReference,
      path: 'docs/quality/python-practice-course-acceptance.md',
      bytes: 17845,
      sha256: '49656cdbae3bc560b35acbd5fcb28f027ab71b5f111c519f6231c99e5a5d62ef',
    },
    {
      sourceCommit: candidateReference,
      path: policyPath,
      bytes: 4390,
      sha256: '1b362557a35d50d7e619e0517480895ef9bacf179e3c39acff9f56b90ff4c76c',
    },
  ];
  for (const reference of references) {
    const bytes = await git('show', reference.sourceCommit + ':' + reference.path);
    if (bytes.length !== reference.bytes || hashBytes(bytes) !== reference.sha256)
      throw Error('Historical Python practice Git reference differs');
  }
  const archived = await readInventoryAtSource(root, sourceCommit, declaration.courseId);
  const originalLessons = archived.inventory.courses[0]?.lessons;
  if (!originalLessons || originalLessons.length !== declaration.lessons.length)
    throw Error('Historical Python practice archived lesson set differs');
  for (const lesson of declaration.lessons) {
    const original = originalLessons.find(({ id }) => id === lesson.id);
    if (
      !original ||
      (['learner', 'exercise', 'navigation', 'persistence'] as const).some(
        (scope) => original[`${scope}Digest`] !== lesson[`${scope}Digest`],
      )
    )
      throw Error('Historical Python practice archived fingerprint differs');
  }
  const sourceHashes = new Map<string, string>();
  for (const lesson of declaration.lessons) {
    const chapter = lesson.id.slice(0, lesson.id.lastIndexOf('-'));
    const directory = path.join(
      root,
      'content/python-practice/chapters',
      chapter,
      'lessons',
      lesson.id,
    );
    sourceHashes.set(lesson.id, await computeLessonSourceHash(directory));
  }
  const policy = z
    .object({ withdrawals: z.array(WithdrawalSchema) })
    .parse(parse(await readFile(path.join(root, policyPath), 'utf8')));
  return verifyPythonPracticeHistoricalCandidate(compiled, declaration, {
    reviewLedger: parse(await readFile(path.join(root, reviewPath), 'utf8')) as unknown,
    sourceHashes,
    withdrawals: policy.withdrawals,
  });
}
