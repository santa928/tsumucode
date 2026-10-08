import { writeFile, symlink, readFile, chmod } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { createServer } from '/opt/node_modules/vite/dist/node/index.js';

// 固定image内のbootstrapだけが設定を選ぶ。learnerの設定・.env・package scriptを読まない。
const packet = JSON.parse(Buffer.from(process.argv.slice(2).join(''), 'base64').toString('utf8'));
const { files, metadata, preview } = packet;
await writeFile('/tmp/applied.json', JSON.stringify(metadata), { flag: 'wx', mode: 0o600 });
for (const [name, source] of Object.entries(files))
  await writeFile(`/workspace/${name}`, source, { flag: 'wx', mode: 0o600 });
await symlink('/opt/node_modules', '/workspace/node_modules');
let server;
const transport = preview
  ? createHttpServer((req, res) => server.middlewares(req, res))
  : undefined;
const base = preview ? `/w/${metadata.workspaceId}/${metadata.runId}/` : '/';
server = await createServer({
  configFile: false,
  envDir: false,
  base,
  root: '/workspace',
  publicDir: false,
  cacheDir: '/tmp/vite',
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['127.0.0.1', ...(preview ? [`${metadata.runId}.localhost`] : [])],
    ...(preview
      ? {
          middlewareMode: true,
          ws: {
            server: transport,
            host: `${metadata.runId}.localhost`,
            clientPort: 4175,
            path: 'hmr',
          },
        }
      : {}),
    cors: false,
    forwardConsole: false,
    fs: { strict: true, allow: ['/workspace', '/opt/node_modules'] },
  },
  plugins: [
    {
      name: 'tsumucode-readiness',
      configureServer(vite) {
        vite.middlewares.use('/__tsumucode_ready', (req, res) => {
          res.setHeader('content-type', 'application/json');
          if (req.method !== 'GET') {
            res.writeHead(405).end('{}');
            return;
          }
          void readFile('/tmp/applied.json', 'utf8').then(
            (data) => res.end(data),
            () => res.writeHead(503).end('{}'),
          );
        });
        if (preview)
          vite.middlewares.use(`${base}api/echo`, (req, res) => {
            if (req.method !== 'POST' || req.url !== '/') {
              res.writeHead(405).end();
              return;
            }
            let bytes = 0;
            const chunks = [];
            req.on('data', (chunk) => {
              bytes += chunk.length;
              if (bytes > 64 * 1024) req.destroy();
              else chunks.push(chunk);
            });
            req.on('end', () => {
              res.setHeader('content-type', 'text/plain; charset=utf-8');
              res.end(Buffer.concat(chunks));
            });
          });
      },
    },
  ],
});
if (preview) {
  await new Promise((resolve, reject) => {
    transport.once('error', reject);
    transport.listen('/transport/http.sock', resolve);
  });
  await chmod('/transport/http.sock', 0o660);
  createHttpServer(server.middlewares).listen(5173, '127.0.0.1');
} else await server.listen();
