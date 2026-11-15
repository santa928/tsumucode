import { clearTimeout, setTimeout } from 'node:timers';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { request } from 'node:http';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const image =
  'node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5';
const imagePath = `/v1.47/images/${encodeURIComponent(image)}/json`;
const classes = new Set(['present', 'http-404', 'http-4xx', 'http-5xx', 'unknown']);
export function formatImageCheck(phase, outcome) {
  return ['before', 'after'].includes(phase) && classes.has(outcome)
    ? `fixed-node-image phase=${phase} result=${outcome}`
    : 'fixed-node-image unknown';
}
// Only the pinned GET is permitted; response bodies and errors never leave the process.
export function checkImage(requestFn, timeout = 5000) {
  return new Promise((resolve) => {
    let req;
    let timer;
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };
    try {
      req = requestFn(
        { socketPath: '/var/run/docker.sock', path: imagePath, method: 'GET' },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on('data', (chunk) => {
            size += chunk.length;
            if (size > 2 * 1024 * 1024) {
              finish('unknown');
              res.destroy();
            } else chunks.push(chunk);
          });
          res.on('error', () => finish('unknown'));
          res.on('end', () => {
            const status = res.statusCode;
            if (status === 404) return finish('http-404');
            if (Number.isInteger(status) && status >= 400 && status < 500)
              return finish('http-4xx');
            if (Number.isInteger(status) && status >= 500 && status < 600)
              return finish('http-5xx');
            if (!Number.isInteger(status) || status < 200 || status >= 300)
              return finish('unknown');
            try {
              const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              return finish(
                value &&
                  typeof value === 'object' &&
                  !Array.isArray(value) &&
                  typeof value.Id === 'string' &&
                  /^sha256:[a-f0-9]{64}$/u.test(value.Id)
                  ? 'present'
                  : 'unknown',
              );
            } catch {
              return finish('unknown');
            }
          });
        },
      );
      req.on('error', () => finish('unknown'));
      timer = setTimeout(() => {
        finish('unknown');
        req.destroy();
      }, timeout);
      req.end();
    } catch {
      finish('unknown');
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const phase = process.argv.length === 3 ? process.argv[2] : '';
  if (phase !== 'before' && phase !== 'after') console.log('fixed-node-image unknown');
  else console.log(formatImageCheck(phase, await checkImage(request)));
}
