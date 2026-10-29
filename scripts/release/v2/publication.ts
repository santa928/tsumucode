import { z } from 'zod';
import { verifyPublishedOperationsReceipt } from './publishedOperations';
import { QualificationSchema } from './admission';
import { AppRecordSchema } from './appRecord';
import { ArtifactManifestSchema, hashBytes, hashValue } from './identity';
import { BuildIdentitySchema, CommitSchema, DigestSchema, InventorySchema } from './schema';
const ActualSchema = z
  .object({
    repository: BuildIdentitySchema.shape.repository,
    deploymentId: z.string().regex(/^[1-9]\d*$/u),
    workflowHeadCommit: CommitSchema,
    runId: BuildIdentitySchema.shape.runId,
    siteUrl: z.url(),
  })
  .strict();
const SmokeSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.literal('passed'),
    candidateDigest: DigestSchema,
    artifactDigest: DigestSchema,
    actual: ActualSchema,
    checkedFiles: z.number().int().positive(),
    observedAt: z.iso.datetime(),
  })
  .strict();
function deploymentFor(candidate: z.infer<typeof BuildIdentitySchema>, input: unknown) {
  const actual = ActualSchema.parse(input);
  const owner = candidate.repository.split('/')[0]!;
  const base = candidate.recipe.basePath;
  if (
    !/^\/(?:[A-Za-z0-9._-]+\/)*$/u.test(base) ||
    base.split('/').some((part) => part === '.' || part === '..')
  )
    throw Error('Unsafe public base path');
  const siteUrl = new URL('https://' + owner + '.github.io' + base).href;
  if (
    actual.repository !== candidate.repository ||
    actual.runId !== candidate.runId ||
    new URL(actual.siteUrl).href !== siteUrl
  )
    throw Error('Actual deployment belongs to another candidate or site');
  return actual;
}
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}
/** Trusted caller reads actual Pages API state; check the whole deployed byte tree, then read it again.
 * This proves deployment bytes only. It cannot replace admission, UI observation or Native acceptance. */
export async function verifyPublicDeployment(
  candidateInput: unknown,
  artifactInput: unknown,
  readActual: () => Promise<unknown>,
  readPublicFile: (relative: string) => Promise<Uint8Array>,
  observedAt: string,
) {
  const candidate = BuildIdentitySchema.parse(candidateInput),
    artifact = ArtifactManifestSchema.parse(artifactInput);
  if (artifact.digest !== candidate.artifactDigest) throw Error('Different published artifact');
  for (const file of artifact.files)
    if (
      file.path.startsWith('/') ||
      file.path.includes('\\') ||
      file.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      /[?#]/u.test(file.path) ||
      hasControlCharacter(file.path)
    )
      throw Error('Unsafe public file path');
  const actual = deploymentFor(candidate, await readActual());
  let index = 0;
  const completion = await Promise.allSettled(
    Array.from({ length: Math.min(4, artifact.files.length) }, async () => {
      while (index < artifact.files.length) {
        const file = artifact.files[index++]!;
        const bytes = await readPublicFile(file.path);
        if (bytes.length !== file.bytes || hashBytes(bytes) !== file.sha256)
          throw Error('Published bytes differ: ' + file.path);
      }
    }),
  );
  const failed = completion.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  if (hashValue(actual) !== hashValue(deploymentFor(candidate, await readActual())))
    throw Error('Deployment moved during public verification');
  return SmokeSchema.parse({
    schemaVersion: 1,
    status: 'passed',
    candidateDigest: hashValue(candidate),
    artifactDigest: artifact.digest,
    actual,
    checkedFiles: artifact.files.length,
    observedAt,
  });
}
/** The qualification is downloaded from the pinned trusted same-run aggregate, never a review claim.
 * Call after a fresh actual-deployment read. This creates sanitized metadata and performs no write. */
export function createVerifiedAppRecord(
  candidateInput: unknown,
  snapshotInput: unknown,
  qualificationInput: unknown,
  smokeInput: unknown,
  actualInput: unknown,
  observedAt: string,
  operationsInput?: unknown,
) {
  const candidate = BuildIdentitySchema.parse(candidateInput),
    actual = deploymentFor(candidate, actualInput);
  const snapshot = z
    .object({ inventory: InventorySchema, publicContent: ArtifactManifestSchema })
    .strict()
    .parse(snapshotInput);
  const qualification = QualificationSchema.parse(qualificationInput),
    smoke = SmokeSchema.parse(smokeInput);
  if (operationsInput === undefined)
    throw Error('Required public operation observation is missing');
  const operations = verifyPublishedOperationsReceipt(
    candidate,
    snapshot.inventory,
    actual,
    operationsInput,
    observedAt,
  );
  const now = Date.parse(z.iso.datetime().parse(observedAt));
  if (
    qualification.candidateDigest !== hashValue(candidate) ||
    qualification.technical.candidateDigest !== hashValue(candidate) ||
    qualification.technical.buildAttempt !== candidate.buildAttempt ||
    smoke.candidateDigest !== hashValue(candidate) ||
    smoke.artifactDigest !== candidate.artifactDigest ||
    hashValue(smoke.actual) !== hashValue(actual) ||
    Date.parse(qualification.qualifiedAt) > Date.parse(smoke.observedAt) ||
    Date.parse(qualification.qualifiedAt) > Date.parse(operations.observedAt) ||
    Date.parse(smoke.observedAt) > now ||
    Date.parse(qualification.technical.expiresAt) <= now
  )
    throw Error('Unbound or stale deployment record input');
  return AppRecordSchema.parse({
    schemaVersion: 2,
    repository: candidate.repository,
    workflowHeadCommit: actual.workflowHeadCommit,
    candidate,
    deploymentId: actual.deploymentId,
    siteUrl: actual.siteUrl,
    publicContentDigest: snapshot.publicContent.digest,
    inventoryDigest: hashValue(snapshot.inventory),
    state: 'verified',
    qualificationDigest: hashValue(qualification),
    smokeDigest: hashValue({ bytes: smoke, operations }),
    observedAt,
  });
}
/** Bookkeeping recovery is idempotent and never deploys, rolls back, deletes data or moves a tag. */
export function planAppRecordRecovery(
  recordInput: unknown,
  actualInput: unknown,
  existingInput: unknown,
) {
  const record = AppRecordSchema.parse(recordInput),
    actual = deploymentFor(record.candidate, actualInput);
  if (
    record.state !== 'verified' ||
    record.deploymentId !== actual.deploymentId ||
    record.workflowHeadCommit !== actual.workflowHeadCommit ||
    new URL(record.siteUrl).href !== new URL(actual.siteUrl).href
  )
    throw Error('Current actual deployment is not the verified record');
  const tagName = 'tsumucode-app-' + record.candidate.runId + '-' + record.deploymentId;
  if (existingInput !== undefined) {
    const existing = z
      .object({ targetCommit: CommitSchema, message: z.string() })
      .strict()
      .parse(existingInput);
    const previous = AppRecordSchema.parse(JSON.parse(existing.message) as unknown);
    const stable = (value: z.infer<typeof AppRecordSchema>) => ({
      ...value,
      observedAt: null,
      smokeDigest: null,
    });
    if (
      previous.state !== 'verified' ||
      existing.targetCommit !== record.candidate.recipe.sourceCommit ||
      hashValue(stable(previous)) !== hashValue(stable(record))
    )
      throw Error('Immutable app record already exists with different evidence');
    return { action: 'reuse-record' as const, tagName, targetCommit: existing.targetCommit };
  }
  return {
    action: 'create-annotated-record' as const,
    tagName,
    targetCommit: record.candidate.recipe.sourceCommit,
    message: JSON.stringify(record),
  };
}
