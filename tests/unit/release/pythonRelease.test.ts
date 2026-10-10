// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { compileCourse } from '../../../scripts/content/compileCourse';
import { PythonDistributionManifestSchema } from '../../../scripts/build/pythonDistribution';
import { verifyPythonSyntheticProgressBundle } from '../../../scripts/release/pythonSyntheticContinuity';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';
import { sha256Text } from '../../../scripts/release/releaseHashes';
import {
  hashPythonReleaseEvidence,
  validatePythonReleaseEvidence,
  type PythonReleaseEvidence,
} from '../../../scripts/release/verifyPythonQualityEvidence';

/** gateの拒否検査専用の合成記録。実学習/実browserの証拠には使わない。 */
function evidence(): PythonReleaseEvidence {
  const source = 'a'.repeat(40),
    hash = 'b'.repeat(64);
  const reference = (n: number) => ({
    path: `private/test-${String(n)}.json`,
    sha256: String(n).repeat(64),
  });
  const record: PythonReleaseEvidence = {
    schemaVersion: 1,
    courseId: 'python-basics',
    status: 'preflight-passed-final-ci-required',
    publicationApprovalReference: 'owner:2026-10-10T14:24:29.529277+00:00:いいよ',
    realHumanTrial: 'unverified',
    lowEndPhysicalDevice: 'unverified',
    verifiedSourceCommit: source,
    canonicalDistSha256: hash,
    candidateTreeSha256: hash,
    applicationSourceSha256: hash,
    dependencyLockSha256: hash,
    vendorSha256: hash,
    personas: (['lesson', 'usability', 'runtime-publication'] as const).map((role, i) => ({
      role,
      actor: `reviewer-${String(i)}`,
      method: 'independent-ai-source-review',
      mandatoryFindings: 0,
      sourceCommit: source,
      canonicalDistSha256: hash,
      report: reference(i + 1),
    })),
    browserPreflight: (['chromium', 'firefox', 'webkit'] as const).map((browser, i) => ({
      browser,
      status: 'passed',
      sourceCommit: source,
      canonicalDistSha256: hash,
      report: reference(i + 4),
    })),
    fixtureIds: Array.from({ length: 10 }, (_, i) => `fixture-${String(i)}`),
    pyodideVersion: '314.0.7',
    pythonVersion: '3.14.2',
    capabilityPreflight: reference(7),
    uiPreflight: reference(8),
    licenseNoticesAndSourceOffer: 'bundled-and-checked',
    homePathReadingCoreRequests: 0,
    axeViolations: 0,
    author: 'author',
    privateOriginalsChecked: true,
    independenceReview: {
      reviewer: 'reviewer-2',
      status: 'approved',
      sourceCommit: source,
      canonicalDistSha256: hash,
      productTreeSha256: hash,
      evidenceSha256: hash,
      referenceSha256s: [],
    },
  };
  record.independenceReview.referenceSha256s = Array.from(
    { length: 8 },
    (_, i) => reference(i + 1).sha256,
  );
  record.independenceReview.evidenceSha256 = hashPythonReleaseEvidence(record);
  return record;
}

describe('Python公開の固定配布物と独立照合', () => {
  it('固定manifestを受け入れ、MPL原文の欠落/重複/未知入力を拒否する', async () => {
    const manifest = JSON.parse(await readFile('vendor/python/314.0.7/manifest.json', 'utf8')) as {
      file: string;
    }[];
    expect(() => PythonDistributionManifestSchema.parse(manifest)).not.toThrow();
    for (const invalid of [
      manifest.filter(({ file }) => file !== 'licenses/pyodide-MPL.txt'),
      [...manifest, manifest[0]],
      [...manifest, { file: 'extra.wasm', bytes: 1, sha256: 'a'.repeat(64) }],
    ])
      expect(() => PythonDistributionManifestSchema.parse(invalid)).toThrow();
  });
  it('全8原本と証拠全体を別reviewerのreceiptへ結び付ける', () => {
    expect(() => validatePythonReleaseEvidence(evidence())).not.toThrow();
  });
  it.each(['報告再利用', '証拠書換', '未照合原本', '別source', '作者照合', 'browser重複'])(
    '%sを拒否する',
    (kind) => {
      const record = evidence();
      if (kind === '報告再利用') record.personas[1]!.report = record.personas[0]!.report;
      if (kind === '証拠書換') record.fixtureIds[0] = 'other';
      if (kind === '未照合原本') record.independenceReview.referenceSha256s[0] = 'f'.repeat(64);
      if (kind === '別source') record.browserPreflight[0]!.sourceCommit = 'c'.repeat(40);
      if (kind === '作者照合') record.independenceReview.reviewer = record.author;
      if (kind === 'browser重複') record.browserPreflight[1]!.browser = 'chromium';
      if (kind !== '証拠書換')
        record.independenceReview.evidenceSha256 = hashPythonReleaseEvidence(record);
      expect(() => validatePythonReleaseEvidence(record)).toThrow();
    },
  );
});

describe('Python初公開の保存互換', () => {
  it('既存5CourseとPythonのSource/成功版/カーソルを実migratorで保持する', async () => {
    const course = (await compileCourse('content/python-basics')).runtime;
    const bundle = JSON.parse(
      await readFile('tests/fixtures/progress/python-previous-release-bundle.json', 'utf8'),
    ) as Record<string, unknown> & { courses: Record<string, unknown> };
    expect(await verifyPythonSyntheticProgressBundle(course, bundle)).toMatchObject({
      migratedCourses: 6,
      resetNotices: 0,
    });
    delete bundle.courses.react;
    Reflect.deleteProperty(bundle, 'integrity');
    bundle.integrity = { algorithm: 'SHA-256', digest: sha256Text(canonicalJson(bundle)) };
    await expect(verifyPythonSyntheticProgressBundle(course, bundle)).rejects.toThrow();
  });
});
