# Multiplayer rooms

Run `npm run server` alongside `npm run dev`. Vite proxies `/multiplayer` WebSockets to port 8080. For a built game, run `npm run build` then `npm run server`; the server serves the game and WebSocket endpoint together at `http://localhost:8080`. `HOST` and `PORT` configure its listener.

Open **MULTIPLAYER**, enter a name, create a room and copy its invitation. Opening the invitation joins that room automatically. Rooms support six riders and disappear when everyone leaves. The invitation address is editable. On localhost the menu suggests a LAN address; friends on the same network use that address and the frontend port. Internet invitations require a publicly reachable deployment with HTTPS and WebSocket upgrades forwarded to the server. A localhost address is not reachable from another computer.

The client sends local vehicle poses at 20 Hz. The server validates packet sizes, numeric data, vehicle kinds, names, room membership, sequence numbers and message rates, then broadcasts room snapshots at 20 Hz. Remote vehicles use a 100 ms interpolation buffer with quaternion interpolation, bounded extrapolation and teleport/reset handling. Local physics remains immediate. Remote vehicles are visual peers rather than local collision bodies.

Room score and longest-jump records are client-reported maxima for friendly freeride competition. This is a relay implementation, not an authoritative physics or anti-cheat server. The older input/checkpoint protocol types remain for a future authoritative implementation. Tree destruction is currently local to each player's simulation.

The server uses random invitation tokens, limits room capacity and client traffic, removes disconnected peers, pings for stale connections and bounds outgoing buffers. No account or external database is required. Room state is in memory and resets when the server restarts.
