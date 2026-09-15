# BRUMBRUM — Pine Valley

Browser motocross freeride playground built with TypeScript, Babylon.js, Havok and Vite. Ride a motorcycle, ATV, monster truck or snowmobile through a 6 km square world, jump, perform tricks, crash and start again.

## Run

Requires Node.js 22.14+ and npm 10+.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173 with hardware acceleration. WebGPU is preferred; WebGL2 is the fallback. Add `?renderer=webgl2` to explicitly test it. Production: `npm run build`, then `npm run preview` (port 4173). Deploy `apps/client/dist` as a static site, retaining the asset paths and Havok WASM.

```sh
npm run typecheck
npm test
npm run build
```

## Controls

| Action                                         | Keyboard                | Xbox gamepad              |
| ---------------------------------------------- | ----------------------- | ------------------------- |
| Throttle / brake                               | W / S                   | RT / LT                   |
| Reverse after stopping                         | Hold S, release W       | Hold LT, release RT       |
| Steer and lean on ground; tilt sideways in air | A / D                   | Left stick X              |
| Weight / pitch                                 | Up / Down               | Left stick Y              |
| Wheelie                                        | Hold Down with throttle | Pull stick back with RT   |
| Charge / release preload                       | Hold / release Space    | Hold / release A          |
| Extra lean / air roll                          | Left / Right arrows     | D-pad left / right        |
| Orbit camera                                   | —                       | Right stick               |
| Rear brake                                     | Shift                   | LB                        |
| Reset                                          | R                       | R3                        |
| Return to start                                | Home                    | Start destination in help |
| Camera                                         | C                       | Y                         |
| Help / destinations                            | ? / Escape              | Menu                      |
| Manual bail                                    | B                       | —                         |
| Diagnostics / wireframe                        | F3 / F4                 | —                         |

Preload jumps work on the motorcycle, ATV and snowmobile; the monster truck cannot preload jump. Holding backward only lifts the front and still allows reduced acceleration.

The main brake overrides throttle. Keep holding S / LT at a stop for 0.3 seconds with the accelerator released to reverse: the ATV and monster truck back up at up to 4 m/s, the snowmobile at 6 m/s. The motorcycle has no powered reverse; the rider pushes it backward with one foot at about 1 m/s. Release the brake to stop pushing, or accelerate to ride forward. Braking into a grounded corner lets the rear slide outward and increases turn rotation.

Air input tilts the vehicle; it does not steer its flight path. Steering held over a bump keeps the bike stable: release and reapply it (or reverse direction) to tilt deliberately after takeoff. Press a controller button to expose it to the browser. Only standard-mapped gamepads drive the vehicle, preventing connected flight sticks from injecting resting-axis input. Audio starts on a keyboard/pointer gesture; click **ENABLE SOUND** if riding only with a controller.

Select a vehicle using the **VEHICLE** menu. Snowmobile selection takes you to Frost Ridge. The help panel has destinations for the start, Mirror Lake, boundary wall and snow tracks.

## Playground

- A railway loop and Pine Valley station, two winding rivers, rideable timber bridges and medium wooden launch ramps. Four graded dirt roads connect both bridge ends to existing trails, with clear approaches. Help includes shortcuts to the station, crossing and timber jumps.
- **MULTIPLAYER** creates a six-rider WebSocket room with copyable invitations, interpolated remote vehicles and shared score/longest-jump records. Run `npm run server` alongside the dev client; a production server also serves the built game on port 8080. See [multiplayer setup](docs/multiplayer.md).

- **GRAPHICS** opens persistent quality and image-style settings: Natural, Vivid, Saturated, Energetic and Filmic. Adjust exposure, saturation, bloom, vehicle-focused depth of field, ambient occlusion, MSAA/FXAA, vegetation and animated blue water independently.
- Forest sectors mix multiple imported pine, young-pine and snag meshes, including mature pines 20–34 m tall, with six gray rock assets embedded into terrain. Higher vegetation settings add denser trees and ground cover.
- Fast impacts break trees into falling trunks, stumps and chips; monster trucks break typical trees around 25–35 km/h, while lighter vehicles need substantially more speed. Broken trees stay down during the session. All vehicles throw visible dust and debris while driving on loose ground, with stronger spray during slides.

- Assisted Havok suspension with slope following, deep corner lean with progressive loose-surface slides, controlled wheelies, preload and forgiving landings. Motorcycle level-ground speed is over 175 km/h in the integration test.
- Compound chassis/wheel colliders and a swept terrain floor guard. Physics-safe reset/teleport synchronization prevents spurious suspension torque. Fixed-step render interpolation smooths movement between simulation ticks.
- Continuous skinned Quaternius human from the supplied Mesh2Motion library, with 66 joints, articulated hands/fingers/feet and original human proportions, with vehicle-specific riding poses, fixed hand/foot contacts, forward preload crouch and landing absorption. The rider sits on the saddle, rests a foot on terrain at a stop and subtly breathes; throttle smoothly returns the foot to its peg. Physical crashes detach an eleven-body, ten-joint ragdoll; the character mesh follows it, then gets up, runs back and lifts the vehicle to continue. R skips recovery.
- Photographic forest-floor textures, optimized pine models, HDR sky, cascaded directional shadows, screen-space ground contact occlusion, grass and many large collidable boulders. Front wheels visibly steer independently of axle rotation; ATV/truck steering includes inside/outside wheel angles. Wheels emit surface-matched dust, snow powder and water spray.
- Shadow cascades use a stable projection during speed-dependent camera zoom. Railway grading clears the terrain beneath both rails. Dust is suppressed independently for wheels touching railway beds, platforms and wooden decks; loose ground below a bridge still emits dirt.
- More elevated hills, designed takeoff lips, three lakes and a snowy circuit. Above roughly 50 km/h, upright vehicles can skim water; water entry throws up droplets and expanding rings, and skimming leaves a fading foam wake. A flooded engine cannot drive underwater; the vehicle automatically returns to shore.
- A 210 m boundary ramp surrounds the square. Escaping its lip triggers an upward/inward launch; these launches cannot earn jump records or trick scores.
- Unlimited development runs with elapsed time, airtime points, physical flip/spin/roll detection and clean-landing bonuses. A bold top-center popup shows the last landed trick award, beside live airtime, horizontal distance and height above takeoff. The readout briefly holds the final distance and peak height on landing. Hops must exceed 0.7 s airborne, 10 m horizontal distance and 1 m vertical travel before scoring. Points bank after a stable landing; crashes and teleports discard pending combos. **NEW RUN** resets the run.
- Current jump distance, run longest jump and a locally saved personal best. Distances are horizontal takeoff-to-landing displacement.

## Current limits

This remains a developing arcade prototype, not finished AAA art or a full tire simulator. Vehicles have detailed procedural mesh bodies; the rider uses a human mesh with procedural riding gear. Audio blends a CC0 recorded engine loop with combustion harmonics, gear shifts and procedural landing/obstacle/crash effects. Water uses an environment reflection rather than scene reflections. Near-sector collision construction is synchronous and can still cause loading spikes during fast traversal or destination changes.

Multiplayer rooms relay client poses and client-reported records for friendly competition; authoritative physics, anti-cheat ranking and shared tree destruction are not implemented. Internet invitations need a publicly reachable game server. Runs have no three-minute cutoff. Personal persistence is browser-local and optional when storage is blocked.

See [physics](docs/physics.md), [world format](docs/world-format.md), [architecture](docs/architecture.md), [validation](docs/validation.md), [assets](docs/assets.md), and [multiplayer protocol](docs/multiplayer.md).
