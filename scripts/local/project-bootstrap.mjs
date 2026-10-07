import { writeFile, symlink } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { createServer } from '/opt/node_modules/vite/dist/node/index.js';

// 固定image内のbootstrapだけが設定を選ぶ。learnerの設定・.env・package scriptを読まない。
const files = JSON.parse(Buffer.from(process.argv.slice(2).join(''), 'base64').toString('utf8'));
for (const [name, source] of Object.entries(files))
  await writeFile(`/workspace/${name}`, source, { flag: 'wx', mode: 0o600 });
await symlink('/opt/node_modules', '/workspace/node_modules');
const server = await createServer({
  configFile: false,
  envFile: false,
  root: '/workspace',
  publicDir: false,
  cacheDir: '/tmp/vite',
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['127.0.0.1'],
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
          res.end(JSON.stringify({ profile: 'vite-project-v1' }));
        });
      },
    },
  ],
});
await server.listen();
