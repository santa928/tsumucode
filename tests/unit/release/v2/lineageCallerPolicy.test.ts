// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ source:'1'.repeat(40), signer:'2'.repeat(40), caller:'reviewed-caller', qualification:'reviewed-qualification', publication:'reviewed-publication', pythonFixtures:'reviewed-fixtures', observe:vi.fn() }));
vi.mock('../../../../scripts/release/v2/trustedLineagePolicy', () => ({
  TRUSTED_CALLER_POLICY: { callerDigests: ['approved-caller'], qualificationWorkflowDigests: ['approved-qualification'], publicationWorkflowDigests: ['approved-publication'], pythonFixturesWorkflowDigests: ['approved-fixtures'] },
}));
vi.mock('../../../../scripts/release/v2/callerNormalization', () => ({
  normalizedCallerDigest: (bytes: Buffer) => bytes.toString() === f.caller ? 'approved-caller' : 'different',
}));
vi.mock('../../../../scripts/release/v2/identity', () => ({
  hashBytes: (bytes: Buffer) => bytes.toString() === f.qualification ? 'approved-qualification' : bytes.toString() === f.publication ? 'approved-publication' : bytes.toString() === f.pythonFixtures ? 'approved-fixtures' : 'different',
}));
vi.mock('../../../../scripts/release/v2/signerTopology', () => ({ assertSignerTopology: vi.fn() }));
vi.mock('../../../../scripts/release/v2/isolatedCandidateGit.mjs',()=>({observeIsolatedCandidateSourceWithPythonFixtures:f.observe}));
import { assertSignerTopology } from '../../../../scripts/release/v2/signerTopology';
import { assertReviewedCaller } from '../../../../scripts/release/v2/lineageCallerPolicy';
const bytes=()=>({caller:Buffer.from(f.caller),qualification:Buffer.from(f.qualification),publication:Buffer.from(f.publication),pythonFixtures:Buffer.from(f.pythonFixtures)});
beforeEach(()=>{f.observe.mockReset();f.observe.mockResolvedValue(bytes());});
it('checks independently observed workflow bytes and wiring but does not authorize a subject',async()=>{
 await expect(assertReviewedCaller('/workspace/candidate',f.source,f.signer)).resolves.toBeUndefined();
 expect(f.observe).toHaveBeenCalledWith('/workspace',f.source);expect(assertSignerTopology).toHaveBeenCalled();
});
it('rejects invalid path, signer, unobserved source, and changed workflow files',async()=>{
 await expect(assertReviewedCaller('/workspace/candidate',f.source,'invalid')).rejects.toThrow();
 await expect(assertReviewedCaller('/workspace/other',f.source,f.signer)).rejects.toThrow();
 f.observe.mockRejectedValueOnce(Error('candidate source unavailable'));
 await expect(assertReviewedCaller('/workspace/candidate',f.source,f.signer)).rejects.toThrow('candidate source unavailable');
 for(const key of ['caller','qualification','publication','pythonFixtures'] as const){
  f.observe.mockResolvedValueOnce({...bytes(),[key]:Buffer.from('altered')});
  await expect(assertReviewedCaller('/workspace/candidate',f.source,f.signer)).rejects.toThrow('Candidate workflow differs');
 }
});
