import { request } from 'node:http';

// These are the exact b930 protocol constants, not values read from an environment or a response.
export const imageRefs = Object.freeze({
  node: 'node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5',
  python: 'python:3.14.2-slim-bookworm@sha256:e87711ef5c86aaeaa7031718a69db79d334d94c545c709583f651b8185870941',
});
const classes = new Set(['present', 'missing', 'request-rejected', 'daemon-error', 'unavailable', 'invalid-response', 'oversized', 'timeout']);
const limit = 2 * 1024 * 1024;
export function formatResult(phase, node, python) {
  return ['before', 'after'].includes(phase) && classes.has(node) && classes.has(python)
    ? `controller-images phase=${phase} node=${node} python=${python}` : 'controller-images unavailable';
}
export function probe(requestFn, image, timeout = 5000) {
  return new Promise(resolve => {
    let req, timer, finished = false;
    const finish = value => { if (finished) return; finished = true; clearTimeout(timer); resolve(value); };
    try {
      req = requestFn({ socketPath: '/var/run/docker.sock', path: `/v1.47/images/${encodeURIComponent(image)}/json`, method: 'GET' }, res => {
        let size = 0; const chunks = [];
        res.on('data', chunk => {
          size += chunk.length;
          if (size > limit) { finish('oversized'); res.destroy(); }
          else chunks.push(chunk);
        });
        res.on('error', () => finish('unavailable'));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status === 404) return finish('missing');
          if (status >= 500) return finish('daemon-error');
          if (status < 200 || status >= 300) return finish('request-rejected');
          try { const body = Buffer.concat(chunks); if (body.length) JSON.parse(body.toString('utf8')); finish('present'); }
          catch { finish('invalid-response'); }
        });
      });
      req.on('error', () => finish('unavailable'));
      timer = setTimeout(() => { finish('timeout'); req.destroy(); }, timeout);
      req.end();
    } catch { finish('unavailable'); }
  });
}
async function main(phase) {
  const node = await probe(request, imageRefs.node);
  const python = await probe(request, imageRefs.python);
  console.log(formatResult(phase, node, python));
}
if (process.argv[1] === '-' && ['--run-before', '--run-after'].includes(process.argv[2]) && process.argv.length === 3) {
  void main(process.argv[2] === '--run-before' ? 'before' : 'after').catch(() => console.log('controller-images unavailable'));
}
