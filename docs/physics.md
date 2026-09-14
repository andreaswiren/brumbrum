# Vehicle physics

All vehicles use a dynamic Havok compound chassis with physical wheel/contact spheres. The motorcycle and snowmobile have two suspension contacts; ATV and monster truck have four. Mass, inertia, wheel spacing, suspension and drive force come from vehicle setup and shared configuration.

Suspension measures compression velocity along the surface normal and applies spring/damper forces along that normal at contact mounts. This avoids converting forward travel into artificial damper drag during wheelies and hills. Ground propulsion projects forward onto the surface tangent, with uphill assistance and lateral grip. The bike's 0.26 m suspension puts the loaded saddle near 1.05 m. Pitch follows the contact slope, roll leans up to approximately 54 degrees into full turns, and rear braking reduces lateral grip. Landings retain most forward momentum when upright and unbraked. These are deliberate arcade assists.

Wheelies shift weight and guide pitch toward a bounded target. Rear spring force is limited while lifting the front to prevent suspension/controller oscillation from launching the chassis. Space/gamepad A preload charges while held and applies a release impulse, except on the seated monster truck. Backward weight alone never charges preload. Wheelies retain acceleration at 75% of normal positive drive. Air steering inputs tilt sideways; pitch input controls flips. Air controls apply no lateral propulsion or steering force.

During a slide, motorcycle contact rays retain pitch but remove chassis roll; tyre support uses its projected vertical radius. This avoids false takeoffs and spherical-collider hovering at high lean angles.

The terrain floor guard sweeps support samples and checks exact rendered triangle heights before and after simulation. Penetrations are corrected immediately in both mesh and Havok transforms; inward velocity is removed while preserving riding speed. Teleports synchronize before suspension forces are applied, avoiding forces calculated around the old body position.

Simulation runs at 60 Hz. Render interpolation displays intermediate chassis poses and restores the exact physics transform after each frame. The camera follows the interpolated pose. Rider motion uses time-based smoothing, fixed-length limb solving and contact targets for each vehicle.

Crashes require severe impacts, sustained excessive lateral lean or inversion near the floor, with reset grace. Eleven capsule bodies and ten constrained joints form the detached rider. The textured character skeleton follows those proxies during both riding and ragdoll motion. After the ragdoll settles, the rider stands, runs over terrain to the stopped vehicle and lifts it upright. Reset and vehicle changes dispose constraints and imported-character resources.

Water support uses plane contacts above 14 m/s while upright. Submersion cuts propulsion and damps motion. After one second the vehicle returns to the nearest dry bank. Water entry and skimming drive separate splash, ripple and wake effects. Outside the 3 km half-extent and escape margin, a cooldown-limited velocity redirects toward centre at 115 m/s and upward at 125 m/s. Scoring excludes that launch.
