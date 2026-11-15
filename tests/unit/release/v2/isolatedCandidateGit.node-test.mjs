import test from 'node:test';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, rmSync, symlinkSync, readFileSync, readdirSync, openSync, ftruncateSync, closeSync } from 'node:fs';
import { appendFile, link, rename, symlink } from 'node:fs/promises';
import { URL, pathToFileURL } from 'node:url';
import path from 'node:path';
import { observeIsolatedCandidateGit, observeIsolatedCandidateSource, observeIsolatedCandidateSourceWithPythonFixtures } from '../../../../scripts/release/v2/isolatedCandidateGit.mjs';
function fixture() {
 const workspace=mkdtempSync('/tmp/lineage-exec/lineage-inspection-fixture-'),root=path.join(workspace,'candidate');
 mkdirSync(root);
 const env={PATH:'/usr/bin:/bin',HOME:workspace,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
 const git=(...args)=>execFileSync('/usr/bin/git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 writeFileSync(path.join(root,'.gitattributes'),'*.txt filter=probe\n');
 mkdirSync(path.join(root,'.github','workflows'),{recursive:true});
 for (const name of ['pages.yml','release-v2-checks.yml','release-v2-publish.yml']) writeFileSync(path.join(root,'.github','workflows',name),name+'\n');
 writeFileSync(path.join(root,'package-lock.json'),'{}\n');writeFileSync(path.join(root,'Dockerfile'),'FROM scratch\n');
 writeFileSync(path.join(root,'sample.txt'),'before\n');git('add','.gitattributes','sample.txt','.github','package-lock.json','Dockerfile');git('commit','-qm','initial');
 git('tag','-a','v1','-m','original');git('tag','-a','v2','-m','replacement');
 const commit=git('rev-parse','HEAD'),tag=git('rev-parse','v1'),replacement=git('rev-parse','v2');
 const marker=path.join(workspace,'filter-marker'),helper=path.join(workspace,'filter.sh');
 writeFileSync(helper,`#!/bin/sh\nprintf invoked > '${marker}'\ncat\n`);chmodSync(helper,0o700);
 git('config','filter.probe.clean',helper);git('config','filter.probe.required','true');
 return {workspace,root,git,commit,tag,replacement,marker,cleanup:()=>rmSync(workspace,{recursive:true,force:true})};
}
const run=f=>observeIsolatedCandidateGit(f.workspace,f.commit,f.tag);
test('observes clean candidate without running its local filter or honoring replacement refs',async()=>{
 const f=fixture();try {
  f.git('hash-object','--path=sample.txt','sample.txt');
  assert.equal(existsSync(f.marker),true,'positive control: Git clean filter was not invoked');
  rmSync(f.marker);
  const original=f.git('cat-file','-p',f.tag);f.git('replace',f.tag,f.replacement);
  assert.match(f.git('cat-file','-p',f.tag),/replacement/);
  const old=process.env.GITHUB_TOKEN;process.env.GITHUB_TOKEN='synthetic-only';
  try {const result=await run(f);assert.equal(result.tagBytes.toString().trim(),original);assert.equal(existsSync(f.marker),false);}
  finally {if(old===undefined) delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=old;}
 } finally {f.cleanup();}
});
test('rejects tracked modifications and untracked files even when source filter is configured',async()=>{
 for (const kind of ['tracked','untracked']) {
  const f=fixture();try {
   if(kind==='tracked') writeFileSync(path.join(f.root,'sample.txt'),'afterx\n');
   else writeFileSync(path.join(f.root,'unknown.txt'),'new\n');
   await assert.rejects(run(f),/Candidate checkout is dirty/);assert.equal(existsSync(f.marker),false);
  } finally {f.cleanup();}
 }
});
test('rejects invalid commit, changed or corrupt tag object and hidden index flags',async()=>{
 const f=fixture();try {
  await assert.rejects(observeIsolatedCandidateGit(f.workspace,'f'.repeat(40),f.tag));
  await assert.rejects(observeIsolatedCandidateGit(f.workspace,f.commit,f.commit),/not a tag/);
  for(const flag of ['--assume-unchanged','--skip-worktree']) {
   f.git('update-index',flag,'sample.txt');await assert.rejects(run(f),/hidden index flag/);
   f.git('update-index',flag==='--assume-unchanged'?'--no-assume-unchanged':'--no-skip-worktree','sample.txt');
  }
  const blob=path.join(f.root,'.git','objects',f.tag.slice(0,2),f.tag.slice(2));
  const data=readFileSync(blob);data[Math.floor(data.length/2)]^=1;chmodSync(blob,0o600);writeFileSync(blob,data);
  await assert.rejects(run(f));
 } finally {f.cleanup();}
});
test('rejects alternates, promisor, links and symlinked metadata without leaving temporary directories',async()=>{
 for(const kind of ['alternates','promisor','hardlink','symlink','gitdir']) {
  const f=fixture();try {
   const objects=path.join(f.root,'.git','objects');
   if(kind==='alternates')writeFileSync(path.join(objects,'info','alternates'),'/tmp/objects\n');
   if(kind==='promisor')writeFileSync(path.join(objects,'pack','pack-'+ 'a'.repeat(40)+'.promisor'),'');
   if(kind==='hardlink'){const blob=path.join(objects,f.tag.slice(0,2),f.tag.slice(2));await link(blob,path.join(f.workspace,'alias'));}
   if(kind==='symlink')symlinkSync('/tmp',path.join(objects,'ff'));
   if(kind==='gitdir'){const meta=path.join(f.root,'.git');await rename(meta,meta+'-moved');symlinkSync(meta+'-moved',meta);}
   const before=new Set(readdirSync('/tmp').filter(x=>x.startsWith('lineage-independent-git-')));
   await assert.rejects(run(f));
   assert.deepEqual(new Set(readdirSync('/tmp').filter(x=>x.startsWith('lineage-independent-git-'))),before);
  } finally {f.cleanup();}
 }
});
test('rejects a symlinked candidate and a pack over the provisional per-file limit',async()=>{
 const f=fixture();try {
  const original=path.join(f.workspace,'candidate-original');await rename(f.root,original);symlinkSync(original,f.root);
  await assert.rejects(run(f),/unsafe candidate path/);
 } finally {f.cleanup();}
 const g=fixture();try {
  const file=path.join(g.root,'.git','objects','pack','pack-'+ 'a'.repeat(40)+'.pack');
  const fd=openSync(file,'w');ftruncateSync(fd,64*1024*1024+1);closeSync(fd);
  await assert.rejects(run(g),/unsafe file/);
 } finally {g.cleanup();}
});

test('rejects a copied index whose tree differs from the expected commit',async()=>{
 const f=fixture();try {
  writeFileSync(path.join(f.root,'sample.txt'),'staged\n');
  f.git('-c','filter.probe.clean=cat','add','sample.txt');
  await assert.rejects(run(f),/Candidate index differs from expected commit/);
 } finally {f.cleanup();}
});

// Instrument a private temporary copy, never the imported production module. The injected hook
// only coordinates deterministic concurrent mutations of synthetic fixture paths.
async function instrumentedModule(workspace, exposeCopy=false) {
 const sourceFile=new URL('../../../../scripts/release/v2/isolatedCandidateGit.mjs',import.meta.url);
 let source=readFileSync(sourceFile,'utf8');
 const marker='      size += read.bytesRead;';
 assert.equal(source.split(marker).length,2);
 source=source.replace(marker,marker+"\n      if (globalThis.__lineageTestChunk) await globalThis.__lineageTestChunk(source);");
 if(exposeCopy)source+='\nexport { copyObjects as testCopyObjects };\n';
 const file=path.join(workspace,'instrumented.mjs');writeFileSync(file,source);
 return import(pathToFileURL(file).href);
}
test('rejects index mutation or persistent parent replacement mid-copy and removes the temporary Git directory',async()=>{
 for(const kind of ['mutation','parent']) {
  const f=fixture();try {
   const tempBefore=new Set(readdirSync('/tmp').filter(x=>x.startsWith('lineage-independent-git-')));
   const module=await instrumentedModule(f.workspace);let called=false;
   globalThis.__lineageTestChunk=async source=>{
    if(called || !source.endsWith('/.git/index'))return;called=true;
    if(kind==='mutation')await appendFile(source,Buffer.from('x'));
    else {const meta=path.join(f.root,'.git');await rename(meta,meta+'-moved');await symlink(meta+'-moved',meta);}
   };
   try {
    await assert.rejects(module.observeIsolatedCandidateGit(f.workspace,f.commit,f.tag),
      kind==='mutation'?/file exceeds bound|file changed/:/source path changed/);
    assert.equal(called,true);
    assert.deepEqual(new Set(readdirSync('/tmp').filter(x=>x.startsWith('lineage-independent-git-'))),tempBefore);
   } finally {delete globalThis.__lineageTestChunk;}
  } finally {f.cleanup();}
 }
});
test('accepts exactly 128 MiB of object files and removes the copy on one byte over budget',async()=>{
 const root=mkdtempSync('/tmp/lineage-production-total-');try {
  const module=await instrumentedModule(root,true),objects=path.join(root,'objects'),pack=path.join(objects,'pack'),target=path.join(root,'copy');
  mkdirSync(pack,{recursive:true});
  for(const ch of ['a','b']) {const fd=openSync(path.join(pack,'pack-'+ch.repeat(40)+'.pack'),'w');ftruncateSync(fd,64*1024*1024);closeSync(fd);}
  await module.testCopyObjects(objects,target);
  rmSync(target,{recursive:true,force:true});
  writeFileSync(path.join(pack,'pack-'+ 'c'.repeat(40)+'.idx'),Buffer.from([0]));
  await assert.rejects(module.testCopyObjects(objects,target),/unsafe file|object budget/);
  assert.equal(existsSync(target),false);
 } finally {rmSync(root,{recursive:true,force:true});}
});
test('accepts a 16 KiB tag and rejects a 16 KiB plus one tag',async()=>{
 const f=fixture();try {
  const header=`object ${f.commit}\ntype commit\ntag bound-test\ntagger Fixture <fixture@example.invalid> 1 +0000\n\n`;
  const createTag=size=>{
   const bytes=Buffer.from(header+'x'.repeat(size-Buffer.byteLength(header)));
   assert.equal(bytes.length,size);
   const oid=execFileSync('/usr/bin/git',['-C',f.root,'hash-object','-t','tag','-w','--stdin'],{
    input:bytes,encoding:'utf8',env:{PATH:'/usr/bin:/bin',HOME:f.workspace,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
   return {oid,bytes};
  };
  const exact=createTag(16*1024), tooLarge=createTag(16*1024+1);
  const observed=await observeIsolatedCandidateGit(f.workspace,f.commit,exact.oid);
  assert.deepEqual(observed.tagBytes,exact.bytes);
  await assert.rejects(observeIsolatedCandidateGit(f.workspace,f.commit,tooLarge.oid),/Isolated Git inspection failed/);
 } finally {f.cleanup();}
});

test('reads fixed source files with tokenless isolated Git while candidate fsmonitor and clean filter are configured',async()=>{
 const f=fixture();try {
  f.git('config','core.fsmonitor',path.join(f.workspace,'filter.sh'));
  f.git('status','--porcelain');
  assert.equal(existsSync(f.marker),true,'positive control: Git fsmonitor was not invoked');
  rmSync(f.marker);
  const old=process.env.GITHUB_TOKEN;process.env.GITHUB_TOKEN='synthetic-only';
  try {
   const result=await observeIsolatedCandidateSource(f.workspace,f.commit);
   assert.equal(result.caller.toString(),'pages.yml\n');assert.equal(result.qualification.toString(),'release-v2-checks.yml\n');
   assert.equal(result.publication.toString(),'release-v2-publish.yml\n');assert.equal(result.sourceTree.length,40);
   assert.equal(existsSync(f.marker),false);
  } finally {if(old===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=old;}
 } finally {f.cleanup();}
});
test('rejects modified workflow source before producing observation',async()=>{
 const f=fixture();try {
  writeFileSync(path.join(f.root,'.github','workflows','pages.yml'),'changed\n');
  await assert.rejects(observeIsolatedCandidateSource(f.workspace,f.commit),/Candidate checkout is dirty/);
  assert.equal(existsSync(f.marker),false);
 } finally {f.cleanup();}
});

test('reads fixed fixture workflow together with the other source files from the claimed commit',async()=>{
 const f=fixture();try {
  const fixturePath=path.join(f.root,'.github','workflows','python-fixtures.yml');
  writeFileSync(fixturePath,'synthetic-fixtures\n');
  f.git('add','.github/workflows/python-fixtures.yml');f.git('commit','-qm','add-fixture-workflow');
  const commit=f.git('rev-parse','HEAD');
  const observed=await observeIsolatedCandidateSourceWithPythonFixtures(f.workspace,commit);
  assert.equal(observed.pythonFixtures.toString(),'synthetic-fixtures\n');
  assert.equal(observed.caller.toString(),'pages.yml\n');
  writeFileSync(fixturePath,'changed-fixtures\n');
  await assert.rejects(observeIsolatedCandidateSourceWithPythonFixtures(f.workspace,commit),/Candidate checkout is dirty/);
 } finally {f.cleanup();}
});
test('rejects missing fixed fixture workflow but leaves the existing source API unchanged',async()=>{
 const f=fixture();try {
  const existing=await observeIsolatedCandidateSource(f.workspace,f.commit);
  assert.equal(existing.caller.toString(),'pages.yml\n');
  await assert.rejects(observeIsolatedCandidateSourceWithPythonFixtures(f.workspace,f.commit),/Isolated Git inspection failed/);
 } finally {f.cleanup();}
});
test('rejects gitlinks in either the commit tree or copied index before nested Git can run',async()=>{
 for(const kind of ['tree','index']) {
  const f=fixture();try {
   const nested=path.join(f.root,'nested'),nestedMarker=path.join(f.workspace,'nested-marker'),nestedHelper=path.join(f.workspace,'nested-monitor');mkdirSync(nested);
   writeFileSync(nestedHelper,`#!/bin/sh\nprintf invoked > '${nestedMarker}'\n`);chmodSync(nestedHelper,0o700);
   f.git('init','-q','nested');
   f.git('-C','nested','config','core.fsmonitor',nestedHelper);
   assert.equal(existsSync(f.marker),false,'nested setup executed candidate helper');
   f.git('-c','filter.probe.clean=cat','update-index','--add','--cacheinfo',`160000,${f.commit},nested`);
   assert.deepEqual({parent:existsSync(f.marker),nested:existsSync(nestedMarker)},{parent:false,nested:false},'update-index helper markers');
   let commit=f.commit;
   if(kind==='tree') {
    const tree=f.git('-c','filter.probe.clean=cat','write-tree');
    assert.equal(existsSync(f.marker),false,'write-tree executed parent helper');
    commit=f.git('-c','filter.probe.clean=cat','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit-tree',tree,'-p',f.commit,'-m','with gitlink');
    assert.equal(existsSync(f.marker),false,'commit-tree executed parent helper');
    f.git('-c','filter.probe.clean=cat','read-tree',f.commit);
    assert.equal(existsSync(f.marker),false,'read-tree executed parent helper');
   }
   assert.deepEqual({parent:existsSync(f.marker),nested:existsSync(nestedMarker)},{parent:false,nested:false},'tree setup helper markers');
   await assert.rejects(observeIsolatedCandidateGit(f.workspace,commit,f.tag),
     kind==='tree'?/Candidate tree has unsupported Git entry/:/Candidate index has unsupported Git entry/);
   assert.deepEqual({parent:existsSync(f.marker),nested:existsSync(nestedMarker)},{parent:false,nested:false},'inspection helper markers');
  } finally {f.cleanup();}
 }
});
