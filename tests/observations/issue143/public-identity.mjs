import { createHash } from 'node:crypto';
import { classifyIdentityResponse } from './identity-http-diagnostic.mjs';

// Read-only identity check; deliberately not a complete public-file receipt.
const root = 'https://santa928.github.io/tsumucode/';
const api = 'https://api.github.com/repos/santa928/tsumucode';
const expected = {
  'index.html': '916497abcb399f2624553292e8ac4d1be2a546452d5a144f190dba5f64ae4e18',
  'generated/content/catalog-v3.json': 'cda11e589e968948b8e94a0265eaed7a048f28ffb140467648084ed240a48491',
  'generated/content/courses/python-basics/index.json': '380b46f8bffe0aeebeb19394f0ef2b5c1c23e86004d6965241ed2f6157295698',
};
async function read(url) {
  const r = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!r.ok) {
    console.error(classifyIdentityResponse(r));
    throw Error(`Identity read failed (${r.status}): ${new URL(url).pathname}`);
  }
  return r;
}
const deployments = await (await read(api + '/deployments?environment=github-pages&per_page=1')).json();
const deployed = deployments[0];
if (String(deployed?.id) !== '7699435659' || deployed.sha !== 'b9306eb3414e69a2068603cfdbf2706ebe4e9284' || deployed.ref !== 'main' || deployed.environment !== 'github-pages') throw Error('Deployment changed; do not run observation');
const statuses = await (await read(api + '/deployments/7699435659/statuses')).json();
const status = statuses[0];
if (status?.state !== 'success' || status.environment_url !== root || !status.log_url?.startsWith('https://github.com/santa928/tsumucode/actions/runs/42929117936/job/')) throw Error('Deployment status differs');
for (const [name, sha] of Object.entries(expected)) {
  const bytes = Buffer.from(await (await read(root + name)).arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== sha) throw Error('Published file differs: ' + name);
}
console.log('Three candidate files and deployment identity match b9306eb; not a full public-file qualification.');
