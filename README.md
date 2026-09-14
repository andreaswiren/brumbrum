# BRUMBRUM — Pine Valley

A playable browser motocross freeride vertical slice inspired by the freedom of Motocross Madness. TypeScript, Babylon.js, Havok and Vite in an npm workspace. Launch directly into a forest on a motorcycle: ride, jump, crash and reset.

## Run locally

Requires **Node.js 22.14+** and npm 10+.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173** in a desktop browser with hardware acceleration. The application prefers WebGPU and falls back to WebGL. Use `http://127.0.0.1:5173/?renderer=webgl2` to explicitly test the WebGL path. WebGPU requires localhost or HTTPS.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Production output is `apps/client/dist`. Serve that directory with any static HTTP server; preserve the generated `assets` paths, including the Havok WASM file. No backend or secrets are needed for this milestone.

## Ride

| Action                        | Keyboard            | Gamepad       |
| ----------------------------- | ------------------- | ------------- |
| Throttle                      | W / Up              | RT            |
| Main brake                    | S / Down            | LT            |
| Steer                         | A / D, Left / Right | Left stick X  |
| Rear brake / slide            | Shift               | LB            |
| Preload / hop                 | Space               | A             |
| Air pitch                     | I / K               | Right stick Y |
| Safe reset                    | R                   | R3            |
| Return to start               | Home                | —             |
| Camera: chase / far / helmet  | C                   | Y             |
| Diagnostics + suspension rays | F3                  | —             |
| Terrain wireframe             | F4                  | —             |

Click the game canvas after using a dropdown or button to return keyboard focus. Sound is optional and starts through the **SOUND OFF** button; browser audio requires a user gesture. The **?** button opens controls. Losing window focus releases controls.

The first natural jump is straight ahead, between the yellow flags. Keep accelerating along the dirt. Two larger ramps sit farther into the forest. Space gives a small suspension impulse; terrain and momentum create the main jumps. Crashes disable balance and traction assistance, leaving the chassis to tumble under Havok. Press R to reset upright at your last stable position.

## Delivered in this milestone

- WebGPU startup with fallback, local Havok WASM, strict TypeScript.
- Physical chassis with front/rear suspension rays, spring/damper forces, braking, grip, air pitch and configurable balance assistance.
- Physical crashes, fast safe reset and separate procedural rider visual.
- Deterministic hilly forest, three designed jump approaches and connected dirt routes.
- 256 m sectors: 3×3 nearby sectors with collision and 5×5 total visible sectors with lower-detail distant terrain. Spatial thin-instance tree and grass batches; collidable trunks and rocks.
- Speed-responsive chase camera, far and helmet views, terrain clearance, local map, speedometer, airtime, diagnostics and graphics controls.
- Optional layered synthesized engine audio.
- Shared configuration, world format and typed future multiplayer messages.
- Automated pure-data and real Havok simulation tests.

## Scope and next steps

This is **Phase 1**, using clean procedural placeholder art. It is not a finished AAA game. Rider skeletal animation, detachment/ragdoll, ATV/truck handling, other biomes, race/trick scoring, persistent worlds and Colyseus multiplayer are later phases. Multiplayer is intentionally not running before the base riding experience is developed further; no client score is trusted or presented as server-validated.

Streaming is an initial implementation: nearby sector rebuilds are synchronous, distant sectors build one per frame, and LOD borders do not yet have skirts. The terrain generator can continue indefinitely, but floating-origin rebasing is not implemented: stay near the current playground for this prototype. Art, audio and handling need further production work and human gamepad playtesting. The map's contour lines are illustrative; rider, route and jump positions are live. The weather display describes the fixed environment, not a weather simulation.

See [architecture](docs/architecture.md), [physics](docs/physics.md), [world format](docs/world-format.md), [protocol](docs/multiplayer.md), [validation](docs/validation.md) and [asset notes](docs/assets.md).
