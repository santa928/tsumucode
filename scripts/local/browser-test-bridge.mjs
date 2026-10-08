import { createServer, request } from 'node:http';

// 作者用診断。Browser内loopbackを実Composeへ渡し、originと認証を製品と同じに保つ。
export function bridge(port, hostname) {
  const server = createServer((req, res) => {
    const upstream = request(
      { hostname, port, path: req.url, method: req.method, headers: req.headers },
      (reply) => {
        res.writeHead(reply.statusCode, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on('error', () => res.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  server.on('upgrade', (req, client, head) => {
    const upstream = request({
      hostname,
      port,
      path: req.url,
      method: 'GET',
      headers: req.headers,
    });
    upstream.on('upgrade', (reply, socket, pending) => {
      client.write(
        `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(reply.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\r\n')}\r\n\r\n`,
      );
      if (head.length) socket.write(head);
      if (pending.length) client.write(pending);
      client.pipe(socket).pipe(client);
      client.on('close', () => socket.destroy());
      socket.on('close', () => client.destroy());
      socket.on('error', () => client.destroy());
    });
    upstream.on('error', () => client.destroy());
    upstream.on('response', (reply) => {
      reply.destroy();
      client.destroy();
    });
    client.on('error', () => upstream.destroy());
    upstream.end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve(server));
  });
}
