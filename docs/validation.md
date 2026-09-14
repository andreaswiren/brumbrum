# Validation

Validated locally on Windows with Node.js 22.14, real Havok WASM and the Codex Chromium browser.

## Automated

`npm test`: 73 tests across world geometry, keyboard/Xbox mapping, real vehicle physics, interpolation, camera, rider motion/skinning, vehicle meshes, snow and scoring.

Physics coverage includes all four vehicles accelerating/steering/resetting, spring equilibrium, natural takeoff/landing, braking, tilt, wheelies, charged preload, hard landings preserving speed, no airborne steering, penetration recovery, nose-down recovery, physical ragdoll cleanup and automatic stand/walk/pickup recovery, long-distance teleports, the boundary ramp/return force, hydroplaning and 30-vs-120-render-FPS consistency.

The latest wheelie regression requires the rear wheel to remain supported through the lift and limits peak pitch. The regression permits at most three unsupported substeps during a controlled lift. A separate full-steer test requires deep lean, lateral slip and continued contact. The level-ground motorcycle check exceeds 175 km/h. The boundary test climbs more than 170 m; the escape-force test rises more than 200 m. These controlled tests do not replace subjective long-session playtesting.

Steering regressions check separate suspension/axle pivots on the bike, ATV and truck, including inside/outside wheel angles. Real Havok checks cover hillside corners, held steering across takeoff versus a fresh air input, the supported idle stance withdrawing under throttle, and four-wheel contact on a banked truck platform. Rider tests load the actual GLB skeleton and check deformation bounds, exact grip/foot attachment, fixed limb lengths, frame-rate independent smoothing and disposed-during-load cleanup. Recovery tests also check connected joints through get-up and walking and stationary stance feet. The human mesh is checked for bounded deformation, compact feet, actual saddle contact, toe clearance against terrain, and ragdoll following without bone scaling. Engine tests cover gearbox hysteresis, airborne revving and frame-independent decay to idle after a crash. Scoring tests cover bank-once behavior, physical rotations, clean landing bonuses, small-hop rejection, crash/reset cancellation, unlimited time, horizontal jump distance, height above takeoff with peak retention, and persistent personal bests.

`npm run typecheck` and `npm run build` pass. The production entry is approximately 6.5 MB uncompressed (1.44 MB gzip), plus 2.09 MB WASM and approximately 20 MB of local art. Vite reports a large-chunk warning; it is not suppressed. `npm audit` reports zero known vulnerabilities at validation time.

## Browser

WebGPU and explicit WebGL2 startup, local asset loading, textured rider appearance, HUD/score display, sound activation, vehicle selector, snowmobile destination and production preview were inspected. The browser detected an Xbox One Game Controller. Cascaded shadows and contact occlusion were inspected, including high/low quality switching in WebGL2 without reported shader errors. Keyboard and controller behavior also have adapter/integration coverage; physical controller handling still benefits from the user's live playtests.

Known limits: synchronous near-sector construction can cause traversal/loading spikes; world art remains a mix of photographs, a skinned human with procedural riding gear and procedural vehicle/prop meshes. Shared multiplayer rankings are protocol definitions, not a running online service. GitHub Actions repeats typechecks, tests and build; local success does not imply its remote run has completed.
