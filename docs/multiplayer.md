# Multiplayer boundary (planned)

No multiplayer service runs in Phase 1. `packages/protocol` defines shared input commands, vehicle snapshots, crash/respawn events, race checkpoints, measured trick events and versioned session state. `packages/configuration` records the target six-player limit, 30 Hz server simulation and 20 Hz snapshots.

The planned Colyseus room owns membership, vehicle selection, respawns, checkpoints, timing and score derivation. Clients submit bounded sequenced input, not arbitrary score totals. A server must validate finite numeric fields, input rate, tick/sequence windows and position plausibility; TypeScript interfaces alone do not perform runtime validation.

Local prediction continues the immediate input path. Server acknowledgments permit replay/reconciliation of unacknowledged input. Remote snapshots should enter a buffered interpolator with smooth corrections and a teleport threshold. None of those runtime systems are represented as complete by this prototype.

Crash events transmit root state, velocity, angular velocity, impulse and deterministic seed. A future rider implementation simulates local ragdolls from that event; no every-bone replication is planned. Add event/schema version negotiation and serialization tests when transport is implemented.
