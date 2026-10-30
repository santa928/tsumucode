// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { fetchBytes } from '../../../../scripts/release/v2/captureBaseline';
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
});
async function endpoint(statuses: readonly number[]) {
  const seen: { path: string | undefined; cache: string | undefined }[] = [];
  const server = createServer((request, response) => {
    seen.push({ path: request.url, cache: request.headers['cache-control'] });
    const status = statuses[Math.min(seen.length - 1, statuses.length - 1)]!;
    response.writeHead(status, status === 302 ? { Location: '/redirected' } : {});
    response.end(status === 200 ? 'fixed-public-bytes' : 'unavailable');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Expected local HTTP address');
  return { url: `http://127.0.0.1:${String(address.port)}/asset.svg`, seen };
}
it.each([502, 503, 504])(
  'rechecks the same URL after transient HTTP%d and returns only successful bytes',
  async (status) => {
    const { url, seen } = await endpoint([status, 200]);
    expect(new TextDecoder().decode(await fetchBytes(url))).toBe('fixed-public-bytes');
    expect(seen).toEqual([
      { path: '/asset.svg', cache: 'no-cache' },
      { path: '/asset.svg', cache: 'no-cache' },
    ]);
  },
);
it('fails after at most3 attempts when public delivery remains unavailable', async () => {
  const { url, seen } = await endpoint([503]);
  await expect(fetchBytes(url)).rejects.toThrow('503');
  expect(seen).toHaveLength(3);
});
it('refuses missing content without retrying or accepting its error body', async () => {
  const { url, seen } = await endpoint([404, 200]);
  await expect(fetchBytes(url)).rejects.toThrow('404');
  expect(seen).toHaveLength(1);
});
it('does not follow a redirect into other content', async () => {
  const { url, seen } = await endpoint([302, 200]);
  await expect(fetchBytes(url)).rejects.toThrow();
  expect(seen).toHaveLength(1);
});
