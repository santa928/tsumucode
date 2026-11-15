// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
vi.mock('../../../../scripts/release/v2/trustedLineagePolicy',()=>({TRUSTED_CALLER_POLICY:{callerDigests:['caller'],qualificationWorkflowDigests:['qualification'],publicationWorkflowDigests:['publication'],pythonFixturesWorkflowDigests:['fixtures']}}));
vi.mock('../../../../scripts/release/v2/callerNormalization',()=>({normalizedCallerDigest:(bytes:Buffer)=>bytes.toString()==='caller'?'caller':'bad'}));
vi.mock('../../../../scripts/release/v2/identity',()=>({hashBytes:(bytes:Buffer)=>bytes.toString()}));
vi.mock('../../../../scripts/release/v2/signerTopology',()=>({assertSignerTopology:vi.fn()}));
import { assertReviewedCaller } from '../../../../scripts/release/v2/lineageCallerPolicy';
function fixture(){
 const workspace=mkdtempSync('/tmp/lineage-exec/lineage-caller-isolated-'),root=path.join(workspace,'candidate');mkdirSync(root);
 const env={PATH:'/usr/bin:/bin',HOME:workspace,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
 const git=(...args:string[])=>execFileSync('/usr/bin/git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 mkdirSync(path.join(root,'.github','workflows'),{recursive:true});
 for(const [name,value] of [['pages.yml','caller'],['release-v2-checks.yml','qualification'],['release-v2-publish.yml','publication'],['python-fixtures.yml','fixtures']])writeFileSync(path.join(root,'.github','workflows',name!),value!);
 writeFileSync(path.join(root,'package-lock.json'),'{}');writeFileSync(path.join(root,'Dockerfile'),'FROM scratch');
 writeFileSync(path.join(root,'.gitattributes'),'*.txt filter=probe\n');writeFileSync(path.join(root,'sample.txt'),'before\n');
 git('add','.');git('commit','-qm','fixture');
 const marker=path.join(workspace,'malicious-marker'),helper=path.join(workspace,'filter');
 writeFileSync(helper,`#!/bin/sh\nprintf invoked > '${marker}'\ncat\n`);chmodSync(helper,0o700);
 git('config','filter.probe.clean',helper);git('config','core.fsmonitor',helper);
 return {workspace,root,source:git('rev-parse','HEAD'),marker,cleanup:()=>{rmSync(workspace,{recursive:true,force:true});}};
}
it('runs actual caller observation without executing candidate Git config or propagating a synthetic token',async()=>{
 const f=fixture(),old=process.env.GITHUB_TOKEN;process.env.GITHUB_TOKEN='synthetic-only';
 try {
  const env={PATH:'/usr/bin:/bin',HOME:f.workspace,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
  execFileSync('/usr/bin/git',['status','--porcelain'],{cwd:f.root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  expect(existsSync(f.marker)).toBe(true);
  rmSync(f.marker);
  await expect(assertReviewedCaller(f.root,f.source,'2'.repeat(40))).resolves.toBeUndefined();
  expect(existsSync(f.marker)).toBe(false);
  writeFileSync(path.join(f.root,'.github','workflows','pages.yml'),'altered');
  await expect(assertReviewedCaller(f.root,f.source,'2'.repeat(40))).rejects.toThrow('Candidate checkout is dirty');
  expect(existsSync(f.marker)).toBe(false);
 } finally {if(old===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=old;f.cleanup();}
});
