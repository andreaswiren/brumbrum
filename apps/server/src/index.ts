import { createRoomServer } from './server.ts';
const server = createRoomServer();
const port = Number(process.env.PORT ?? 8080),
  host = process.env.HOST ?? '0.0.0.0';
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error('PORT must be a valid TCP port.');
const boundPort = await server.listen(port, host);
console.log(
  `Brumbrum game and invitation rooms: http://${host}:${boundPort} (WebSocket /multiplayer)`,
);
const stop = async () => {
  await server.close();
  process.exit(0);
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
