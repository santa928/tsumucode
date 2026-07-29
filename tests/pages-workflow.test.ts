// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowUrl = new URL('../.github/workflows/pages.yml', import.meta.url);

interface WorkflowStep {
  readonly if?: string;
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly if?: string;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly environment?: Readonly<Record<string, unknown>>;
  readonly steps?: readonly WorkflowStep[];
}

interface PagesWorkflow {
  readonly name?: string;
  readonly on?: Readonly<Record<string, unknown>>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly concurrency?: Readonly<Record<string, unknown>>;
  readonly jobs?: Readonly<Record<string, WorkflowJob>>;
}

/** Pages WorkflowをYAMLとして読み、型付きの検査対象へ変換する。 */
function workflow(): { readonly source: string; readonly parsed: PagesWorkflow } {
  const source = readFileSync(workflowUrl, 'utf8');
  return { source, parsed: parse(source) as PagesWorkflow };
}

describe('TsumuCode Pages workflow', () => {
  it('pushとPRは品質検査だけ、明示dispatchだけをDeploy候補にする', () => {
    const { parsed } = workflow();

    expect(parsed.on).toHaveProperty('push.branches', ['main']);
    expect(parsed.on).toHaveProperty('pull_request.branches', ['main']);
    expect(parsed.on).toHaveProperty('workflow_dispatch.inputs.deploy.type', 'boolean');
    expect(parsed.on).toHaveProperty('workflow_dispatch.inputs.release_mode.options', [
      'candidate',
      'beta',
      'rollback',
    ]);
    expect(parsed.on).toHaveProperty(
      'workflow_dispatch.inputs.source_sha.description',
      'candidate承認、身内向けβ、または公開済みReleaseに登録された40文字SHA',
    );
    expect(parsed.jobs?.deploy?.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(parsed.jobs?.deploy?.if).toContain('inputs.deploy == true');
    expect(parsed.jobs?.deploy?.if).toContain("github.ref == 'refs/heads/main'");
  });

  it('release targetの解決step名にcandidate、beta、rollbackを明示する', () => {
    const targetResolver = workflow().parsed.jobs?.resolve?.steps?.find(({ run }) =>
      run?.includes('npm run release:target'),
    );

    expect(targetResolver?.name).toBe('Resolve candidate, beta, or registered rollback');
  });

  it('Deploy jobを保護Environmentと最小権限のdeploy-pages 1 stepへ限定する', () => {
    const deploy = workflow().parsed.jobs?.deploy;

    expect(deploy?.environment).toHaveProperty('name', 'github-pages');
    expect(deploy?.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
    expect(deploy?.steps).toHaveLength(1);
    expect(deploy?.steps?.[0]?.uses).toBe(
      'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128',
    );
  });

  it('betaは全品質Gateを共有し正式Approvalとtag記録だけを実行しない', () => {
    const { parsed, source } = workflow();
    const qualitySteps = parsed.jobs?.quality?.steps ?? [];
    const betaContinuity = qualitySteps.find(
      ({ name }) => name === 'Release continuity for beta deploy',
    );
    const candidateBinding = qualitySteps.find(
      ({ name }) => name === 'Bind candidate Artifact to approval',
    );

    expect(betaContinuity?.if).toContain("needs.resolve.outputs.release_mode == 'beta'");
    expect(betaContinuity?.run).toContain('release:continuity -- --quality-only');
    expect(candidateBinding?.if).toBe("needs.resolve.outputs.release_mode == 'candidate'");
    expect(parsed.jobs?.record_release?.if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.deploy == true && inputs.release_mode == 'candidate' && github.ref == 'refs/heads/main'",
    );
    expect(source).toContain('npm run test:e2e');
    expect(source).toContain('npm run test:performance');
    expect(source).toContain('npm run test:lighthouse');
  });

  it('既定権限をread-onlyにしRelease tag jobだけcontents writeを持つ', () => {
    const parsed = workflow().parsed;

    expect(parsed.permissions).toEqual({ contents: 'read' });
    expect(parsed.jobs?.record_release?.permissions).toEqual({ contents: 'write' });
    for (const [name, job] of Object.entries(parsed.jobs ?? {})) {
      if (name !== 'record_release') expect(job.permissions?.contents).not.toBe('write');
    }
    expect(parsed.concurrency).toEqual({ group: 'pages', 'cancel-in-progress': false });
  });

  it('すべての外部Actionを実在確認済み40文字commit SHAへ固定する', () => {
    const { source } = workflow();
    const references = [...source.matchAll(/^\s*uses:\s+([^\s]+)$/gmu)].map((match) => match[1]);

    expect(references.length).toBeGreaterThanOrEqual(5);
    for (const reference of references) expect(reference).toMatch(/^[^@]+@[a-f0-9]{40}$/u);
  });

  it('dispatch入力をrunへ直接展開せずenv経由で引用する', () => {
    const jobs = Object.values(workflow().parsed.jobs ?? {});
    const runScripts = jobs.flatMap(({ steps = [] }) =>
      steps.flatMap(({ run }) => (run === undefined ? [] : [run])),
    );

    expect(runScripts.join('\n')).not.toContain('${{ inputs.');
  });

  it('mainとlinked worktreeを自動判定するDocker wrapperだけを使う', () => {
    const { source } = workflow();

    expect(source).toContain('./scripts/docker-compose.sh');
    expect(source).not.toMatch(/(^|\s)docker compose(?:\s|$)/u);
  });

  it('fresh checkoutでは教材Reviewより先にCourse ManifestをCompileする', () => {
    const { source } = workflow();
    const compileIndex = source.indexOf('- name: Content compile');
    const reviewIndex = source.indexOf('- name: Independent lesson review');

    expect(compileIndex).toBeGreaterThan(0);
    expect(reviewIndex).toBeGreaterThan(compileIndex);
  });

  it('upload-artifactの生digestを台帳用sha256 prefix付き正規形へ変換する', () => {
    const { source } = workflow();

    expect(source).toContain(
      'QUALITY_ARTIFACT_DIGEST: sha256:${{ needs.quality.outputs.quality_evidence_digest }}',
    );
    expect(source).toContain(
      'REPORT_ARTIFACT_DIGEST: sha256:${{ needs.report.outputs.report_artifact_digest }}',
    );
    expect(source).toContain('head=$WORKFLOW_HEAD_SHA');
    expect(source).toContain('quality_id=$QUALITY_ARTIFACT_ID');
    expect(source).toContain('page_url=$PAGE_URL');
  });

  it('品質Evidenceの各必須File/Directoryをupload前に非空確認する', () => {
    const { source } = workflow();
    const verificationIndex = source.indexOf('- name: Verify required quality evidence');
    const uploadIndex = source.indexOf('- name: Upload quality evidence');

    expect(verificationIndex).toBeGreaterThan(0);
    expect(uploadIndex).toBeGreaterThan(verificationIndex);
    expect(source).toContain('test -s release-quality.json');
    for (const directory of [
      'playwright-report',
      'playwright-performance-report',
      'test-results',
      'lhci-report',
    ]) {
      expect(source).toContain(`test -n "$(find ${directory} -type f -print -quit)"`);
    }
  });

  it('全品質Gate、Artifact binding、監査Report、annotated tagを順に持つ', () => {
    const { source, parsed } = workflow();

    expect(Object.keys(parsed.jobs ?? {})).toEqual([
      'resolve',
      'quality',
      'deploy',
      'report',
      'record_release',
    ]);
    for (const command of [
      'content:provenance',
      'content:review',
      'content:compile',
      'release:continuity',
      'npm run lint',
      'npm run typecheck',
      'npm run test:run',
      'npm run build',
      'npm run test:e2e',
      'npm run test:performance',
      'npm run test:lighthouse',
      'release:check',
      'release:report',
    ]) {
      expect(source).toContain(command);
    }
    expect(source).toContain('refs/tags/$TAG_NAME');
    expect(source).toContain('type:"commit"');
  });

  it('candidate Product差分から旧Bundle fixtureを除外しない', () => {
    const { source } = workflow();
    const stepStart = source.indexOf('- name: Confirm candidate Product tree is unchanged');
    const stepEnd = source.indexOf('- name: Content provenance');
    const candidateDiffStep = source.slice(stepStart, stepEnd);

    expect(stepStart).toBeGreaterThan(0);
    expect(stepEnd).toBeGreaterThan(stepStart);
    expect(candidateDiffStep).not.toContain(
      ':(exclude)tests/fixtures/progress/previous-release-bundle.json',
    );
  });

  it('既存tagを新しいRun evidenceで成功扱いせず元Runからの回復を案内する', () => {
    const recordStep = workflow().parsed.jobs?.record_release?.steps?.find(
      ({ name }) => name === 'Create annotated release tag without checkout',
    );

    expect(recordStep?.run).toContain('元RunのRelease Reportからpromotionしてください');
    expect(recordStep?.run).not.toContain('existing-tag.json');
    expect(recordStep?.run).not.toMatch(/existing-ref\.json[\s\S]*exit 0/u);
  });
});
