// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { releaseFixture } from './releaseFixture';

// This test isolates byte decoding only. Neither mock authenticates an anchor or qualification.
vi.mock('../../../../scripts/release/v2/pythonFirstAnchorIdentity',()=>({assertFixedPythonFirstAnchor:()=>{}}));
vi.mock('../../../../scripts/release/v2/movementPredecessor',()=>({verifyPythonMovementPredecessor:()=>({
  movementDeclarationDigest:'4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494',
})}));
import { inspectPythonFirstHistory } from '../../../../scripts/release/v2/pythonFirstHistory';

it('preserves existing UTF-8 BOM handling through the helper entry, without authorizing publication',()=>{
  const captured=releaseFixture().capturedBaseline,tag=Buffer.from('synthetic-tag');
  const history={proof:captured.proof,tagObject:'synthetic-tag'},bom=Buffer.from([0xef,0xbb,0xbf]);
  const baselineBytes=Buffer.from(JSON.stringify(captured,null,2)),historyBytes=Buffer.from(JSON.stringify(history));
  expect(inspectPythonFirstHistory(Buffer.concat([bom,baselineBytes]),tag,historyBytes)).toEqual({authorized:false});
  expect(inspectPythonFirstHistory(baselineBytes,tag,Buffer.concat([bom,historyBytes]))).toEqual({authorized:false});
});
