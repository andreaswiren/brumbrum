# Architecture and decisions

`apps/client/src/game/Game.ts` is the composition root: renderer selection, physics initialization, module construction and the render loop. Scene startup awaits Havok before adding colliders. A visible failure state replaces the loader if initialization fails.

| Module                   | Responsibility                                                           |
| ------------------------ | ------------------------------------------------------------------------ |
| `input/InputManager`     | Keyboard/gamepad → normalized actions; edge-triggered reset/camera       |
| `world/TerrainWorld`     | Sector residency, terrain geometry/collision, spatial vegetation batches |
| `vehicles/Motorcycle`    | Physical chassis, two suspension contacts, assists and crash/reset       |
| `vehicles/BikeVisual`    | Replaceable procedural bike and independent rider transform              |
| `camera/ChaseCamera`     | Smoothed chase/far/helmet view and terrain clearance                     |
| `audio/EngineAudio`      | Gesture-started layered synthesis driven by speed and throttle           |
| `ui/Hud`                 | DOM interface and throttled telemetry/map updates                        |
| `packages/configuration` | Physics, surfaces, bike, world, camera, graphics and network tuning      |
| `packages/world-format`  | Deterministic world queries, coordinates and versioned world definition  |
| `packages/protocol`      | Shared future network messages, no transport implementation              |

Simulation runs through Babylon's physics substep observer at 60 Hz. Input is sampled each render frame and reused by the fixed steps. Rendering, camera and telemetry have separate update cadence. Browser visibility suspends rendering; blur clears held keys. Havok retains transform ownership except for a single prestep during teleport.

Terrain vertices are sector-local; addresses and world queries are independent of Babylon. This separates future serialization and floating-origin work from rendering. A future origin service must translate all resident transforms and Havok bodies together, while keeping logical world coordinates stable. Current code does not pretend to perform that rebasing.

The client is an npm workspace with explicit shared packages. A server workspace should be added with Colyseus in Phase 7, after the local controller is tuned. Empty server classes and placeholder transports are deliberately avoided. Vehicle expansion should extract the proven contact solver into a shared module, with separate two- and four-wheel handling configurations; inheritance is not required.

Graphics presets currently adjust render scaling and shadow resolution. Tree density fields are reserved configuration and not yet applied at runtime. Effects are intentionally limited to lighting, fog, shadows, instancing and terrain detail. No expensive postprocessing is enabled by default.
