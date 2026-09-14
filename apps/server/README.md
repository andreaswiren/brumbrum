# Invitation room relay

Run `npx tsx apps/server/src/index.ts` from the repository root. `HOST` defaults to `0.0.0.0` and `PORT` to `8080`. After `npm run build`, the same process serves the built game and WebSockets at `/multiplayer`. Development Vite can proxy `/multiplayer` and `/api/network` to port 8080.

A socket first sends `{ "type": "join", "name": "Rider" }` to create a room, or includes `room` with an invitation token to join. Rooms allow six riders. The welcome packet supplies the rider ID and a cryptographically random 144-bit invitation token; links use `?room=TOKEN`. The token grants access to its room, so share it only with intended riders. Empty rooms disappear.

Clients send validated poses at up to 20 Hz. The server broadcasts snapshots every 50 ms, room membership on join/leave, and per-rider score/jump maxima. See `packages/protocol/src/realtime.ts` for the exact contract. These are **client-reported development records**, not authoritative or cheat-resistant competition results. Physics, vehicle contact and tree destruction remain local.

Validation rejects malformed/non-finite/out-of-range poses, binary packets, packets over 4096 bytes and sustained flooding. State sequence numbers reject stale updates. Slow consumers are disconnected; ping/pong and join timeouts clean up abandoned connections. `/api/network` exposes only this machine's external IPv4 addresses for LAN invitation links. `/health` exposes aggregate room/client counts. Production internet deployment should use HTTPS with a WebSocket-capable reverse proxy; invite links then share that public origin.
