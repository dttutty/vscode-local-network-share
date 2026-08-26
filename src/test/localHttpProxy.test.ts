import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as net from 'node:net';
import test from 'node:test';
import { LocalHttpProxy, parseConnectAuthority } from '../localHttpProxy';

test('parses a normal CONNECT authority', () => {
  assert.deepEqual(parseConnectAuthority('example.com:8443'), { host: 'example.com', port: 8443 });
});

test('uses port 443 when CONNECT omits a port', () => {
  assert.deepEqual(parseConnectAuthority('example.com'), { host: 'example.com', port: 443 });
});

test('parses an IPv6 CONNECT authority', () => {
  assert.deepEqual(parseConnectAuthority('[::1]:443'), { host: '::1', port: 443 });
});

test('rejects unsafe or malformed CONNECT authorities', () => {
  assert.equal(parseConnectAuthority('user@example.com:443'), undefined);
  assert.equal(parseConnectAuthority('example.com:70000'), undefined);
  assert.equal(parseConnectAuthority('example.com:443/path'), undefined);
});

test('forwards absolute HTTP proxy requests', async () => {
  const upstream = http.createServer((_request, response) => response.end('through-proxy'));
  const upstreamPort = await listen(upstream);
  const proxy = new LocalHttpProxy();
  const proxyPort = await proxy.start();

  try {
    const body = await new Promise<string>((resolve, reject) => {
      http.get({
        hostname: '127.0.0.1',
        port: proxyPort,
        path: `http://127.0.0.1:${upstreamPort}/test`,
      }, (response) => {
        let value = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => { value += chunk; });
        response.once('end', () => resolve(value));
      }).once('error', reject);
    });
    assert.equal(body, 'through-proxy');
  } finally {
    await proxy.stop();
    await close(upstream);
  }
});

test('creates an HTTP CONNECT tunnel', async () => {
  const upstream = net.createServer((socket) => {
    socket.on('data', (chunk) => socket.write(`echo:${chunk.toString()}`));
  });
  const upstreamPort = await listen(upstream);
  const proxy = new LocalHttpProxy();
  const proxyPort = await proxy.start();

  try {
    await new Promise<void>((resolve, reject) => {
      const client = net.connect({ host: '127.0.0.1', port: proxyPort });
      let response = '';
      let sentPayload = false;
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('CONNECT integration test timed out.'));
      }, 2_000);
      client.once('error', reject);
      client.once('connect', () => {
        client.write(`CONNECT 127.0.0.1:${upstreamPort} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`);
      });
      client.on('data', (chunk) => {
        response += chunk.toString();
        if (!sentPayload && response.includes('\r\n\r\n')) {
          assert.match(response, /^HTTP\/1\.1 200/u);
          sentPayload = true;
          client.write('ping');
        }
        if (response.includes('echo:ping')) {
          clearTimeout(timeout);
          client.destroy();
          resolve();
        }
      });
    });
  } finally {
    await proxy.stop();
    await close(upstream);
  }
});

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test server did not receive a TCP port.');
  }
  return address.port;
}

async function close(server: net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
