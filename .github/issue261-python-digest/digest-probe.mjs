import { cp, mkdtemp, readFile, readdir, lstat, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { compileCourse } from '/workspace/scripts/content/compileCourse';
import { computeLessonSourceHash } from '/workspace/scripts/content/verifyContentReview';
import { buildInventory } from '/workspace/scripts/release/v2/inventory';
import {
  pythonPracticeHistoricalDeclaration,
  verifyPythonPracticeHistoricalCandidate,
} from '/workspace/scripts/release/v2/pythonPracticeHistoricalAcceptance';

const requireWorkspace = createRequire('/workspace/package.json');
const { parse } = requireWorkspace('yaml');
const original = '/workspace/content/python-practice';
const suffix = '制作途中のCourseであり、公開Pathへは追加していません。';
const blobs = [
  'f5e6469888cc6166b0d5af8d957a36a9274c6191',
  'a71b600da080f7cbcb187d7f8a83180ba4f6945c',
  'aa4a9402b0fa7205d489e6e11c2579b668f52422',
];
const edited = [1, 2, 3].map(
  (n) =>
    `chapters/python-practice-ch01/lessons/python-practice-ch01-l0${n}/exercises/python-practice-ch01-l0${n}-e01/instructions.md`,
);
const declaration = pythonPracticeHistoricalDeclaration();
let phase = 'initial';

async function files(root, prefix = '') {
  const out = new Map();
  const directory = await lstat(path.join(root, prefix));
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw Error('Unexpected directory');
  out.set('directory:' + prefix, (directory.mode & 0o7777).toString(8));
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const rel = path.posix.join(prefix, entry.name);
    const stat = await lstat(path.join(root, rel));
    if (stat.isSymbolicLink()) throw Error('Unexpected symlink');
    if (stat.isDirectory()) for (const [key, value] of await files(root, rel)) out.set(key, value);
    else if (stat.isFile())
      out.set(
        'file:' + rel,
        (stat.mode & 0o7777).toString(8) +
          ':' +
          createHash('sha256')
            .update(await readFile(path.join(root, rel)))
            .digest('hex'),
      );
    else throw Error('Unexpected file type');
  }
  return out;
}
function lessonDir(root, id) {
  const chapter = id.slice(0, id.lastIndexOf('-'));
  return path.join(root, 'chapters', chapter, 'lessons', id);
}
async function hashes(root) {
  return new Map(
    await Promise.all(
      declaration.lessons.map(async (l) => [
        l.id,
        await computeLessonSourceHash(lessonDir(root, l.id)),
      ]),
    ),
  );
}
async function main() {
  phase = 'scratch';
  const scratch = await mkdtemp('/tmp/issue261-digest-');
  const candidate = path.join(scratch, 'python-practice');
  let failed = false;
  let priorFailure;
  try {
    phase = 'scan-original';
    const before = await files(original);
    phase = 'copy';
    await cp(original, candidate, { recursive: true, errorOnExist: true, force: false });
    phase = 'edit';
    for (let i = 0; i < edited.length; i++) {
      const file = path.join(candidate, edited[i]);
      const bytes = await readFile(file);
      const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (blob !== blobs[i]) throw Error('Fixed instruction blob differs');
      const text = bytes.toString('utf8');
      if (text.split(suffix).length !== 2) throw Error('Sentence occurrence differs');
      await writeFile(file, text.replace(suffix, ''));
    }
    phase = 'scan-candidate';
    const after = await files(candidate);
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .filter((key) => before.get(key) !== after.get(key))
      .sort();
    if (JSON.stringify(changed) !== JSON.stringify(edited.map((p) => 'file:' + p).sort()))
      throw Error('Candidate scope differs');
    for (const relative of edited) {
      const key = 'file:' + relative;
      if (before.get(key)?.split(':')[0] !== after.get(key)?.split(':')[0])
        throw Error('Candidate file mode differs');
    }
    phase = 'compile-original';
    const originalInventory = buildInventory([await compileCourse(original)]);
    phase = 'compile-candidate';
    const changedInventory = buildInventory([await compileCourse(candidate)]);
    phase = 'compare-learner';
    const oldCourse = originalInventory.courses.find((c) => c.id === 'python-practice');
    const newCourse = changedInventory.courses.find((c) => c.id === 'python-practice');
    if (
      !oldCourse ||
      !newCourse ||
      oldCourse.lessons.length !== 5 ||
      newCourse.lessons.length !== 5
    )
      throw Error('Lesson set differs');
    for (const oldLesson of oldCourse.lessons) {
      const next = newCourse.lessons.find((l) => l.id === oldLesson.id);
      const declared = declaration.lessons.find((l) => l.id === oldLesson.id);
      if (!next || !declared || oldLesson.learnerDigest !== declared.learnerDigest)
        throw Error('Original fingerprint differs');
      const expectedChange = edited.some((p) => p.includes('/' + oldLesson.id + '/'));
      if ((oldLesson.learnerDigest !== next.learnerDigest) !== expectedChange)
        throw Error('Learner scope differs');
      console.log(
        JSON.stringify({
          lesson: oldLesson.id,
          learnerBefore: oldLesson.learnerDigest,
          learnerAfter: next.learnerDigest,
          exerciseChanged: oldLesson.exerciseDigest !== next.exerciseDigest,
          navigationChanged: oldLesson.navigationDigest !== next.navigationDigest,
          persistenceChanged: oldLesson.persistenceDigest !== next.persistenceDigest,
        }),
      );
    }
    phase = 'review';
    const reviewLedger = parse(
      await readFile('/workspace/docs/quality/content-review-python-practice.yaml', 'utf8'),
    );
    const policy = JSON.parse(
      await readFile('/workspace/docs/quality/content-v2-receipts.json', 'utf8'),
    );
    const oldHashes = await hashes(original),
      newHashes = await hashes(candidate);
    for (const lesson of declaration.lessons) {
      const beforeHash = oldHashes.get(lesson.id),
        afterHash = newHashes.get(lesson.id);
      const expectedChange = edited.some((p) => p.includes('/' + lesson.id + '/'));
      if (!beforeHash || !afterHash || (beforeHash !== afterHash) !== expectedChange)
        throw Error('Source hash scope differs');
      console.log(
        JSON.stringify({ lesson: lesson.id, sourceBefore: beforeHash, sourceAfter: afterHash }),
      );
    }
    phase = 'review-original';
    verifyPythonPracticeHistoricalCandidate(originalInventory, declaration, {
      reviewLedger,
      sourceHashes: oldHashes,
      withdrawals: policy.withdrawals,
    });
    phase = 'review-candidate';
    try {
      verifyPythonPracticeHistoricalCandidate(changedInventory, declaration, {
        reviewLedger,
        sourceHashes: newHashes,
        withdrawals: policy.withdrawals,
      });
      throw Error('Candidate unexpectedly accepted');
    } catch (error) {
      if (
        !(error instanceof Error) ||
        ![1, 2, 3].every((n) =>
          error.message.includes(`Lesson source hashが古いです: python-practice-ch01-l0${n}`),
        )
      )
        throw error;
      console.log('candidate-current-review=reject-stale-source');
    }
    // Synthetic control isolates the fixed learner comparison; no new receipt is issued.
    phase = 'review-control';
    try {
      verifyPythonPracticeHistoricalCandidate(changedInventory, declaration, {
        reviewLedger,
        sourceHashes: oldHashes,
        withdrawals: policy.withdrawals,
      });
      throw Error('Candidate unexpectedly accepted');
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.startsWith('Historical Python practice learner content changed:')
      )
        throw error;
      console.log('synthetic-prior-review-control=reject-learner-digest');
    }
  } catch (error) {
    failed = true;
    priorFailure = error;
  }
  if (!failed) phase = 'cleanup';
  try {
    const scratchStat = await lstat(scratch);
    if (
      path.dirname(scratch) !== '/tmp' ||
      !path.basename(scratch).startsWith('issue261-digest-') ||
      !scratchStat.isDirectory() ||
      scratchStat.isSymbolicLink()
    )
      throw Error('Scratch directory identity differs');
    await rm(scratch, { recursive: true, force: false });
    console.log('scratch-cleanup=success');
  } catch (error) {
    console.error('scratch-cleanup=failed');
    if (!failed) priorFailure = error;
    failed = true;
  }
  if (failed) throw priorFailure;
  phase = 'complete';
  console.log('probe=complete; scratch removed; no receipt or acceptance created');
}
void main().catch(() => {
  console.error('digest-probe=failed phase=' + phase);
  process.exitCode = 1;
});
