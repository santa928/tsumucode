/** Fixed by reviewed code; never derive these values from the subject or its record. */
export const TRUSTED_LINEAGE_POLICY = Object.freeze({
  repository: 'santa928/tsumucode',
  repositoryId: '1303564490',
  signerPath: '.github/workflows/release-v2-lineage-sign.yml',
  callerPath: '.github/workflows/pages.yml',
  signerRef: 'commit' as const,
  sourceRef: 'refs/heads/main',
  trigger: 'workflow_dispatch',
  subjectAlgorithm: 'sha256' as const,
  // Independently reviewed values must be added only after signer bootstrap.
  approvedSignerCommits: Object.freeze([] as string[]),
  approvedGhSha256: Object.freeze([] as string[]),
});

/** Values are populated only by separately reviewed bootstrap commits. */
export const TRUSTED_CALLER_POLICY = Object.freeze({
  callerDigests: Object.freeze([] as string[]),
  qualificationWorkflowDigests: Object.freeze([] as string[]),
  pythonFixturesWorkflowDigests: Object.freeze([] as string[]),
  publicationWorkflowDigests: Object.freeze([] as string[]),
});
