import { HavokPlugin, PhysicsBody, TransformNode, Vector3 } from '@babylonjs/core';
import { collisionHeight } from '@brumbrum/world-format';
export interface FloorSample {
  point: Vector3;
  radius: number;
}
/** Last line of defence against thin-mesh tunnelling. Havok handles normal contact;
 * swept samples use the exact rendered collision triangles, not an unrelated floor. */
export function enforceFloor(
  node: TransformNode,
  body: PhysicsBody,
  samples: readonly FloorSample[],
  previous?: Vector3,
  preserveSpeed = false,
): boolean {
  node.computeWorldMatrix(true);
  const position = node.position,
    matrix = node.getWorldMatrix();
  let correction = 0;
  for (const sample of samples) {
    const p = Vector3.TransformCoordinates(sample.point, matrix);
    correction = Math.max(correction, collisionHeight(p.x, p.z) + sample.radius - p.y);
  }
  if (previous && Vector3.DistanceSquared(previous, position) > 1) {
    const steps = Math.min(24, Math.ceil(Vector3.Distance(previous, position)));
    for (let i = 1; i < steps; i++) {
      const p = Vector3.Lerp(previous, position, i / steps);
      correction = Math.max(correction, collisionHeight(p.x, p.z) + 0.2 - p.y);
    }
  }
  if (correction <= 0.015 || !Number.isFinite(correction)) return false;
  position.y += correction + 0.015;
  const velocity = body.getLinearVelocity();
  const dx =
    (collisionHeight(position.x + 0.2, position.z) -
      collisionHeight(position.x - 0.2, position.z)) /
    0.4;
  const dz =
    (collisionHeight(position.x, position.z + 0.2) -
      collisionHeight(position.x, position.z - 0.2)) /
    0.4;
  const normal = new Vector3(-dx, 1, -dz).normalize(),
    inward = Vector3.Dot(velocity, normal);
  if (inward < 0) {
    const tangent = velocity.subtract(normal.scale(inward));
    if (preserveSpeed && normal.y > 0.3) {
      const before = Math.hypot(velocity.x, velocity.z),
        after = Math.hypot(tangent.x, tangent.z);
      if (after > 1 && after < before) tangent.scaleInPlace(Math.min(110, before) / after);
    }
    body.setLinearVelocity(tangent);
  }
  body.disablePreStep = false;
  node.computeWorldMatrix(true);
  // Synchronize immediately, including when this guard runs after a substep.
  // This prevents displaying a penetrated frame or losing the correction on the next step.
  (
    node.getScene().getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin
  ).setPhysicsBodyTransformation(body, node);
  body.disablePreStep = true;
  return true;
}
