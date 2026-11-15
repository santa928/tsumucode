import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli=fileURLToPath(new URL('./preview-diagnostic.mjs',import.meta.url));
async function temp(run) {const d=await mkdtemp(join(tmpdir(),'preview-diag-'));try {await run(d);} finally {await rm(d,{recursive:true,force:true});}}
const invoke=p=>spawnSync(process.execPath,[cli,p],{encoding:'utf8'});
test('CLI prints only fixed categories from valid input, discarding private extra fields',async()=>{
  await temp(async d=>{
    const p=join(d,'input.json');
    const x={network:{session:'2xx',capabilities:'2xx',run:'5xx',poll:'none',extra:'PRIVATE_MARKER'},ui:{version:'unversioned',result:'system-error',line8:'no',lineEnd:'no',alert:'yes'},extra:'PRIVATE_MARKER'};
    await writeFile(p,JSON.stringify(x)); const r=invoke(p);
    assert.equal(r.status,0);assert.equal(r.stderr,'');
    assert.equal(r.stdout,'preview network-session=2xx capabilities=2xx run=5xx poll=none\npreview ui-version=unversioned result=system-error line8=no line-end=no alert=yes\n');
    assert.doesNotMatch(r.stdout,/PRIVATE_MARKER/);
  });
});
test('CLI safely rejects unknown values, missing, malformed, oversized and symlink input',async()=>{
  await temp(async d=>{
    const bad=join(d,'bad.json'),large=join(d,'large.json'),link=join(d,'link.json'),injected=join(d,'injected.json');
    await writeFile(bad,'PRIVATE_MARKER_not_json');await writeFile(large,Buffer.alloc(4097));await symlink(bad,link);
    await writeFile(injected,JSON.stringify({network:{session:'PRIVATE_MARKER'},ui:{version:'PRIVATE_MARKER'}}));
    for(const p of [join(d,'missing.json'),bad,large,link]){const r=invoke(p);assert.equal(r.status,0);assert.equal(r.stderr,'');assert.equal(r.stdout,'preview-diagnostic unavailable\n');}
    const r=invoke(injected);assert.equal(r.status,0);assert.equal(r.stderr,'');assert.equal(r.stdout,'preview-diagnostic invalid\n');
  });
});
