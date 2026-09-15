import { PhysicsMotionType, PhysicsRaycastResult, Scene, Vector3 } from '@babylonjs/core';
import type { PhysicsBody } from '@babylonjs/core';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import { collisionHeight } from '@brumbrum/world-format';

/** Sample nearby solid scenery below the rider, excluding vehicles and ragdolls.
 * Starting at ankle-column vehicle height also keeps overhead decks out of reach. */
export function riderGroundHeight(scene: Scene, ankleColumn: Vector3): number {
  let height = collisionHeight(ankleColumn.x, ankleColumn.z);
  const physics = scene.getPhysicsEngine() as PhysicsEngine | null;
  if (!physics?.raycastToRef) return height;
  const end = ankleColumn.subtract(new Vector3(0, 1.6, 0));
  const from = ankleColumn.clone(),
    hit = new PhysicsRaycastResult();
  let ignoreBody: PhysicsBody | undefined;
  // Some bundled Havok runtimes return only the nearest hit even for a multi-ray.
  // Step through rejected dynamic bodies so a bike cannot obscure its deck.
  for (let pass = 0; pass < 8; pass++) {
    physics.raycastToRef(from, end, hit, { shouldHitTriggers: false, ignoreBody });
    if (!hit.hasHit) break;
    if (
      hit.hasHit &&
      hit.body?.getMotionType(hit.bodyIndex) === PhysicsMotionType.STATIC &&
      hit.hitNormalWorld.y > 0.45 &&
      hit.hitPointWorld.y <= ankleColumn.y + 0.001
    ) {
      height = Math.max(height, hit.hitPointWorld.y);
      break;
    }
    ignoreBody = hit.body;
    from.y = hit.hitPointWorld.y - 0.002;
    if (from.y <= end.y) break;
  }
  return height;
}
