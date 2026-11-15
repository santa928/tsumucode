import { parseDocument } from 'yaml';
import { z } from 'zod';
import { normalizedCallerDigest } from './callerNormalization';

const record = (value: unknown) => z.record(z.string(), z.unknown()).parse(value);
const equalNeeds = (value: unknown, required: string[]) => {
  const values = typeof value === 'string' ? [value] : z.array(z.string()).parse(value);
  return values.length === required.length && new Set(values).size === values.length &&
    required.every((name) => values.includes(name));
};
function readWorkflow(bytes: Uint8Array) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > 512 * 1024)
    throw new Error('Invalid workflow bytes');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.includes('\uFEFF') || text.includes('\r')) throw new Error('Invalid workflow encoding');
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) throw new Error('Invalid workflow YAML');
  return record(document.toJS({ maxAliasCount: 0 }));
}

/** Structural inspection only; caller/qualification bytes and runtime provenance need separate authentication. */
export function assertSignerTopology(caller: Uint8Array, checks: Uint8Array, signerCommit: string) {
  normalizedCallerDigest(caller, signerCommit);
  const callerWorkflow = readWorkflow(caller);
  const callerJobs = record(callerWorkflow.jobs);
  const qualification = record(callerJobs.qualification);
  const publication = record(callerJobs.publish);
  const signer = record(callerJobs.signer);
  const parent = record(callerJobs.parent_producer);
  const observation = record(callerJobs.parent_observation);
  const observationPermissions = record(observation.permissions);
  const observationSteps = z.array(z.unknown()).parse(observation.steps).map(record);
  const parentOutputs = record(parent.outputs);
  const parentPermissions = record(parent.permissions);
  const parentSteps = z.array(z.unknown()).parse(parent.steps).map(record);
  const emit = parentSteps.filter((step) => step.id === 'emit');
  const first = parentSteps[0];
  if (parent.name !== 'parent_producer' || parent.if !== '${{ false }}' || !equalNeeds(parent.needs, ['resolve']) ||
      parent['runs-on'] !== 'ubuntu-24.04' || Object.hasOwn(parent, 'continue-on-error') ||
      Object.hasOwn(parent, 'defaults') || Object.hasOwn(parent, 'env') ||
      Object.keys(parentPermissions).length !== 2 || parentPermissions.contents !== 'read' || parentPermissions.actions !== 'read' ||
      Object.keys(parentOutputs).length !== 2 ||
      parentOutputs.evidenceBase64 !== '${{ steps.emit.outputs.evidenceBase64 }}' ||
      parentOutputs.evidenceSha256 !== '${{ steps.emit.outputs.evidenceSha256 }}' ||
      !first || first.run !== 'exit 1' || Object.keys(first).length !== 1 || Object.hasOwn(first, 'if') ||
      Object.hasOwn(first, 'continue-on-error') || emit.length !== 1 ||
      emit[0]?.if !== "${{ success() && steps.observe.outcome == 'success' }}" ||
      Object.hasOwn(emit[0], 'continue-on-error'))
    throw new Error('Disabled parent producer topology differs');
  // This is a disabled contract only: no observer implementation or digest provenance exists yet.
  if (observation.name !== 'parent_observation' || observation.if !== '${{ false }}' ||
      !equalNeeds(observation.needs, ['resolve', 'parent_producer', 'build', 'qualification']) ||
      observation['runs-on'] !== 'ubuntu-24.04' || Object.hasOwn(observation, 'continue-on-error') ||
      Object.hasOwn(callerWorkflow, 'defaults') || Object.hasOwn(callerWorkflow, 'env') ||
      Object.hasOwn(observation, 'defaults') || Object.hasOwn(observation, 'env') ||
      Object.hasOwn(observation, 'outputs') || Object.keys(observationPermissions).length !== 2 ||
      observationPermissions.contents !== 'read' || observationPermissions.actions !== 'read' ||
      observationSteps.length !== 1 || observationSteps[0]?.run !== 'exit 1' ||
      Object.keys(observationSteps[0]!).length !== 1)
    throw new Error('Disabled parent observation topology differs');
  const expectedBuild = {
    candidate_artifact_id: '${{ needs.build.outputs.candidate_artifact_id }}',
    metadata_artifact_id: '${{ needs.build.outputs.metadata_artifact_id }}',
  };
  const expectedQualification = {
    qualification_artifact_id: '${{ needs.qualification.outputs.qualification_artifact_id }}',
    qualification_sha256: '${{ needs.qualification.outputs.qualification_sha256 }}',
  };
  const expectInputs = (actual: unknown, expected: Record<string, string>) => {
    const value = record(actual);
    if (Object.keys(value).length !== Object.keys(expected).length)
      throw new Error('Unexpected workflow inputs');
    for (const [name, expression] of Object.entries(expected))
      if (value[name] !== expression) throw new Error('Workflow input wiring differs');
  };
  if (
    qualification.uses !== './.github/workflows/release-v2-checks.yml' ||
    !equalNeeds(qualification.needs, ['build']) ||
    publication.uses !== './.github/workflows/release-v2-publish.yml' ||
    !equalNeeds(publication.needs, ['build', 'qualification', 'parent_observation']) ||
    publication.if !== "success() && needs.parent_observation.result == 'success'" ||
    Object.hasOwn(publication, 'continue-on-error') ||
    signer.uses !== `santa928/tsumucode/.github/workflows/release-v2-lineage-sign.yml@${signerCommit}` ||
    Object.hasOwn(signer, 'secrets') ||
    !equalNeeds(signer.needs, ['build', 'qualification', 'publish', 'parent_producer']) ||
    signer.if !== "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && needs.publish.outputs.record_state == 'verified' && needs.parent_producer.result == 'success'"
  ) throw new Error('Signer workflow job wiring differs');
  expectInputs(qualification.with, expectedBuild);
  expectInputs(publication.with, { ...expectedBuild, ...expectedQualification });
  expectInputs(signer.with, {
    ...expectedBuild, ...expectedQualification,
    parent_evidence_base64: '${{ needs.parent_producer.outputs.evidenceBase64 }}',
    parent_evidence_sha256: '${{ needs.parent_producer.outputs.evidenceSha256 }}', record_tag: '${{ needs.publish.outputs.record_tag }}',
    report_artifact_id: '${{ needs.publish.outputs.report_artifact_id }}',
    record_plan_sha256: '${{ needs.publish.outputs.record_plan_sha256 }}',
    public_smoke_sha256: '${{ needs.publish.outputs.public_smoke_sha256 }}',
    public_operations_sha256: '${{ needs.publish.outputs.public_operations_sha256 }}',
  });
  const workflow = readWorkflow(checks);
  const outputs = record(record(record(workflow.on).workflow_call).outputs);
  const aggregate = record(record(workflow.jobs).aggregate);
  const pythonFixtures = record(record(workflow.jobs).python_fixtures);
  const pythonFixturesPermissions = record(pythonFixtures.permissions);
  if (
    Object.keys(pythonFixtures).length !== 3 ||
    pythonFixtures.uses !== './.github/workflows/python-fixtures.yml' ||
    Object.keys(pythonFixturesPermissions).length !== 1 ||
    pythonFixturesPermissions.contents !== 'read'
  ) throw new Error('Python fixtures job wiring differs');
  expectInputs(pythonFixtures.with, {
    candidate_artifact_id: '${{ inputs.candidate_artifact_id }}',
    metadata_artifact_id: '${{ inputs.metadata_artifact_id }}',
  });
  const aggregateOutputs = record(aggregate.outputs);
  const steps = z.array(z.unknown()).parse(aggregate.steps).map(record);
  const uploads = steps.filter((step) => step.id === 'qualification_artifact');
  const qualifies = steps.filter((step) => step.name === 'Re-read actual main and deployed parent before admission');
  const digests = steps.filter((step) => step.id === 'qualification_digest');
  const artifactName = 'qualification-${{ github.run_id }}-${{ github.run_attempt }}';
  const sameName = steps.filter((step) => {
    const value = step.with;
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      (value as Record<string, unknown>).name === artifactName;
  });
  const expectedDigestRun = 'digest="$(sha256sum .release-v2/qualification.json)"\necho "sha256=${digest%% *}" >> "$GITHUB_OUTPUT"\n';
  const expectedRun = './scripts/docker-compose.sh run --rm -e BASE_PATH -e RELEASE_V2_NEEDS -e GITHUB_REPOSITORY -e GITHUB_RUN_ID -e GITHUB_JOB -e GITHUB_RUN_ATTEMPT -e GITHUB_SHA -e GITHUB_EVENT_NAME -e GITHUB_REF app npm run release:flow -- qualify --output .release-v2/qualification.json';
  const hasConditional = (step: Record<string, unknown>) => Object.hasOwn(step, 'if') || Object.hasOwn(step, 'continue-on-error');

  const outputFile = uploads.length === 1 ? record(uploads[0]!.with) : {};
  if (
    record(outputs.qualification_artifact_id).value !== '${{ jobs.aggregate.outputs.qualification_artifact_id }}' ||
    record(outputs.qualification_sha256).value !== '${{ jobs.aggregate.outputs.qualification_sha256 }}' ||
    aggregateOutputs.qualification_artifact_id !== "${{ steps.qualification_artifact.outputs['artifact-id'] }}" ||
    aggregateOutputs.qualification_sha256 !== '${{ steps.qualification_digest.outputs.sha256 }}' ||
    !equalNeeds(aggregate.needs, ['unit', 'boundary', 'python_fixtures', 'browser', 'public_boundary', 'performance']) ||
    record(aggregate.env).RELEASE_V2_NEEDS !== '${{ toJSON(needs) }}' ||
    qualifies.length !== 1 || qualifies[0]!.run !== expectedRun || hasConditional(qualifies[0]!) ||
    Object.keys(qualifies[0]!).length !== 2 ||
    digests.length !== 1 || digests[0]!.run !== expectedDigestRun || hasConditional(digests[0]!) ||
    sameName.length !== 1 || sameName[0] !== uploads[0] ||
    uploads.length !== 1 || hasConditional(uploads[0]!) ||
    steps.indexOf(qualifies[0]!) >= steps.indexOf(digests[0]!) ||
    steps.indexOf(digests[0]!) >= steps.indexOf(uploads[0]!) ||
    uploads[0]!.uses !== 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a' ||
    outputFile.path !== '.release-v2/qualification.json' ||
    outputFile.name !== artifactName ||
    outputFile['if-no-files-found'] !== 'error'
  ) throw new Error('Qualification artifact producer wiring differs');
}
