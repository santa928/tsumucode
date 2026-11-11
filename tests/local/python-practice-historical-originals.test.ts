// @vitest-environment node
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { compileCourse } from '../../scripts/content/compileCourse';
import { buildInventory } from '../../scripts/release/v2/inventory';
import { hashValue } from '../../scripts/release/v2/identity';
import type { ReleaseInventory } from '../../scripts/release/v2/schema';
import { gitFixtureEnvironment } from '../unit/release/v2/gitFixture';
import {
  pythonPracticeHistoricalDeclaration,
  readVerifiedPythonPracticeHistoricalEvidence,
  validatePythonPracticeHistoricalOriginals,
} from '../../scripts/release/v2/pythonPracticeHistoricalAcceptance';

const declaration = () => pythonPracticeHistoricalDeclaration();
let compiledInventory: ReleaseInventory;
beforeAll(async () => {
  compiledInventory = buildInventory([await compileCourse('content/python-practice')]);
});
function candidate() {
  return structuredClone(compiledInventory);
}

const originalsRoot = process.env['PYTHON_PRACTICE_HISTORICAL_ORIGINALS'];
beforeEach(() => {
  if (!originalsRoot)
    throw Error('PYTHON_PRACTICE_HISTORICAL_ORIGINALSにread-only原本ディレクトリが必要です');
});
describe('私有原本をread-onlyで渡す検証（公開fixtureへ複製しない）', () => {
  it('固定原本2件・Git参照5件・旧inventory・現台帳を実体で検証する', async () => {
    const originals = {
      proposalPath: path.join(originalsRoot!, 'historical-proposal-v2.json'),
      independentAuditPath: path.join(originalsRoot!, 'independent-audit.json'),
    };
    const [proposal, audit] = await Promise.all([
      readFile(originals.proposalPath),
      readFile(originals.independentAuditPath),
    ]);
    expect(validatePythonPracticeHistoricalOriginals(proposal, audit)).toEqual(declaration());
    expect(() =>
      validatePythonPracticeHistoricalOriginals(
        Buffer.concat([proposal, Buffer.from('\n')]),
        audit,
      ),
    ).toThrow(/original/);
    expect(() => validatePythonPracticeHistoricalOriginals(proposal, Buffer.from('{}'))).toThrow(
      /original/,
    );
    const result = await readVerifiedPythonPracticeHistoricalEvidence(
      process.cwd(),
      candidate(),
      originals,
    );
    expect(result).toMatchObject({
      currentReview: { lessonsReviewed: 5, rejected: 0, staleHashes: 0 },
      technicalRechecks: [],
    });
  }, 20_000);

  it('clean checkoutの独立Git metadataでも成功し、現fileの拒否・撤回・古いhash・参照欠落を遮断する', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'python-practice-history-'));
    const exec = promisify(execFile);
    const env = gitFixtureEnvironment();
    const originals = {
      proposalPath: path.join(originalsRoot!, 'historical-proposal-v2.json'),
      independentAuditPath: path.join(originalsRoot!, 'independent-audit.json'),
    };
    try {
      const common = (
        await exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])
      ).stdout.trim();
      await exec('git', ['init', '--quiet', root], { env });
      const alternates = path.join(root, '.git/objects/info/alternates');
      await writeFile(alternates, path.join(common, 'objects') + '\n');
      await cp('content/python-practice', path.join(root, 'content/python-practice'), {
        recursive: true,
      });
      await mkdir(path.join(root, 'docs/quality'), { recursive: true });
      const reviewPath = path.join(root, 'docs/quality/content-review-python-practice.yaml');
      const originalReview = await readFile(
        'docs/quality/content-review-python-practice.yaml',
        'utf8',
      );
      const policyPath = path.join(root, 'docs/quality/content-v2-receipts.json');
      const originalPolicy = await readFile('docs/quality/content-v2-receipts.json', 'utf8');
      await writeFile(reviewPath, originalReview);
      await writeFile(policyPath, originalPolicy);
      expect(
        await readVerifiedPythonPracticeHistoricalEvidence(root, candidate(), originals),
      ).toMatchObject({ status: 'verified-proposal-not-a-content-receipt', technicalRechecks: [] });

      const originalCandidate = candidate();
      const glossaryPath = path.join(root, 'content/python-practice/glossary.yaml');
      const originalGlossary = await readFile(glossaryPath, 'utf8');
      await writeFile(
        glossaryPath,
        originalGlossary.replace('各要素を変換し、', '各要素の値を変換し、'),
      );
      const freshGlossary = buildInventory([
        await compileCourse(path.join(root, 'content/python-practice')),
      ]);
      expect(freshGlossary.courses[0]!.lessons[0]!.learnerDigest).not.toBe(
        originalCandidate.courses[0]!.lessons[0]!.learnerDigest,
      );
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, originalCandidate, originals),
      ).rejects.toThrow(/current source/);
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, freshGlossary, originals),
      ).rejects.toThrow(/learner content changed/);
      await writeFile(glossaryPath, originalGlossary);

      const missingExercises = candidate();
      missingExercises.courses[0]!.lessons[0]!.exercises = [];
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, missingExercises, originals),
      ).rejects.toThrow(/current source/);
      missingExercises.courses[0]!.lessons[0]!.exerciseDigest = hashValue([]);
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, missingExercises, originals),
      ).rejects.toThrow(/current source/);
      const forgedExercise = candidate();
      const forgedLesson = forgedExercise.courses[0]!.lessons[0]!;
      forgedLesson.exercises[0]!.fixtures[0]!.sourceDigest = '0'.repeat(64);
      forgedLesson.exerciseDigest = hashValue(forgedLesson.exercises);
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, forgedExercise, originals),
      ).rejects.toThrow(/current source/);

      const fixturePath = path.join(
        root,
        'content/python-practice/chapters/python-practice-ch01/lessons/python-practice-ch01-l01/exercises/python-practice-ch01-l01-e01/fixtures/hardcoded.py',
      );
      const originalFixture = await readFile(fixturePath, 'utf8');
      await writeFile(fixturePath, originalFixture + '\n# historical reader regression fixture\n');
      const freshExercise = buildInventory([
        await compileCourse(path.join(root, 'content/python-practice')),
      ]);
      expect(freshExercise.courses[0]!.lessons[0]!.exerciseDigest).not.toBe(
        originalCandidate.courses[0]!.lessons[0]!.exerciseDigest,
      );
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, originalCandidate, originals),
      ).rejects.toThrow(/current source/);
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, freshExercise, originals),
      ).rejects.toThrow(/古い/);
      await writeFile(fixturePath, originalFixture);
      await writeFile(
        reviewPath,
        originalReview.replace('decision: approved', 'decision: rejected'),
      );
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, candidate(), originals),
      ).rejects.toThrow(/未承認/);
      await writeFile(
        reviewPath,
        originalReview.replace(declaration().lessons[0]!.sourceHash, 'a'.repeat(64)),
      );
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, candidate(), originals),
      ).rejects.toThrow(/古い/);
      await writeFile(reviewPath, originalReview);
      const first = declaration().lessons[0]!;
      const policy = JSON.parse(originalPolicy) as { withdrawals: unknown[] };
      policy.withdrawals.push({
        courseId: 'python-practice',
        lessonId: first.id,
        learnerDigest: first.learnerDigest,
        sourceCommit: declaration().sourceCommit,
        reason: 'approval-withdrawn',
      });
      await writeFile(policyPath, JSON.stringify(policy));
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, candidate(), originals),
      ).rejects.toThrow(/withdrawal/);
      await writeFile(policyPath, originalPolicy);
      await rm(alternates);
      await expect(
        readVerifiedPythonPracticeHistoricalEvidence(root, candidate(), originals),
      ).rejects.toThrow(/git/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
