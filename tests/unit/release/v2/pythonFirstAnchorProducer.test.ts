// @vitest-environment node
import { execFileSync } from 'node:child_process';
import type * as ChildProcess from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../../src/core/persistence/canonicalJson';
import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import { releaseFixture } from './releaseFixture';
import { gitFixtureEnvironment } from './gitFixture';
import { installSafeAnchorTestEnvironment } from './anchorProcessTestEnvironment';

const mocks = vi.hoisted(() => ({
  observe: vi.fn(),
  trackedTree: vi.fn(),
  inspect: vi.fn(),
  verifierHead: 'd50f304376d50dbfbdefb90636040b14abef7f98',
  verifierStatus: '',
  verifierFlags: 'H verifier.ts\0',
}));
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof ChildProcess>();
  const { promisify } = await import('node:util');
  const realExec = promisify(original.execFile);
  const mocked = Object.assign(
    () => {
      throw Error('Unexpected callback path');
    },
    {
      [promisify.custom]: async (
        command: string,
        args: string[],
        options: {
          cwd: string;
          encoding: 'utf8';
          timeout: number;
          maxBuffer: number;
          env: NodeJS.ProcessEnv;
        },
      ) => {
        if (options.cwd === process.cwd() && args.includes('rev-parse'))
          return { stdout: mocks.verifierHead + '\n', stderr: '' };
        if (options.cwd === process.cwd() && args.includes('status'))
          return { stdout: mocks.verifierStatus, stderr: '' };
        if (options.cwd === process.cwd() && args.includes('ls-files'))
          return { stdout: mocks.verifierFlags, stderr: '' };
        return realExec(command, args, options);
      },
    },
  );
  return { ...original, execFile: mocked };
});
vi.mock('../../../../scripts/release/v2/pythonFirstAnchorVerifier', () => ({
  verifyPythonFirstAnchor: mocks.observe,
}));
vi.mock('../../../../scripts/release/v2/anchorTrackedTree', () => ({
  assertAnchorTrackedTree: mocks.trackedTree,
}));
vi.mock('../../../../scripts/release/v2/pythonFirstHistory', () => ({
  inspectPythonFirstHistory: mocks.inspect,
}));
import { producePythonFirstAnchor as produceWithHistory } from '../../../../scripts/release/v2/pythonFirstAnchorProducer';
const producePythonFirstAnchor = (candidate:string,verifier:string,context:unknown) =>
  produceWithHistory(candidate,verifier,context,Buffer.from(observation().snapshot),Buffer.from('{}'));

const verifier = process.cwd();
const temporary: string[] = [];
beforeEach(() => {
  installSafeAnchorTestEnvironment();
  mocks.trackedTree.mockResolvedValue(undefined);
  mocks.inspect.mockReturnValue({ authorized:false });
});
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
  mocks.observe.mockReset();
  mocks.trackedTree.mockReset();
  mocks.inspect.mockReset();
  mocks.verifierHead = 'd50f304376d50dbfbdefb90636040b14abef7f98';
  mocks.verifierStatus = '';
  mocks.verifierFlags = 'H verifier.ts\0';
  vi.unstubAllEnvs();
});

function candidate() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'anchor-producer-'));
  temporary.push(root);
  const env = gitFixtureEnvironment();
  execFileSync('git', ['init', '--quiet', root], { env });
  writeFileSync(path.join(root, 'candidate.txt'), 'candidate');
  execFileSync('git', ['add', 'candidate.txt'], { cwd: root, env });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'candidate',
    ],
    { cwd: root, env },
  );
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    env,
    encoding: 'utf8',
  }).trim();
  return { root, source };
}

function observation() {
  const fixture = releaseFixture().capturedBaseline;
  const proof = {
    ...fixture.proof,
    repository: 'santa928/tsumucode',
    deploymentId: '7699435659',
    sourceCommit: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
    workflowHeadCommit: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
    tagDigest: '005611a22025a12d925bda0fdfb47c96266cf0d3a57aef984f358528a74ead3b',
    inventoryDigest: hashValue(fixture.baseline.inventory),
  };
  const baseline = {
    ...fixture.baseline,
    deploymentId: proof.deploymentId,
    sourceCommit: proof.sourceCommit,
    artifactDigest: proof.artifactDigest,
    sourceRecordDigest: hashValue(proof),
  };
  const snapshot = canonicalJson({ baseline, proof });
  return {
    snapshot,
    sha256: hashBytes(Buffer.from(snapshot)),
    declarationDigest: '4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494',
  };
}

function context(source: string) {
  return {
    repository: 'santa928/tsumucode',
    source,
    runId: '101',
    attempt: 1,
    producerJob: 'anchor_observer',
    producerJobId: '202',
    eventName: 'workflow_dispatch',
    ref: 'refs/heads/main',
  };
}

it('produces bounded identity evidence without exposing the baseline', async () => {
  const { root, source } = candidate();
  const observed = observation();
  mocks.observe.mockResolvedValue(observed);
  const output = await producePythonFirstAnchor(root, verifier, context(source));
  expect(mocks.observe).toHaveBeenCalledOnce();
  expect(mocks.trackedTree).toHaveBeenCalledTimes(2);
  expect(mocks.inspect).toHaveBeenCalledOnce();
  expect(output).not.toHaveProperty('baselineBytes');
  expect(hashBytes(output.evidenceBytes)).toBe(output.evidenceSha256);
  const evidence = JSON.parse(output.evidenceBytes.toString('utf8')) as Record<string, unknown>;
  expect(evidence).toMatchObject({
    schemaVersion: 1,
    mode: 'anchor',
    source,
    runId: '101',
    attempt: 1,
    producerJobId: '202',
    verifierCommit: 'd50f304376d50dbfbdefb90636040b14abef7f98',
  });
  expect(evidence).not.toHaveProperty('baseline');
  expect(evidence).not.toHaveProperty('baselineSha256');
  expect(evidence).not.toHaveProperty('inventory');
  expect(evidence).not.toHaveProperty('token');
});

it('rejects wrong run context, candidate source, or a dirty checkout before observing', async () => {
  const { root, source } = candidate();
  mocks.observe.mockResolvedValue(observation());
  for (const changed of [
    { ...context(source), repository: 'other/repo' },
    { ...context(source), eventName: 'push' },
    { ...context(source), ref: 'refs/heads/other' },
    { ...context(source), runId: '0' },
    { ...context(source), attempt: 0 },
    { ...context(source), unexpected: true },
  ])
    await expect(producePythonFirstAnchor(root, verifier, changed)).rejects.toThrow();
  await expect(producePythonFirstAnchor(root, verifier, context('f'.repeat(40)))).rejects.toThrow(
    'Candidate source differs',
  );
  mocks.verifierHead = 'e'.repeat(40);
  await expect(producePythonFirstAnchor(root, verifier, context(source))).rejects.toThrow(
    'Verifier commit differs',
  );
  mocks.verifierHead = 'd50f304376d50dbfbdefb90636040b14abef7f98';
  mocks.verifierStatus = ' M verifier.ts';
  await expect(producePythonFirstAnchor(root, verifier, context(source))).rejects.toThrow(
    'Anchor checkout is not clean',
  );
  mocks.verifierStatus = '';
  mocks.verifierFlags = 'h verifier.ts\0';
  await expect(producePythonFirstAnchor(root, verifier, context(source))).rejects.toThrow(
    'Unsafe anchor Git index flags',
  );
  mocks.verifierFlags = 'S verifier.ts\0';
  await expect(producePythonFirstAnchor(root, verifier, context(source))).rejects.toThrow(
    'Unsafe anchor Git index flags',
  );
  mocks.verifierFlags = 'H verifier.ts\0';
  writeFileSync(path.join(root, 'candidate.txt'), 'changed');
  await expect(producePythonFirstAnchor(root, verifier, context(source))).rejects.toThrow(
    'Anchor checkout is not clean',
  );
  expect(mocks.observe).not.toHaveBeenCalled();
});

it('rejects missing, oversized, shared and forged historical bytes before observation',async()=>{
  const {root,source}=candidate(),valid=Buffer.from(observation().snapshot),history=Buffer.from('{}');
  const foreign=new Uint8Array(runInNewContext('new SharedArrayBuffer(2)') as SharedArrayBuffer);
  for(const input of [Buffer.alloc(0),Buffer.alloc(16*1024*1024+1),foreign,new DataView(new ArrayBuffer(1))])
    await expect(produceWithHistory(root,verifier,context(source),input as Uint8Array,history)).rejects.toThrow('Invalid historical anchor bytes');
  await expect(produceWithHistory(root,verifier,context(source),valid,Buffer.alloc(0))).rejects.toThrow('Invalid historical anchor bytes');
  expect(mocks.observe).not.toHaveBeenCalled();
});

it('rejects a different fresh parent, an unexpected helper result, and post-observation tree changes',async()=>{
  const {root,source}=candidate(), original=observation();
  const changed=JSON.parse(original.snapshot) as {proof:{runId:string},baseline:{sourceRecordDigest:string}};
  changed.proof.runId='999';changed.baseline.sourceRecordDigest=hashValue(changed.proof);
  const snapshot=canonicalJson(changed);
  mocks.observe.mockResolvedValueOnce({...original,snapshot,sha256:hashBytes(Buffer.from(snapshot))});
  await expect(producePythonFirstAnchor(root,verifier,context(source))).rejects.toThrow('Historical and fresh parent identities differ');
  mocks.observe.mockResolvedValueOnce(original);mocks.inspect.mockReturnValueOnce({authorized:true});
  await expect(producePythonFirstAnchor(root,verifier,context(source))).rejects.toThrow('Invalid historical inspection result');
  mocks.observe.mockResolvedValueOnce(original);mocks.trackedTree.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('Tracked bytes changed'));
  await expect(producePythonFirstAnchor(root,verifier,context(source))).rejects.toThrow('Tracked bytes changed');
});

it('rejects modified bytes, wrong parent, and checkout changes while observing', async () => {
  const { root, source } = candidate();
  const observed = observation();
  mocks.observe.mockResolvedValueOnce({ ...observed, sha256: 'f'.repeat(64) });
  await expect(producePythonFirstAnchor(root, verifier, context(source))).rejects.toThrow(
    'Anchor baseline bytes differ',
  );
  mocks.observe.mockResolvedValueOnce({ ...observed, declarationDigest: 'f'.repeat(64) });
  await expect(producePythonFirstAnchor(root, verifier, context(source))).rejects.toThrow(
    'Anchor baseline identity differs',
  );
  mocks.observe.mockImplementationOnce(async () => {
    writeFileSync(path.join(root, 'candidate.txt'), 'changed during observation');
    return observed;
  });
  await expect(producePythonFirstAnchor(root, verifier, context(source))).rejects.toThrow(
    'Anchor checkout is not clean',
  );
});

it.each(['--assume-unchanged', '--skip-worktree'])(
  'rejects a modified candidate hidden by Git index flag %s',
  async (flag) => {
    const { root, source } = candidate();
    const env = gitFixtureEnvironment();
    execFileSync('git', ['update-index', flag, 'candidate.txt'], { cwd: root, env });
    writeFileSync(path.join(root, 'candidate.txt'), 'hidden change');
    expect(
      execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, env, encoding: 'utf8' }),
    ).toBe('');
    mocks.observe.mockResolvedValue(observation());
    await expect(producePythonFirstAnchor(root, verifier, context(source))).rejects.toThrow(
      'Unsafe anchor Git index flags',
    );
    expect(mocks.observe).not.toHaveBeenCalled();
  },
);
