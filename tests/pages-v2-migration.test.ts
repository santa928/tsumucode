// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
interface Step {
  name?: string;
  run?: string;
  uses?: string;
  id?: string;
  if?: string;
  with?: Record<string, unknown>;
}
interface Job {
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  steps?: Step[];
}
const read = () =>
  parse(readFileSync('.github/workflows/pages.yml', 'utf8')) as {
    jobs: Record<string, Job>;
    on: Record<string, { inputs?: Record<string, unknown> }>;
  };
describe('staged same-run candidate migration', () => {
  it('exposes a main-only non-deploying build, then binds the actual uploaded artifact ID', () => {
    const workflow = read(),
      build = workflow.jobs.build;
    expect(workflow.on.workflow_dispatch?.inputs).toHaveProperty('migration_checks');
    expect(build?.if).toContain("github.ref == 'refs/heads/main'");
    expect(build?.if).toContain('inputs.deploy != true');
    expect(build?.permissions).toEqual({ contents: 'read' });
    const steps = build!.steps!;
    const commands = steps.map(({ run }) => run ?? '').join('\n');
    expect(commands.match(/npm run build:app/gu)).toHaveLength(1);
    expect(commands).toContain('release:flow -- freeze');
    expect(commands).toContain('release:flow -- candidate');
    const upload = steps.findIndex(({ id }) => id === 'candidate_files');
    const candidate = steps.findIndex(
      ({ name }) => name === 'Bind uploaded candidate to frozen checks',
    );
    expect(upload).toBeGreaterThan(-1);
    expect(candidate).toBeGreaterThan(upload);
    expect(steps[candidate]?.run).toContain('"$ARTIFACT_ID"');
    expect(steps.some(({ uses }) => uses?.includes('deploy-pages'))).toBe(false);
    expect(steps.some(({ uses }) => uses?.includes('upload-pages-artifact'))).toBe(false);
  });
  it('rejects mixed migration/deployment intent before either path starts', () => {
    const guard = read().jobs.resolve!.steps!.find(
      ({ name }) => name === 'Reject mixed migration and deploy modes',
    );
    expect(guard?.if).toContain('inputs.migration_checks == true');
    expect(guard?.if).toContain('inputs.deploy == true');
    expect(guard?.run).toBe('exit 1');
  });
});
