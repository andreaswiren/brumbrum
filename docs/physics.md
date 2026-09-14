# Vehicle physics

The motorcycle is a 145 kg dynamic Havok box with configured inertia. Wheels are visual children; each wheel has a downward chassis-space ray which ignores the chassis. Static terrain, trunks and rock colliders belong to Havok.

For each wheel contact:

```
compression = suspensionLength + wheelRadius - hitDistance
pointVelocity = linearVelocity + angularVelocity × leverArm
force = clamp(spring * compression - damper * dot(pointVelocity, up), 0, maxForce)
```

Force acts at each suspension mount and therefore generates pitch torque. Havok's `applyForce` applies an impulse immediately; angular velocity must be read again after spring forces, before assistance. Reading the pre-force angular velocity erased suspension torque; a real Havok regression test catches that failure.

Traction acts along chassis forward, decaying with speed, and is scaled by the detected surface. Lateral damping produces grip; the rear brake reduces it to allow slides. Main braking is velocity-limited to avoid launching backward. A light idle hill hold prevents unwanted rolling near the spawn. A Space edge adds an impulse with a one-second cooldown.

Steering uses assisted yaw rate, limited by speed; a damped roll controller maintains balance and adds lean. Suspension controls pitch on the ground. Air input accelerates pitch with light damping. This is assisted arcade handling, not a tire/steering-geometry motorcycle simulator. No artificial position animation propels the bike.

Crashes trigger from large body contact impulses, excessive downward speed on landing, and inverted ground proximity. The latter is necessary because inverted suspension rays point away from the ground. On a crash, suspension/traction/assists stop; the chassis continues physical collision and tumbling. The rider remains attached in Phase 1. Ragdoll bodies and constraints are Phase 2.

Safe positions are recorded periodically while grounded, upright and below a speed limit. Reset clears velocity and teleports once using Havok prestep. Home always returns to the initial spawn. All tuning lives in `packages/configuration`; ray contacts, compression, velocity and angular velocity are visible through F3.
