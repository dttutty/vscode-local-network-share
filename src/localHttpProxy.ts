import * as http from 'node:http';
import * as net from 'node:net';
import type { Duplex } from 'node:stream';

export interface ConnectAuthority {
  host: string;
  port: number;
}

export class LocalHttpProxy {
  private server: http.Server | undefined;
  private readonly sockets = new Set<net.Socket>();
  private port: number | undefined;

  get localPort(): number | undefined {
    return this.port;
  }

  async start(): Promise<number> {
    if (this.server && this.port) {
      return this.port;
    }

    const server = http.createServer((request, response) => this.handleHttpRequest(request, response));
    server.on('connect', (request, clientSocket, head) => this.handleConnect(request, clientSocket, head));
    server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(0, '127.0.0.1');
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('The local HTTP proxy did not receive a TCP port.');
    }
    this.server = server;
    this.port = address.port;
    return address.port;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.port = undefined;
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    if (!server) {
      return;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private handleConnect(request: http.IncomingMessage, clientSocket: Duplex, head: Buffer): void {
    const authority = parseConnectAuthority(request.url ?? '');
    if (!authority) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }

    const upstream = net.connect({ host: authority.host, port: authority.port });
    upstream.setTimeout(30_000);
    clientSocket.once('close', () => upstream.destroy());
    upstream.once('close', () => {
      if (!clientSocket.destroyed) {
        clientSocket.destroy();
      }
    });
    upstream.once('connect', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) {
        upstream.write(head);
      }
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });
    upstream.once('timeout', () => upstream.destroy(new Error('Proxy connection timed out.')));
    upstream.once('error', () => {
      if (!clientSocket.destroyed) {
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      }
    });
  }

  private handleHttpRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
    let target: URL;
    try {
      target = new URL(request.url ?? '');
    } catch {
      response.writeHead(400, { Connection: 'close' });
      response.end('The proxy request must use an absolute HTTP URL.');
      return;
    }
    if (target.protocol !== 'http:') {
      response.writeHead(400, { Connection: 'close' });
      response.end('HTTPS proxy requests must use CONNECT.');
      return;
    }

    const headers = { ...request.headers };
    delete headers['proxy-authorization'];
    delete headers['proxy-connection'];
    headers.host = target.host;

    const upstream = http.request({
      protocol: 'http:',
      hostname: target.hostname,
      port: target.port ? Number(target.port) : 80,
      method: request.method,
      path: `${target.pathname}${target.search}`,
      headers,
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.setTimeout(30_000, () => upstream.destroy(new Error('Proxy request timed out.')));
    upstream.once('error', () => {
      if (!response.headersSent) {
        response.writeHead(502, { Connection: 'close' });
      }
      response.end('The local HTTP proxy could not reach the destination.');
    });
    request.pipe(upstream);
  }
}

export function parseConnectAuthority(value: string): ConnectAuthority | undefined {
  let parsed: URL;
  try {
    parsed = new URL(`http://${value}`);
  } catch {
    return undefined;
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return undefined;
  }
  const port = parsed.port ? Number(parsed.port) : 443;
  if (!parsed.hostname || !Number.isInteger(port) || port < 1 || port > 65_535) {
    return undefined;
  }
  const host = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  return { host, port };
}
