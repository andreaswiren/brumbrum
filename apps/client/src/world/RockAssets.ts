import {
  Color3,
  ImportMeshAsync,
  Matrix,
  Mesh,
  PBRMaterial,
  Quaternion,
  Scene,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { collisionHeight } from '@brumbrum/world-format';
import { createRockVisual, type RockPlacement } from './RockVisual';

const random = (seed: number) => {
  const n = Math.sin(seed * 12.9898 + 31.123) * 43758.5453;
  return n - Math.floor(n);
};

/** Authored local KayKit rocks, loaded once and copied into streamed sectors. */
export class RockAssets {
  private templates: Mesh[] = [];
  private constructor(private scene: Scene) {}

  static async load(scene: Scene): Promise<RockAssets> {
    const library = new RockAssets(scene);
    // Keep the fixed variant order stable regardless of network completion order.
    const imports = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        ImportMeshAsync(`/assets/models/kaykit-rock-${i + 1}.glb`, scene),
      ),
    );
    for (let i = 0; i < imports.length; i++) {
      const result = imports[i],
        pieces = result.meshes.filter(
          (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0,
        );
      for (const piece of pieces) {
        piece.computeWorldMatrix(true);
        piece.bakeTransformIntoVertices(piece.getWorldMatrix());
        piece.parent = null;
        piece.position.setAll(0);
        piece.scaling.setAll(1);
        piece.rotation.setAll(0);
        piece.rotationQuaternion = Quaternion.Identity();
      }
      const template =
        pieces.length === 1
          ? pieces[0]
          : Mesh.MergeMeshes(pieces, true, true, undefined, false, true);
      for (const mesh of result.meshes)
        if (!pieces.includes(mesh as Mesh) && !mesh.isDisposed()) mesh.dispose();
      if (!template) continue;
      template.refreshBoundingInfo();
      const bounds = template.getBoundingInfo().boundingBox,
        centre = bounds.center.clone();
      const span = bounds.maximum.subtract(bounds.minimum),
        factor = 2 / Math.max(span.x, span.y, span.z, 0.001);
      template.bakeTransformIntoVertices(
        Matrix.Translation(-centre.x, -centre.y, -centre.z).multiply(
          Matrix.Scaling(factor, factor, factor),
        ),
      );
      if (template.material instanceof PBRMaterial) {
        template.material.roughness = 0.94;
        template.material.metallic = 0;
        template.material.albedoColor = new Color3(
          0.65 + i * 0.045,
          0.65 + i * 0.045,
          0.65 + i * 0.045,
        );
        template.material.environmentIntensity = 0.38;
      }
      template.name = `local KayKit rock variant ${i + 1}`;
      template.isVisible = false;
      template.setEnabled(false);
      library.templates.push(template);
    }
    return library;
  }

  get variantCount(): number {
    return this.templates.length;
  }

  create(
    placement: RockPlacement,
    heightAt: (x: number, z: number) => number = collisionHeight,
  ): Mesh {
    if (!this.templates.length) return createRockVisual(this.scene, placement, heightAt);
    const index = Math.floor(random(placement.seed) * this.templates.length),
      source = this.templates[index];
    const rock = source.clone(`KayKit stone ${index + 1}`, null, true)!;
    rock.makeGeometryUnique();
    rock.setEnabled(true);
    rock.isVisible = true;
    rock.receiveShadows = true;
    rock.bakeTransformIntoVertices(
      Matrix.Scaling(placement.scale.x, placement.scale.y, placement.scale.z),
    );
    const yaw = placement.yaw ?? random(placement.seed + 47) * Math.PI * 2;
    rock.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
    placeAssetRock(rock, placement, yaw, heightAt);
    return rock;
  }

  dispose(): void {
    this.templates.forEach((mesh) => mesh.dispose(false, true));
    this.templates.length = 0;
  }
}

/** Preserve the model's authored silhouette and bury its actual rotated lower vertices. */
export function placeAssetRock(
  rock: Mesh,
  placement: RockPlacement,
  yaw: number,
  heightAt: (x: number, z: number) => number,
): void {
  const positions = rock.getVerticesData(VertexBuffer.PositionKind)!;
  const bounds = rock.getBoundingInfo().boundingBox;
  const height = bounds.maximum.y - bounds.minimum.y;
  const threshold = bounds.minimum.y + height * 0.42;
  const burial = Math.max(0.12, height * 0.065),
    cos = Math.cos(yaw),
    sin = Math.sin(yaw);
  let elevation = heightAt(placement.x, placement.z) - bounds.minimum.y - height * 0.28;
  const samples: Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] > threshold) continue;
    const x = positions[i] * cos + positions[i + 2] * sin,
      z = positions[i + 2] * cos - positions[i] * sin;
    elevation = Math.min(
      elevation,
      heightAt(placement.x + x, placement.z + z) - positions[i + 1] - burial,
    );
    samples.push(new Vector3(x, positions[i + 1], z));
  }
  rock.position.set(placement.x, elevation, placement.z);
  rock.metadata = {
    source: 'KayKit Forest Nature Pack 1.0',
    seed: placement.seed,
    embeddedFootprint: samples,
    burial,
  };
}
