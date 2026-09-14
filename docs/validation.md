# First implementation validation

Validated locally on Windows with Node 22.14 and the Codex Chromium browser.

## Automated

`npm run typecheck`: strict TypeScript checks for client, shared packages and tests.

`npm test`: eleven tests covering negative sector boundaries, coordinate round trips, boundary height continuity, intentional jump profiles, JSON world serialization, surface tuning, real Havok spring equilibrium, acceleration/jump/landing, braking/reset, steering/inverted crash and 30-vs-120-FPS fixed-step consistency.

The physics integration suite loads the real Havok WASM into Babylon's NullEngine and builds the same terrain and motorcycle as the browser. In the first-jump run, full throttle reached about 20 m/s and roughly 1.7 seconds of airtime, followed by a successful landing. These are implementation checks, not a substitute for subjective handling playtests.

`npm run build`: TypeScript plus Vite production bundle. The full Babylon imports produce an approximately 6 MB uncompressed JavaScript entry and a 2 MB WASM asset. Vite reports a bundle-size warning. Modular imports/lazy effects and further asset compression are follow-up optimizations; the warning is not suppressed.

`npm audit`: zero known vulnerabilities in the installed lockfile at validation time.

## Browser

- WebGPU initialization and live terrain/rider rendering.
- Explicit `?renderer=webgl2` fallback initialization and live HUD.
- Control help open/close, sound on/off, low graphics, camera cycling and reset buttons.
- Terrain faces, soil detail, spatial trees/grass, shadow rendering and interface visually inspected.
- No browser console errors during the checked interactions.
- Built production output launched through `npm run preview` with packaged WASM and WebGPU.

Hardware gamepad input and long-session exploration have not been manually verified. Frame-rate results vary with browser, hardware and sector construction. Synchronous near-sector building, procedural-art fidelity, terrain LOD seams and the large initial bundle remain known prototype limitations.

GitHub Actions runs typechecking, tests and production build on pushes and pull requests. A successful local check does not imply the remote workflow has already completed.
