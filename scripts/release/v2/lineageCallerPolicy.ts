import path from 'node:path';
import { hashBytes } from './identity';
import { normalizedCallerDigest } from './callerNormalization';
import { assertSignerTopology } from './signerTopology';
import { TRUSTED_CALLER_POLICY } from './trustedLineagePolicy';
import { observeIsolatedCandidateSourceWithPythonFixtures } from './isolatedCandidateGit.mjs';

/** Authenticate immutable candidate workflow bytes against a separately reviewed policy.
 * This is not authorization to attest: needs/runtime provenance and publication verification
 * must still be independently checked before any subject can be produced. */
export async function assertReviewedCaller(candidateRoot: string, source: string, signer: string): Promise<void> {
  if (!path.isAbsolute(candidateRoot) || path.basename(candidateRoot) !== 'candidate' || !/^[a-f0-9]{40}$/u.test(source) || !/^[a-f0-9]{40}$/u.test(signer))
    throw Error('Invalid caller source');
  if (TRUSTED_CALLER_POLICY.callerDigests.length === 0 || TRUSTED_CALLER_POLICY.qualificationWorkflowDigests.length === 0 || TRUSTED_CALLER_POLICY.pythonFixturesWorkflowDigests.length === 0 || TRUSTED_CALLER_POLICY.publicationWorkflowDigests.length === 0)
    throw Error('Approved caller policy is not configured');
  const {caller,qualification,publication,pythonFixtures} = await observeIsolatedCandidateSourceWithPythonFixtures(path.dirname(candidateRoot),source);
  if (!TRUSTED_CALLER_POLICY.callerDigests.includes(normalizedCallerDigest(caller, signer)) ||
      !TRUSTED_CALLER_POLICY.qualificationWorkflowDigests.includes(hashBytes(qualification)) ||
      !TRUSTED_CALLER_POLICY.pythonFixturesWorkflowDigests.includes(hashBytes(pythonFixtures)) ||
      !TRUSTED_CALLER_POLICY.publicationWorkflowDigests.includes(hashBytes(publication)))
    throw Error('Candidate workflow differs from approved policy');
  assertSignerTopology(caller, qualification, signer);
}
