// Unconnected read-only observation; not an authorization API.  Protected workflow provenance,
// the claimed Source and actual live record must be independently authenticated by the caller.
// Assumes a disposable isolated runner with no other same-UID writer. Neither this module nor Git
// status proves worktree bytes, live deployment/tag state, or protects against ABA races. The
// current resource limits and /usr/bin/git provenance are not verified for production runners.
import { constants } from 'node:fs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { lstat, mkdir, mkdtemp, open, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import path from 'node:path';
const exec = promisify(execFile);
const maxFile = 64 * 1024 * 1024, maxTotal = 128 * 1024 * 1024;
const fixedEnv = { PATH:'/usr/bin:/bin', HOME:'/dev/null', GIT_CONFIG_NOSYSTEM:'1',
  GIT_CONFIG_GLOBAL:'/dev/null', GIT_NO_REPLACE_OBJECTS:'1', GIT_NO_LAZY_FETCH:'1',
  GIT_TERMINAL_PROMPT:'0', GIT_OPTIONAL_LOCKS:'0', GIT_ATTR_NOSYSTEM:'1', LC_ALL:'C' };
async function copyBounded(source, target, limit) {
  const parent = path.dirname(source);
  if ((await realpath(parent)) !== parent) throw Error('unsafe source ancestor');
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let output, result, failure, failed = false;
  try {
    const before = await input.stat();
    if (!before.isFile() || !before.size || before.size > limit || before.nlink !== 1)
      throw Error('unsafe file');
    output = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const buffer = Buffer.alloc(64 * 1024), digest = createHash('sha256');
    let size = 0;
    for (;;) {
      const read = await input.read(buffer, 0, buffer.length, size);
      if (!read.bytesRead) break;
      if (size + read.bytesRead > before.size || size + read.bytesRead > limit)
        throw Error('file exceeds bound');
      const chunk = buffer.subarray(0, read.bytesRead);
      digest.update(chunk);
      let written = 0;
      while (written < chunk.length) {
        const result = await output.write(chunk, written, chunk.length - written, size + written);
        if (!result.bytesWritten) throw Error('short write');
        written += result.bytesWritten;
      }
      size += read.bytesRead;
    }
    const after = await input.stat();
    const entry = await lstat(source);
    if ((await realpath(parent)) !== parent || !entry.isFile() || entry.isSymbolicLink() ||
        entry.dev !== before.dev || entry.ino !== before.ino) throw Error('source path changed');
    if (size !== before.size || after.size !== before.size || after.ino !== before.ino || after.dev !== before.dev ||
        after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw Error('file changed');
    result = {size, sha256:digest.digest('hex')};
  } catch (error) {
    failed = true;
    failure = error;
  }
  const closes = await Promise.allSettled([input.close(), ...(output ? [output.close()] : [])]);
  const closeFailed = closes.some(row => row.status === 'rejected');
  if (output && (failed || closeFailed)) await rm(target, {force:true});
  if (closeFailed) throw Error('copy close failed');
  if (failed) throw failure;
  return result;
}
async function copyObjects(source, target) {
  let count = 0, total = 0, created = false;
  const walk = async (src, dst, relative='') => {
    const st=await lstat(src); if (!st.isDirectory() || st.isSymbolicLink()) throw Error('unsafe object directory');
    await mkdir(dst, { mode:0o700 });
    if (!relative) created = true;
    for (const entry of await readdir(src, { withFileTypes:true })) {
      const rel=relative ? relative+'/'+entry.name : entry.name;
      if (++count > 10000) throw Error('too many objects');
      if (entry.isSymbolicLink()) throw Error('unsafe object path');
      if (entry.isDirectory()) {
        if (!(relative==='' && (/^[a-f0-9]{2}$/.test(entry.name) || entry.name==='pack' || entry.name==='info'))) throw Error('unexpected object directory');
        await walk(path.join(src,entry.name),path.join(dst,entry.name),rel); continue;
      }
      if (!entry.isFile() || !((/^[a-f0-9]{2}\/[a-f0-9]{38}$/).test(rel) || /^pack\/pack-[a-f0-9]{40}\.(?:pack|idx|rev)$/.test(rel))) throw Error('untrusted object metadata');
      const copied=await copyBounded(path.join(src,entry.name),path.join(dst,entry.name),Math.min(maxFile,maxTotal-total));
      total+=copied.size;
    }
  };
  try { await walk(source,target); }
  catch (error) { if (created) await rm(target,{recursive:true,force:true}); throw error; }
}
// Private selector: only fixed operations below may run; no caller-provided git arguments or paths.
async function inspect(workspace, commit, kind, tagOid, fromCommit, movementKind) {
  if (!/^[a-f0-9]{40}$/.test(commit) || (kind === 'tag' && !/^[a-f0-9]{40}$/.test(tagOid)) ||
      (kind === 'movement' && (!/^[a-f0-9]{40}$/.test(fromCommit) || !['legacy','continuation'].includes(movementKind))))
    throw Error('invalid expected object');
  if (process.platform !== 'linux' || !path.isAbsolute(workspace)) throw Error('unsupported inspection workspace');
  if ((await realpath(workspace)) !== workspace) throw Error('unsafe inspection workspace');
  const source=path.join(workspace,'candidate'), candidateInfo=await lstat(source);
  if (!candidateInfo.isDirectory() || candidateInfo.isSymbolicLink() || (await realpath(source)) !== source)
    throw Error('unsafe candidate path');
  const metadata=path.join(source,'.git'), st=await lstat(metadata);
  if (!st.isDirectory() || st.isSymbolicLink()) throw Error('unsupported source metadata');
  const tmp=await mkdtemp('/tmp/lineage-independent-git-');
  try {
    const gitdir=path.join(tmp,'git'); await mkdir(gitdir,{mode:0o700});
    await mkdir(path.join(gitdir,'refs','heads'),{recursive:true,mode:0o700});
    await writeFile(path.join(gitdir,'config'),'[core]\n\tbare = false\n\tfsmonitor = false\n',{flag:'wx'});
    await writeFile(path.join(gitdir,'HEAD'),commit+'\n',{flag:'wx'});
    await copyBounded(path.join(metadata,'index'),path.join(gitdir,'index'),16*1024*1024);
    await copyObjects(path.join(metadata,'objects'),path.join(gitdir,'objects'));
    const env={...fixedEnv,GIT_DIR:gitdir,GIT_WORK_TREE:source};
    const gitBounded=async (maxBuffer,...args)=>{
      try { return await exec('/usr/bin/git',args,{cwd:tmp,env,timeout:10000,maxBuffer,encoding:'buffer'}); }
      catch { throw Error('Isolated Git inspection failed'); }
    };
    const git=(...args)=>gitBounded(4*1024*1024,...args);
    await git('fsck','--strict','--no-reflogs','--no-dangling');
    // Never let status recurse into candidate submodules or read their local Git settings.
    // Reject unknown modes and unmerged index entries as well as mode 160000 gitlinks.
    const requireEntries=(bytes,header,error)=>{
      if (bytes.length && bytes[bytes.length-1] !== 0) throw Error(error);
      for (const row of bytes.toString('latin1').split('\0').filter(Boolean)) {
        const tab=row.indexOf('\t');
        if (tab < 0 || tab === row.length-1 || !header.test(row.slice(0,tab))) throw Error(error);
      }
    };
    const treeEntries=(await git('ls-tree','-r','-z','--full-tree',commit)).stdout;
    requireEntries(treeEntries,/^(?:100644|100755|120000) blob [a-f0-9]{40}$/,'Candidate tree has unsupported Git entry');
    const indexEntries=(await git('ls-files','--stage','-z')).stdout;
    requireEntries(indexEntries,/^(?:100644|100755|120000) [a-f0-9]{40} 0$/,'Candidate index has unsupported Git entry');
    // This compares copied index and the claimed tree; neither the claim nor the object origin is authenticated here.
    try { await git('diff','--cached','--quiet','--no-ext-diff','--no-textconv',commit,'--'); }
    catch { throw Error('Candidate index differs from expected commit'); }

    const flags=(await git('ls-files','-v','-z')).stdout;
    for (const row of flags.toString('utf8').split('\0').filter(Boolean)) {
      if (row[0] === 'S' || /^[a-z]/.test(row[0])) throw Error('hidden index flag');
    }
    const status=(await git('status','--porcelain','--untracked-files=all')).stdout;
    if (status.length !== 0) throw Error('Candidate checkout is dirty');
    if (kind === 'movement') {
      const receipt='docs/quality/content-v2-receipts.json';
      const sources=movementKind === 'continuation' ? ['content',receipt] : ['content'];
      try { await git('diff','--quiet','--no-ext-diff','--no-textconv',fromCommit,commit,'--',...sources); }
      catch { throw Error('Movement source differs'); }
      if (movementKind === 'continuation') {
        const original=(await gitBounded(4*1024*1024,'cat-file','blob',`${fromCommit}:${receipt}`)).stdout;
        const snapshot=path.join(tmp,'movement-receipt');
        await copyBounded(path.join(source,receipt),snapshot,4*1024*1024);
        if (!original.equals(await readFile(snapshot))) throw Error('Movement continuation receipt bytes differ');
      }
      return {};
    }
    if (kind === 'source' || kind === 'source-fixtures') {
      const tree=(await git('rev-parse',`${commit}^{tree}`)).stdout.toString('utf8').trim();
      if (!/^[a-f0-9]{40}$/.test(tree)) throw Error('Invalid candidate tree');
      const names=['.github/workflows/pages.yml','.github/workflows/release-v2-checks.yml',
        '.github/workflows/release-v2-publish.yml','package-lock.json','Dockerfile'];
      if (kind === 'source-fixtures') names.push('.github/workflows/python-fixtures.yml');
      const files=[];
      for (let i=0;i<names.length;i++) {
        const name=names[i], blob=(await gitBounded(4*1024*1024,'cat-file','blob',`${commit}:${name}`)).stdout;
        if (!blob.length) throw Error('Empty candidate source file');
        const snapshot=path.join(tmp,`source-${i}`);
        await copyBounded(path.join(source,name),snapshot,4*1024*1024);
        if (!blob.equals(await readFile(snapshot))) throw Error('Candidate source file differs from commit');
        files.push(blob);
      }
      const sourceFiles = {sourceTree:tree, caller:files[0], qualification:files[1], publication:files[2], lock:files[3], dockerfile:files[4]};
      return kind === 'source-fixtures' ? {...sourceFiles, pythonFixtures:files[5]} : sourceFiles;
    }
    if ((await git('cat-file','-t',tagOid)).stdout.toString().trim() !== 'tag') throw Error('not a tag');
    const raw=(await gitBounded(16*1024,'cat-file','-p',tagOid)).stdout;
    if (!raw.length) throw Error('Empty tag object');
    const objectSha=createHash('sha1').update(`tag ${raw.length}\0`).update(raw).digest('hex');
    if (objectSha !== tagOid) throw Error('tag object digest differs');
    return {tagBytes:raw};
  } finally {await rm(tmp,{recursive:true,force:true});}
}

/** Claimed source/tag and workspace require separate workflow and live-record authentication. */
export async function observeIsolatedCandidateGit(workspace,commit,tagOid) {
  return inspect(workspace,commit,'tag',tagOid);
}
/** Source bytes only: this does not authenticate commit origin, runner, or protected needs. */
export async function observeIsolatedCandidateSource(workspace,commit) {
  return inspect(workspace,commit,'source');
}
/** Same copied Git source observation, plus a fixed fixture workflow; no provenance authentication. */
export async function observeIsolatedCandidateSourceWithPythonFixtures(workspace,commit) {
  return inspect(workspace,commit,'source-fixtures');
}

/** Fixed source comparison only; does not authenticate its claimed commits or workflow. */
export async function observeIsolatedMovementSource(workspace,commit,fromCommit,kind) {
  return inspect(workspace,commit,'movement',undefined,fromCommit,kind);
}
