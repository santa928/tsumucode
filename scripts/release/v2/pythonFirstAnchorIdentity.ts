import { AppRecordSchema } from './appRecord';
import { hashBytes } from './identity';
import { BaselineProofSchema } from './parent';
const repository = 'santa928/tsumucode';
const source = 'b9306eb3414e69a2068603cfdbf2706ebe4e9284';
const tagName = 'tsumucode-app-42929117936-7699435659';
const tagDigest = '005611a22025a12d925bda0fdfb47c96266cf0d3a57aef984f358528a74ead3b';
const inventoryDigest = 'f66bdc9ce5fad39a76a22d79bb0f07b497efe7bdea1114278ecec80c47022310';
const publicDigest = '36b593f9e489346671b61c881237bf1e3e04fc8bf0d47e3a3b0c4569af9c6df9';

/** Local fixed bytes and record consistency only, not a live-deployment authorization. */
export function assertFixedPythonFirstAnchor(proofInput: unknown, tagInput: Uint8Array) {
  const proof = BaselineProofSchema.parse(proofInput);
  if (
    !(tagInput instanceof Uint8Array) ||
    tagInput.buffer instanceof SharedArrayBuffer ||
    !tagInput.byteLength ||
    tagInput.byteLength > 16 * 1024
  )
    throw Error('Invalid anchor tag bytes');
  const tag = Buffer.from(tagInput);
  if (
    proof.repository !== repository ||
    proof.deploymentId !== '7699435659' ||
    proof.sourceCommit !== source ||
    proof.workflowHeadCommit !== source ||
    proof.runId !== '42929117936' ||
    proof.tag !== `refs/tags/${tagName}` ||
    proof.tagDigest !== tagDigest ||
    hashBytes(tag) !== tagDigest ||
    proof.inventoryDigest !== inventoryDigest ||
    proof.publicContentDigest !== publicDigest ||
    proof.artifactDigestFormat !== 'canonical-dist-v1' ||
    proof.projection !== 'authoring' ||
    proof.publicFiles !== 479
  )
    throw Error('Pinned anchor identity differs');
  const match =
    /^object ([a-f0-9]{40})\ntype commit\ntag ([A-Za-z0-9._-]+)\ntagger [^\n]+\n\n([\s\S]+)$/u.exec(
      new TextDecoder('utf-8', { fatal: true }).decode(tag),
    );
  if (!match || match[1] !== source || match[2] !== tagName)
    throw Error('Pinned anchor tag object differs');
  const record = AppRecordSchema.parse(JSON.parse(match[3]!) as unknown);
  if (
    record.state !== 'verified' ||
    record.repository !== repository ||
    record.deploymentId !== proof.deploymentId ||
    record.workflowHeadCommit !== source ||
    record.candidate.runId !== proof.runId ||
    record.candidate.recipe.sourceCommit !== source ||
    record.candidate.artifactDigest !== proof.artifactDigest ||
    record.inventoryDigest !== inventoryDigest ||
    record.publicContentDigest !== publicDigest ||
    record.qualificationDigest !==
      'b691d873d0d32bf28cce69b23b98337a7e9b069a768853c85789340e074471dc' ||
    record.candidate.planDigest !==
      '8b1f078a0361ad2fed64d67f62d4c75e4490ee7d3ee08df2286b273d705d2db6' ||
    Date.parse(proof.observedAt) < Date.parse(record.observedAt)
  )
    throw Error('Pinned anchor record differs');
}
