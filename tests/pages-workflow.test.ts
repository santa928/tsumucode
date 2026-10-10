// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowUrl = new URL('../.github/workflows/pages.yml', import.meta.url);

interface WorkflowStep {
  readonly id?: string;
  readonly 'continue-on-error'?: boolean;
  readonly if?: string;
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly if?: string;
  readonly needs?: readonly string[];
  readonly permissions?: Readonly<Record<string, string>>;
  readonly environment?: Readonly<Record<string, unknown>>;
  readonly steps?: readonly WorkflowStep[];
}

interface PagesWorkflow {
  readonly name?: string;
  readonly on?: Readonly<Record<string, unknown>>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly jobs?: Readonly<Record<string, WorkflowJob>>;
}

/** Pages WorkflowをYAMLとして読み、型付きの検査対象へ変換する。 */
function workflow(): { readonly source: string; readonly parsed: PagesWorkflow } {
  const source = readFileSync(workflowUrl, 'utf8');
  return { source, parsed: parse(source) as PagesWorkflow };
}

describe('TsumuCode Pages workflow', () => {
  it('新規checkoutのTS・React・Next承認検証にはcontent生成を先に成功させる', () => {
    const steps = workflow().parsed.jobs?.resolve?.steps ?? [];
    const compile = steps.find(
      ({ name }) => name === 'Compile selected candidate content for source review',
    );
    const resolve = steps.find(
      ({ name }) => name === 'Resolve candidate, beta, or registered rollback',
    );
    expect(compile).toBeDefined();
    expect(resolve).toBeDefined();
    expect(steps.indexOf(compile!)).toBeLessThan(steps.indexOf(resolve!));
    expect(compile?.if).toBe(
      `${resolve?.if ?? ''} && (inputs.course_id == 'typescript' || inputs.course_id == 'react' || inputs.course_id == 'next')`,
    );
    expect(compile?.run).toBe('./scripts/docker-compose.sh run --rm app npm run content:compile');
    expect(compile?.['continue-on-error']).not.toBe(true);
  });

  it('同じRelease buildのbundle/static失敗を全Browser開始前に返す', () => {
    const steps = workflow().parsed.jobs?.quality?.steps ?? [];
    const index = (name: string) => steps.findIndex((step) => step.name === name);
    const bundle = index('Bundle artifact preflight');
    const artifact = index('Static artifact gate');
    expect(bundle).toBeGreaterThan(index('Release quality'));
    expect(artifact).toBeGreaterThan(bundle);
    for (const name of [
      'Chromium full and cross-browser smoke',
      'Performance budgets',
      'Lighthouse budgets',
    ]) {
      expect(index(name)).toBeGreaterThan(artifact);
    }
    for (const step of steps.slice(bundle, artifact + 1)) {
      expect(step.if).toBeUndefined();
      expect(step['continue-on-error']).not.toBe(true);
    }
    expect(steps[bundle]?.run).toContain('npm run test:bundle');
    expect(steps[artifact]?.run).toContain('release:check -- --course-id "$RELEASE_COURSE_ID"');
    expect(steps[index('Performance budgets')]?.run).toContain('test:performance:browser');
    expect(
      steps.slice(bundle + 1).some(({ run }) => /npm run (build|check:release)/u.test(run ?? '')),
    ).toBe(false);
    const { scripts } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(scripts['test:performance']).toBe(
      'npm run test:bundle && npm run test:performance:browser',
    );
    expect(scripts['test:bundle']).toBe('vitest run --config vitest.bundle.config.ts');
    expect(scripts['test:performance:browser']).toBe(
      'playwright test --config=playwright.performance.config.ts',
    );
  });
  it('教材承認待ちは通常の動作検証を止めず、公開前には必須として検査する', () => {
    const { scripts } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    const jobs = workflow().parsed.jobs;
    const steps = jobs?.fast?.steps ?? [];
    const review = steps.find(({ run }) => run?.endsWith('npm run content:review'));
    const check = steps.find(({ run }) => run?.endsWith('npm run check'));
    const release = jobs?.quality?.steps?.find(({ run }) => run?.endsWith('npm run check:release'));

    expect(scripts['check']).not.toContain('content:review');
    expect(scripts['check:release']).toContain('npm run content:review &&');
    expect(check).toBeDefined();
    expect(check?.['continue-on-error']).not.toBe(true);
    expect(review?.['continue-on-error']).toBe(true);
    expect(steps.indexOf(review!)).toBeGreaterThan(steps.indexOf(check!));
    expect(
      steps.some(
        ({ if: condition, run }) =>
          condition === `steps.${review?.id ?? ''}.outcome == 'failure'` &&
          run?.includes('::warning::') &&
          run.includes('$GITHUB_STEP_SUMMARY'),
      ),
    ).toBe(true);
    expect(release).toBeDefined();
    expect(release?.['continue-on-error']).not.toBe(true);
  });

  it('失敗診断を成功Evidenceと分離し、失敗したqualityからDeployへ進めない', () => {
    const jobs = workflow().parsed.jobs;
    const steps = jobs?.quality?.steps ?? [];
    const diagnostics = steps.find(({ name }) => name === 'Upload failure diagnostics');
    const preparation = steps.find(({ name }) => name === 'Prepare failure diagnostics');

    expect(preparation?.if).toBe('failure()');
    expect(diagnostics?.if).toBe('failure()');
    expect(diagnostics?.with?.['name']).toContain('failure-diagnostics-');
    expect(diagnostics?.with?.['path']).toBe(
      'failure-source-identity.txt\nplaywright-report\nplaywright-performance-report\ntest-results\nlhci-report\n',
    );
    expect(diagnostics?.with?.['retention-days']).toBe(7);
    expect(diagnostics?.with?.['if-no-files-found']).toBe('warn');
    expect(jobs?.deploy?.needs).toEqual(['resolve', 'quality']);
    expect(jobs?.deploy?.if).not.toMatch(/always\(|failure\(/u);
    expect(steps.find(({ name }) => name === 'Upload quality evidence')?.if).toBeUndefined();
  });

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
    expect(parsed.jobs?.deploy?.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(parsed.jobs?.deploy?.if).toContain('inputs.deploy == true');
    expect(parsed.jobs?.deploy?.if).toContain("github.ref == 'refs/heads/main'");
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

  it('betaは公開前Gateを共有し正式Approvalとtag記録だけを実行しない', () => {
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

  it('fast検証はRelease専用のBrowser・性能・Evidence生成を実行しない', () => {
    const parsed = workflow().parsed;
    const fast = parsed.jobs?.fast;
    const source = (fast?.steps ?? []).map(({ run }) => run ?? '').join('\n');

    expect(fast?.if).toContain("github.event_name == 'push'");
    expect(fast?.if).toContain("github.event_name == 'pull_request'");
    expect(parsed.jobs?.quality?.if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.deploy == true && github.ref == 'refs/heads/main'",
    );
    expect(source).toContain('npm run check');
    expect(source).toContain('-e TEST_BASE_SHA');
    expect(source).not.toContain('npm run test:e2e');
    expect(source).not.toContain('npm run test:performance');
    expect(source).not.toContain('npm run test:lighthouse');
    expect(source).not.toContain('release:report');
  });

  it('既定権限をread-onlyにしRelease tag jobだけcontents writeを持つ', () => {
    const parsed = workflow().parsed;

    expect(parsed.permissions).toEqual({ contents: 'read' });
    expect(parsed.jobs?.record_release?.permissions).toEqual({ contents: 'write' });
    for (const [name, job] of Object.entries(parsed.jobs ?? {})) {
      if (name !== 'record_release') expect(job.permissions?.contents).not.toBe('write');
    }
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

  it('Docker生成Evidenceのpermissionを存在確認とuploadより先に読み取り可能へ正規化する', () => {
    const { source } = workflow();
    const normalizationIndex = source.indexOf('- name: Normalize quality evidence permissions');
    const verificationIndex = source.indexOf('- name: Verify required quality evidence');
    const uploadIndex = source.indexOf('- name: Upload quality evidence');
    const normalizationStep = source.slice(normalizationIndex, verificationIndex);

    expect(normalizationIndex).toBeGreaterThan(0);
    expect(verificationIndex).toBeGreaterThan(normalizationIndex);
    expect(uploadIndex).toBeGreaterThan(verificationIndex);
    expect(normalizationStep).toContain('./scripts/docker-compose.sh run --rm app chmod -R a+rX');
    for (const path of [
      '/workspace/release-quality.json',
      '/workspace/playwright-report',
      '/workspace/playwright-performance-report',
      '/workspace/test-results',
      '/workspace/lhci-report',
    ]) {
      expect(normalizationStep).toContain(path);
    }
  });

  it('全品質Gate、Artifact binding、監査Report、annotated tagを順に持つ', () => {
    const { source } = workflow();
    for (const command of [
      'content:provenance',
      'release:continuity',
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
    const stepEnd = source.indexOf('- name: Content provenance', stepStart);
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
