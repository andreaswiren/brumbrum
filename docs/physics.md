# Vehicle physics

All vehicles use a dynamic Havok compound chassis with physical wheel/contact spheres. The motorcycle and snowmobile have two suspension contacts; ATV and monster truck have four. Mass, inertia, wheel spacing, suspension and drive force come from vehicle setup and shared configuration.

Suspension measures compression velocity along the surface normal and applies spring/damper forces along that normal at contact mounts. This avoids converting forward travel into artificial damper drag during wheelies and hills. Ground propulsion projects forward onto the surface tangent, with uphill assistance and lateral grip. The bike's 0.26 m suspension puts the loaded saddle near 1.05 m. Pitch follows the contact slope, roll leans up to approximately 54 degrees into full turns, and rear braking reduces lateral grip. Landings retain most forward momentum when upright and unbraked. These are deliberate arcade assists.

Wheelies shift weight and guide pitch toward a bounded target. Rear spring force is limited while lifting the front to prevent suspension/controller oscillation from launching the chassis. Space/gamepad A preload charges while held and applies a release impulse, except on the seated monster truck. Backward weight alone never charges preload. Wheelies retain acceleration at 75% of normal positive drive. Air steering inputs tilt sideways; pitch input controls flips. Air controls apply no lateral propulsion or steering force.

During a slide, motorcycle contact rays retain pitch but remove chassis roll; tyre support uses its projected vertical radius. This avoids false takeoffs and spherical-collider hovering at high lean angles.

The terrain floor guard sweeps support samples and checks exact rendered triangle heights before and after simulation. Penetrations are corrected immediately in both mesh and Havok transforms; inward velocity is removed while preserving riding speed. Teleports synchronize before suspension forces are applied, avoiding forces calculated around the old body position.

Simulation runs at 60 Hz. Render interpolation displays intermediate chassis poses and restores the exact physics transform after each frame. The camera follows the interpolated pose. Rider motion uses time-based smoothing, fixed-length limb solving and contact targets for each vehicle.

Crashes require severe impacts, sustained excessive lateral lean or inversion near the floor, with reset grace. Eleven capsule bodies and ten constrained joints form the detached rider. The textured character skeleton follows those proxies during both riding and ragdoll motion. After the ragdoll settles, the rider stands, runs over terrain to the stopped vehicle and lifts it upright. Reset and vehicle changes dispose constraints and imported-character resources.

Water support uses plane contacts above 14 m/s while upright. Submersion cuts propulsion and damps motion. After one second the vehicle returns to the nearest dry bank. Water entry and skimming drive separate splash, ripple and wake effects. Outside the 3 km half-extent and escape margin, a cooldown-limited velocity redirects toward centre at 115 m/s and upward at 125 m/s. Scoring excludes that launch.

At a stop the motorcycle blends into a supported 12.6 degree left lean and an 8 cm spring preload offset. Ground-contact ray reach stays unchanged to avoid a rest/airborne oscillation. The rider plants a toe against the sampled terrain without stretching the leg; throttle, preload or takeoff withdraws it smoothly. Steering pivot and axle-spin transforms are separate; four-wheel vehicles use inside/outside steering geometry.

Terrain guidance averages both wheel normals and smooths the support plane over a roughly 60 ms time constant. Air roll fades in after 0.12 seconds of uninterrupted flight, with roll-rate damping. Steering held from a ground corner is ignored as an air-trick request until released or reversed; explicit extra-roll input remains available. This avoids treating a brief suspension hop as a barrel roll, while preserving deliberate airborne control.

Crash recovery briefly fades the settled ragdoll into a connected kneeling pose, rises through fixed-length limb targets, then walks back at up to 2 m/s with eased acceleration and arrival. A distance-driven stance/swing cycle reduces foot skating; the pelvis follows terrain reach limits before the pickup animation.

ATV and monster-truck roll balance targets the sampled support plane rather than world-up, so their chassis bank with cross-slopes while their individual suspension contacts remain active.

Loose-surface slides derive a smoothed intensity from actual sideways speed. The renderer lowers the displayed bike by up to 6.5 cm (other vehicles 4.5 cm) to suggest tyre digging, then restores the exact simulation pose after rendering. Airborne, hard-surface and water contacts do not receive this offset. Surface spray adds dense rear-biased dust and ballistic soil clumps directed against lateral slip.
