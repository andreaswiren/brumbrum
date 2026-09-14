import { createServer, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  parseRealtimeMessage,
  REALTIME_LIMITS,
  type RealtimeErrorCode,
  type RealtimePose,
  type RealtimeRecord,
  type RealtimeServerMessage,
} from '../../../packages/protocol/src/realtime.ts';

interface Client {
  socket: WebSocket;
  id: string;
  name: string;
  room?: Room;
  pose?: RealtimePose;
  sequence: number;
  alive: boolean;
  tokens: number;
  lastRefill: number;
  joinedTimer: ReturnType<typeof setTimeout>;
}
interface Room {
  token: string;
  players: Map<string, Client>;
  records: Map<string, RealtimeRecord>;
}
export interface RoomServerOptions {
  clientDirectory?: string;
  snapshotMs?: number;
  heartbeatMs?: number;
  joinTimeoutMs?: number;
  maxClients?: number;
}
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.hdr': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export function createRoomServer(options: RoomServerOptions = {}) {
  const rooms = new Map<string, Room>(),
    clients = new Set<Client>();
  const directory = resolve(
    options.clientDirectory ?? fileURLToPath(new URL('../../client/dist/', import.meta.url)),
  );
  const json = (response: ServerResponse, status: number, payload: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(payload));
  };
  const http = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
      }
      if (pathname === '/health') {
        json(response, 200, {
          ok: true,
          rooms: rooms.size,
          players: clients.size,
          snapshotHz: REALTIME_LIMITS.snapshotHz,
        });
        return;
      }
      if (pathname === '/api/network') {
        const addresses = [
          ...new Set(
            Object.values(networkInterfaces()).flatMap((entries) =>
              (entries ?? [])
                .filter((entry) => entry.family === 'IPv4' && !entry.internal)
                .map((entry) => entry.address),
            ),
          ),
        ];
        json(response, 200, { addresses });
        return;
      }
      if (pathname === '/multiplayer') {
        json(response, 426, { error: 'WebSocket upgrade required' });
        return;
      }
      if (pathname.includes('\0') || pathname.split(/[\\/]/).some((part) => part.startsWith('.'))) {
        json(response, 404, { error: 'Not found' });
        return;
      }
      let target = resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
      const within = (path: string) => {
        const rel = relative(directory, path);
        return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
      };
      if (!within(target)) {
        json(response, 404, { error: 'Not found' });
        return;
      }
      let info;
      try {
        target = await realpath(target);
        info = await stat(target);
      } catch {
        if (!extname(pathname)) {
          target = resolve(directory, 'index.html');
          info = await stat(target);
        } else throw new Error('not found');
      }
      if (!within(target) || !info.isFile()) {
        json(response, 404, { error: 'Not found' });
        return;
      }
      response.writeHead(200, {
        'content-type': contentTypes[extname(target)] ?? 'application/octet-stream',
        'content-length': info.size,
        'x-content-type-options': 'nosniff',
        'cache-control': extname(target) === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      if (request.method === 'HEAD') response.end();
      else
        createReadStream(target)
          .on('error', () => response.destroy())
          .pipe(response);
    } catch {
      if (!response.headersSent)
        json(response, 404, {
          error: 'Build the client with npm run build before serving the game.',
        });
      else response.destroy();
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: REALTIME_LIMITS.messageBytes,
    perMessageDeflate: false,
  });
  const send = (client: Client, message: RealtimeServerMessage) => {
    if (client.socket.readyState !== WebSocket.OPEN) return;
    if (client.socket.bufferedAmount > 256 * 1024) {
      client.socket.close(1013, 'Connection too slow');
      return;
    }
    client.socket.send(JSON.stringify(message));
  };
  const error = (client: Client, code: RealtimeErrorCode, message: string, close = false) => {
    send(client, { type: 'error', code, message });
    if (close) client.socket.close(1008, code);
  };
  const membership = (room: Room) => {
    const message: RealtimeServerMessage = {
      type: 'room',
      members: [...room.players.values()].map((client) => ({ id: client.id, name: client.name })),
    };
    room.players.forEach((client) => send(client, message));
  };
  const leave = (client: Client) => {
    clearTimeout(client.joinedTimer);
    clients.delete(client);
    if (!client.room) return;
    const room = client.room;
    room.players.delete(client.id);
    client.room = undefined;
    if (room.players.size === 0) rooms.delete(room.token);
    else membership(room);
  };
  http.on('upgrade', (request, socket, head) => {
    if (
      new URL(request.url ?? '/', 'http://localhost').pathname !== '/multiplayer' ||
      clients.size >= (options.maxClients ?? 600)
    ) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });
  wss.on('connection', (socket) => {
    const client: Client = {
      socket,
      id: randomUUID(),
      name: '',
      sequence: -1,
      alive: true,
      tokens: REALTIME_LIMITS.messagesPerSecond,
      lastRefill: Date.now(),
      joinedTimer: setTimeout(
        () => socket.close(1008, 'join-required'),
        options.joinTimeoutMs ?? 8000,
      ),
    };
    clients.add(client);
    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('close', () => leave(client));
    socket.on('error', () => leave(client));
    socket.on('message', (data, binary) => {
      const now = Date.now();
      client.tokens = Math.min(
        REALTIME_LIMITS.messagesPerSecond,
        client.tokens + ((now - client.lastRefill) * REALTIME_LIMITS.messagesPerSecond) / 1000,
      );
      client.lastRefill = now;
      if (client.tokens < 1) {
        error(client, 'rate-limit', 'Send no more than 60 messages per second.', true);
        return;
      }
      client.tokens--;
      let message;
      try {
        if (binary) throw new Error('binary');
        message = parseRealtimeMessage(JSON.parse(data.toString()));
      } catch {
        message = null;
      }
      if (!message) {
        error(client, 'invalid-message', 'Invalid multiplayer message.', true);
        return;
      }
      if (message.type === 'join') {
        if (client.room) {
          error(client, 'already-joined', 'Already in a room.');
          return;
        }
        let room = message.room ? rooms.get(message.room) : undefined;
        if (message.room && !room) {
          error(
            client,
            'room-not-found',
            'This invitation has expired or the room no longer exists.',
            true,
          );
          return;
        }
        if (room && room.players.size >= REALTIME_LIMITS.playersPerRoom) {
          error(client, 'room-full', 'This room already has six riders.', true);
          return;
        }
        if (!room) {
          const token = randomBytes(18).toString('base64url');
          room = { token, players: new Map(), records: new Map() };
          rooms.set(token, room);
        }
        client.name = message.name;
        client.room = room;
        room.players.set(client.id, client);
        clearTimeout(client.joinedTimer);
        room.records.set(client.id, { id: client.id, name: client.name, score: 0, longestJump: 0 });
        while (room.records.size > 60) {
          const old = [...room.records.keys()].find((id) => !room.players.has(id));
          if (!old) break;
          room.records.delete(old);
        }
        send(client, { type: 'welcome', id: client.id, room: room.token });
        membership(room);
        return;
      }
      if (!client.room) {
        error(client, 'join-required', 'Join an invitation room first.', true);
        return;
      }
      const record = client.room.records.get(client.id)!;
      if (message.type === 'record') {
        if (message.kind === 'score') record.score = Math.max(record.score, message.value);
        else record.longestJump = Math.max(record.longestJump, message.value);
        return;
      }
      if (message.sequence <= client.sequence) return;
      client.sequence = message.sequence;
      client.pose = message.pose;
      record.score = Math.max(record.score, message.pose.score);
      record.longestJump = Math.max(record.longestJump, message.pose.longestJump);
    });
  });
  const tick = setInterval(() => {
    const time = Date.now();
    for (const room of rooms.values()) {
      const players = [...room.players.values()]
        .filter((client) => client.pose)
        .map((client) => ({ id: client.id, name: client.name, pose: client.pose! }));
      const records = [...room.records.values()].sort(
        (a, b) => b.score - a.score || b.longestJump - a.longestJump,
      );
      const message: RealtimeServerMessage = { type: 'snapshot', time, players, records };
      room.players.forEach((client) => send(client, message));
    }
  }, options.snapshotMs ?? 50);
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.socket.terminate();
        leave(client);
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }, options.heartbeatMs ?? 15_000);
  tick.unref();
  heartbeat.unref();
  return {
    http,
    wss,
    stats: () => ({ rooms: rooms.size, clients: clients.size }),
    listen: (port = 8080, host = '0.0.0.0') =>
      new Promise<number>((resolvePort, reject) => {
        const fail = (err: Error) => reject(err);
        http.once('error', fail);
        http.listen(port, host, () => {
          http.off('error', fail);
          const address = http.address();
          resolvePort(typeof address === 'object' && address ? address.port : port);
        });
      }),
    close: () =>
      new Promise<void>((resolveClose) => {
        clearInterval(tick);
        clearInterval(heartbeat);
        for (const client of clients) {
          clearTimeout(client.joinedTimer);
          client.socket.terminate();
        }
        clients.clear();
        rooms.clear();
        wss.close(() => {
          if (http.listening) http.close(() => resolveClose());
          else resolveClose();
        });
      }),
  };
}
