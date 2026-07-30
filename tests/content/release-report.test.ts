// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { ArtifactHashes } from '../../scripts/release/releaseHashes';
import {
  buildQualitySummary,
  buildReleaseReport,
  formatArtifactHashOutput,
  parseReleaseReport,
} from '../../scripts/release/writeReleaseReport';
import {
  resolveBetaTarget,
  serializeReleaseTargetOutput,
  verifyReleaseTarget,
} from '../../scripts/release/verifyReleaseTarget';
import { validateManualQualityRecord } from '../../scripts/release/verifyReleaseApproval';
import { ReleaseApprovalSchema } from '../../scripts/release/releaseSchema';

const sha = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const execFileAsync = promisify(execFile);
const inheritedGitVariableKeys = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
] as const;
const isolatedGitEnvironment = { ...process.env };
for (const key of inheritedGitVariableKeys) {
  Reflect.deleteProperty(isolatedGitEnvironment, key);
}
const hashes: ArtifactHashes = {
  artifactDigest: digest,
  courseHash: 'c'.repeat(64),
  provenanceHash: 'd'.repeat(64),
  visualBaselineHash: 'e'.repeat(64),
};

/** 親worktree用のGit環境変数を引き継がず、一時repositoryだけを操作する。 */
async function runIsolatedGit(
  repositoryRoot: string,
  arguments_: readonly string[],
): Promise<string> {
  const { stdout } = await execFileAsync('git', [...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: isolatedGitEnvironment,
  });
  return stdout;
}

/** Production helperの子Gitも一時repositoryを参照するよう親worktree環境を一時退避する。 */
async function withoutParentGitEnvironment(run: () => Promise<void>): Promise<void> {
  const inherited = new Map(
    inheritedGitVariableKeys.map((key) => [key, process.env[key]] as const),
  );
  for (const key of inheritedGitVariableKeys) Reflect.deleteProperty(process.env, key);
  try {
    await run();
  } finally {
    for (const [key, value] of inherited) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
}

/** 実Git repositoryを一時作成し、callback成否にかかわらず必ず削除する。 */
async function withTemporaryGitRepository(
  run: (repositoryRoot: string, headSha: string) => Promise<void>,
): Promise<void> {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'tsumucode-beta-target-'));
  try {
    await runIsolatedGit(repositoryRoot, ['init', '--quiet']);
    await runIsolatedGit(repositoryRoot, ['config', 'user.name', 'TsumuCode Test']);
    await runIsolatedGit(repositoryRoot, ['config', 'user.email', 'test@tsumucode.invalid']);
    await writeFile(path.join(repositoryRoot, 'fixture.txt'), 'beta target fixture\n');
    await runIsolatedGit(repositoryRoot, ['add', 'fixture.txt']);
    await runIsolatedGit(repositoryRoot, ['commit', '--quiet', '-m', 'fixture']);
    const headSha = await runIsolatedGit(repositoryRoot, ['rev-parse', 'HEAD']);
    await withoutParentGitEnvironment(() => run(repositoryRoot, headSha.trim()));
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

/** 公開後検証APIを遅延解決し、未実装時もVitestのassertionとして失敗させる。 */
async function loadPostDeployValidator(): Promise<
  (source: unknown, release: unknown, actualSha256: string) => void
> {
  const promotionModule: object = await import('../../scripts/release/verifyReleasePromotion');
  const validator: unknown = Reflect.get(promotionModule, 'validatePostDeployVerification');
  expect(validator).toBeTypeOf('function');
  if (typeof validator !== 'function') throw new Error('公開後検証APIが実装されていません');
  return validator as (source: unknown, release: unknown, actualSha256: string) => void;
}

describe('release report', () => {
  it('Artifact hashを固定allowlistのGitHub outputへ変換する', () => {
    expect(formatArtifactHashOutput(hashes)).toBe(
      `artifact_digest=${digest}\ncourse_hash=${'c'.repeat(64)}\nprovenance_hash=${'d'.repeat(64)}\nvisual_baseline_hash=${'e'.repeat(64)}\n`,
    );
  });

  it('全品質suiteをpassとして記録するsummaryを構築する', () => {
    const summary = buildQualitySummary(sha, () => '2026-07-16T00:00:00.000Z');

    expect(summary.verifiedSourceCommit).toBe(sha);
    expect(summary.completedAt).toBe('2026-07-16T00:00:00.000Z');
    expect(summary.suites).toHaveLength(12);
    expect(new Set(summary.suites.map(({ status }) => status))).toEqual(new Set(['pass']));
  });

  it('不正なsource SHAのquality summaryを拒否する', () => {
    expect(() => buildQualitySummary('main')).toThrow();
  });

  it('Deployと品質Artifactを結び付けたimmutable reportを構築する', () => {
    const report = buildReleaseReport({
      sourceSha: sha,
      workflowHeadSha: 'f'.repeat(40),
      releaseMode: 'candidate',
      artifactDigest: digest,
      courseHash: 'c'.repeat(64),
      provenanceHash: 'd'.repeat(64),
      qualityArtifactId: '123',
      qualityArtifactDigest: `sha256:${'e'.repeat(64)}`,
      workflowRunId: '456',
      workflowRunAttempt: '2',
      pageUrl: 'https://example.github.io/tsumucode/',
    });

    expect(report).toContain(`verifiedSourceCommit: \`${sha}\``);
    expect(report).toContain(`canonicalDistSha256: \`${digest}\``);
    expect(report).toContain('pageUrl: https://example.github.io/tsumucode/');
    expect(parseReleaseReport(report)).toMatchObject({
      sourceSha: sha,
      workflowHeadSha: 'f'.repeat(40),
      qualityArtifactId: '123',
      workflowRunAttempt: '2',
    });
    expect(() => parseReleaseReport(`${report}- unknownBinding: \`unsafe\`\n`)).toThrow(/未知/iu);
  });

  it('HTTPSでない公開URLを拒否する', () => {
    expect(() =>
      buildReleaseReport({
        sourceSha: sha,
        workflowHeadSha: 'f'.repeat(40),
        releaseMode: 'candidate',
        artifactDigest: digest,
        courseHash: 'c'.repeat(64),
        provenanceHash: 'd'.repeat(64),
        qualityArtifactId: '123',
        qualityArtifactDigest: `sha256:${'e'.repeat(64)}`,
        workflowRunId: '456',
        workflowRunAttempt: '2',
        pageUrl: 'http://example.com/',
      }),
    ).toThrow(/HTTPS/iu);
  });
});

describe('release target output', () => {
  it('最新mainとcheckoutが一致するSHAだけをbeta targetにする', () => {
    expect(resolveBetaTarget(sha, sha, sha)).toMatchObject({
      checkoutSha: sha,
      verifiedSourceCommit: sha,
      releaseMode: 'beta',
      revision: 'beta',
    });
  });

  it.each([
    ['dispatch', 'b'.repeat(40), sha, sha],
    ['checkout', sha, sha, 'b'.repeat(40)],
  ] as const)('%s SHAが一致しないbeta targetを拒否する', (_label, source, workflow, checkout) => {
    expect(() => resolveBetaTarget(source, workflow, checkout)).toThrow(/beta.*SHA/iu);
  });

  it('改行を含む値をGitHub outputへ書き出さない', () => {
    expect(() =>
      serializeReleaseTargetOutput({
        checkoutSha: sha,
        verifiedSourceCommit: sha,
        releaseMode: 'candidate',
        revision: '2026-07-16.1\ninjected=true',
        canonicalDistSha256: digest,
        courseManifestSha256: 'c'.repeat(64),
        publicProvenanceSha256: 'd'.repeat(64),
      }),
    ).toThrow(/改行/iu);
  });

  it('実Git HEADとsource・workflowが完全一致するとbeta targetを返す', async () => {
    await withTemporaryGitRepository(async (repositoryRoot, headSha) => {
      await expect(
        verifyReleaseTarget({
          repositoryRoot,
          mode: 'beta',
          sourceSha: headSha,
          workflowHeadSha: headSha,
        }),
      ).resolves.toMatchObject({
        checkoutSha: headSha,
        verifiedSourceCommit: headSha,
        releaseMode: 'beta',
      });
    });
  });

  it('実Git HEADだけがsource・workflowと異なるbeta targetを拒否する', async () => {
    await withTemporaryGitRepository(async (repositoryRoot, headSha) => {
      const otherSha = headSha.startsWith('a') ? 'b'.repeat(40) : 'a'.repeat(40);
      await expect(
        verifyReleaseTarget({
          repositoryRoot,
          mode: 'beta',
          sourceSha: otherSha,
          workflowHeadSha: otherSha,
        }),
      ).rejects.toThrow(/checkout SHA.*workflow SHA/iu);
    });
  });

  it('sourceとworkflowが異なるbeta targetを実Git境界でも拒否する', async () => {
    await withTemporaryGitRepository(async (repositoryRoot, headSha) => {
      const otherSha = headSha.startsWith('a') ? 'b'.repeat(40) : 'a'.repeat(40);
      await expect(
        verifyReleaseTarget({
          repositoryRoot,
          mode: 'beta',
          sourceSha: headSha,
          workflowHeadSha: otherSha,
        }),
      ).rejects.toThrow(/source SHA.*workflow SHA/iu);
    });
  });

  it.each(['', 'main', 'g'.repeat(40)])(
    '不正なsource SHA「%s」を実Git境界で拒否する',
    async (sourceSha) => {
      await withTemporaryGitRepository(async (repositoryRoot, headSha) => {
        await expect(
          verifyReleaseTarget({
            repositoryRoot,
            mode: 'beta',
            sourceSha,
            workflowHeadSha: headSha,
          }),
        ).rejects.toThrow();
      });
    },
  );
});

describe('beta release report', () => {
  it('beta Deploy reportをSourceと品質Artifactへ結び付ける', () => {
    const report = buildReleaseReport({
      sourceSha: sha,
      workflowHeadSha: sha,
      releaseMode: 'beta',
      artifactDigest: digest,
      courseHash: 'c'.repeat(64),
      provenanceHash: 'd'.repeat(64),
      qualityArtifactId: '123',
      qualityArtifactDigest: `sha256:${'e'.repeat(64)}`,
      workflowRunId: '456',
      workflowRunAttempt: '1',
      pageUrl: 'https://example.github.io/tsumucode/',
    });

    expect(parseReleaseReport(report)).toMatchObject({
      sourceSha: sha,
      workflowHeadSha: sha,
      releaseMode: 'beta',
    });
  });
});

describe('manual release approval', () => {
  const approvedNoviceRecord = `# 完全初心者Observation

- releaseStatus: \`approved\`
- participantCount: \`1\`
- requiredCheckpoints: \`5\`
- approvedCheckpoints: \`5\`
- guidedProjectStatus: \`passed\`
- capstoneStatus: \`passed\`
- unresolvedFindings: \`0\`
`;

  it('未実施の初心者Observationを拒否する', () => {
    expect(() => {
      validateManualQualityRecord(
        'noviceObservation',
        approvedNoviceRecord.replace('releaseStatus: `approved`', 'releaseStatus: `draft`'),
      );
    }).toThrow(/noviceObservation.*approved/iu);
  });

  it('全Checkpointと2 Projectが完了した初心者Observationを受理する', () => {
    expect(() => {
      validateManualQualityRecord('noviceObservation', approvedNoviceRecord);
    }).not.toThrow();
  });

  it('VoiceOverが初回Release対象外になっていない手動記録を拒否する', () => {
    const accessibility = `# Accessibility Manual Review

- releaseStatus: \`approved\`
- journeyStatus: \`passed\`
- voiceOverStatus: \`pending\`
- unresolvedFindings: \`0\`
- unperformedChecks: \`1\`
`;
    const visual = `# World-A Visual Review

- releaseStatus: \`approved\`
- reviewedScreens: \`20\`
- unresolvedFindings: \`0\`
- finalArtifactReviewed: \`false\`
`;

    expect(() => {
      validateManualQualityRecord('accessibilityManual', accessibility);
    }).toThrow(/voiceOverStatus.*not-required/iu);
    expect(() => {
      validateManualQualityRecord('visualReview', visual);
    }).toThrow(/finalArtifactReviewed.*true/iu);
  });

  it('VoiceOver対象外と必須手動Accessibility条件を満たす記録を受理する', () => {
    const accessibility = `# Accessibility Manual Review

- releaseStatus: \`approved\`
- journeyStatus: \`passed\`
- voiceOverStatus: \`not-required\`
- unresolvedFindings: \`0\`
- unperformedChecks: \`0\`
`;

    expect(() => {
      validateManualQualityRecord('accessibilityManual', accessibility);
    }).not.toThrow();
  });

  it('公開前Checklistを公開後状態と分離し、明示したscopeだけを受理する', () => {
    const preDeployChecklist = `# HTML/CSS初回Release Checklist

- releaseStatus: \`approved\`
- checklistScope: \`pre-deploy\`
- postDeployVerificationPolicy: \`revision-record\`
- automatedGatesStatus: \`passed\`
- manualGatesStatus: \`passed\`
- pendingItems: \`0\`
- failedItems: \`0\`
`;

    expect(() => {
      validateManualQualityRecord('releaseChecklist', preDeployChecklist);
    }).not.toThrow();
    expect(() => {
      validateManualQualityRecord(
        'releaseChecklist',
        preDeployChecklist.replace('- checklistScope: `pre-deploy`\n', ''),
      );
    }).toThrow(/checklistScope.*pre-deploy/iu);
  });

  it('品質記録pathの差し替えをschemaで拒否する', () => {
    const approval = {
      schemaVersion: 1,
      status: 'approved',
      verifiedSourceCommit: sha,
      candidateTreeSha256: digest,
      canonicalDistSha256: digest,
      courseManifestSha256: digest,
      publicProvenanceSha256: digest,
      visualBaselineSha256: digest,
      records: {
        contentReview: { path: 'docs/quality/content-review.yaml', sha256: digest },
        visualReview: { path: 'docs/quality/visual-review.md', sha256: digest },
        accessibilityManual: { path: 'docs/quality/a11y-manual.md', sha256: digest },
        noviceObservation: { path: 'docs/quality/fake.md', sha256: digest },
        releaseChecklist: { path: 'docs/quality/release-checklist.md', sha256: digest },
      },
      approvedBy: 'independent-reviewer',
      approvedAt: '2026-07-16T00:00:00.000Z',
    };

    expect(() => ReleaseApprovalSchema.parse(approval)).toThrow();
  });
});

describe('post-deploy verification', () => {
  const release = {
    revision: '2026-07-16.1',
    tag: 'tsumucode-release-2026-07-16.1',
    sourceCommit: sha,
    workflowHeadCommit: 'f'.repeat(40),
    workflowRunId: '456',
    workflowRunAttempt: 2,
    reportArtifactId: '123',
    reportArtifactDigest: `sha256:${'c'.repeat(64)}`,
    pageUrl: 'https://example.github.io/tsumucode/',
    postDeployVerificationPath: 'docs/quality/post-deploy/2026-07-16.1.yaml',
    postDeployVerificationSha256: '9'.repeat(64),
  };
  const approvedRecord = {
    schemaVersion: 1,
    status: 'approved',
    revision: release.revision,
    tag: release.tag,
    sourceCommit: release.sourceCommit,
    workflowHeadCommit: release.workflowHeadCommit,
    workflowRunId: release.workflowRunId,
    workflowRunAttempt: release.workflowRunAttempt,
    reportArtifactId: release.reportArtifactId,
    reportArtifactDigest: release.reportArtifactDigest,
    pageUrl: release.pageUrl,
    environmentApprovalStatus: 'passed',
    pageVerificationStatus: 'passed',
    reportVerificationStatus: 'passed',
    tagVerificationStatus: 'passed',
    verifiedBy: 'independent-reviewer',
    verifiedAt: '2026-07-16T12:00:00+09:00',
  };

  it('Environment承認・公開URL・Report・tagを実確認した記録を受理する', async () => {
    const validatePostDeployVerification = await loadPostDeployValidator();

    expect(() => {
      validatePostDeployVerification(approvedRecord, release, release.postDeployVerificationSha256);
    }).not.toThrow();
  });

  it('未確認または別Runへ結び付いた公開後記録を拒否する', async () => {
    const validatePostDeployVerification = await loadPostDeployValidator();

    expect(() => {
      validatePostDeployVerification(
        { ...approvedRecord, pageVerificationStatus: 'pending' },
        release,
        release.postDeployVerificationSha256,
      );
    }).toThrow(/公開後検証.*承認済み/iu);
    expect(() => {
      validatePostDeployVerification(
        { ...approvedRecord, workflowRunId: '999' },
        release,
        release.postDeployVerificationSha256,
      );
    }).toThrow(/workflowRunId/iu);
  });

  it('revision別の不変pathまたは公開台帳hashと一致しない記録を拒否する', async () => {
    const validatePostDeployVerification = await loadPostDeployValidator();

    expect(() => {
      validatePostDeployVerification(
        approvedRecord,
        { ...release, postDeployVerificationPath: 'docs/quality/post-deploy/latest.yaml' },
        release.postDeployVerificationSha256,
      );
    }).toThrow(/path/iu);
    expect(() => {
      validatePostDeployVerification(approvedRecord, release, '8'.repeat(64));
    }).toThrow(/SHA-256/iu);
  });
});
