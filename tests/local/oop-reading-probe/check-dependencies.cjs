const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

function fingerprint(root) {
  if (!fs.lstatSync(root).isDirectory()) throw Error('Dependency unavailable');
  const resolvedRoot = fs.realpathSync(root);
  const hash = crypto.createHash('sha256');
  let entries = 0;
  let bytes = 0;
  function visit(directory, prefix) {
    for (const name of fs.readdirSync(directory).sort()) {
      if (prefix === '' && name === '.vite-temp') continue;
      const relative = prefix ? `${prefix}/${name}` : name;
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      const mode = stat.mode & 0o7777;
      entries += 1;
      if (entries > 200_000 || stat.size > 256 * 1024 * 1024) throw Error('Dependency bound');
      if (stat.isDirectory()) {
        hash.update(`d\0${relative}\0${mode}\0`);
        visit(target, relative);
      } else if (stat.isSymbolicLink()) {
        const resolved = fs.realpathSync(target);
        if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw Error('Dependency link');
        const scratch = path.join(resolvedRoot, '.vite-temp');
        if (resolved === scratch || resolved.startsWith(`${scratch}${path.sep}`)) throw Error('Dependency link');
        hash.update(`l\0${relative}\0${fs.readlinkSync(target)}\0`);
      } else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 2 * 1024 * 1024 * 1024) throw Error('Dependency bound');
        hash.update(`f\0${relative}\0${mode}\0${stat.size}\0`).update(fs.readFileSync(target));
      } else throw Error('Dependency type');
    }
  }
  visit(root, '');
  if (!entries || !bytes) throw Error('Dependency unavailable');
  return hash.digest('hex');
}

function readonlyMount(info) {
  const mounts = info
    .split('\n')
    .map((line) => line.split(' '))
    .filter((parts) => parts[4] === '/workspace/node_modules');
  return mounts.length === 1 && mounts[0][5].split(',').includes('ro');
}

function verify(root, info, expected) {
  return /^[a-f0-9]{64}$/u.test(expected) && readonlyMount(info) && fingerprint(root) === expected;
}

module.exports = { fingerprint, readonlyMount, verify };

if (require.main === module) {
  try {
    const root = '/workspace/node_modules';
    if (process.argv.length !== 3) throw Error('Mode unavailable');
    if (process.argv[2] === 'capture') process.stdout.write(fingerprint(root));
    else if (
      process.argv[2] === 'verify' &&
      verify(root, fs.readFileSync('/proc/self/mountinfo', 'utf8'), process.env.OOP_DEPENDENCY_DIGEST ?? '')
    )
      process.stdout.write('dependencies=passed\n');
    else throw Error('Dependency mismatch');
  } catch {
    process.stderr.write('dependency-check=failed\n');
    process.exitCode = 1;
  }
}
