import {
  ImportMeshAsync,
  Matrix,
  Mesh,
  PBRMaterial,
  Scene,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export type ForestVariant = 'pine-full' | 'pine-young' | 'forest-snag';
export const forestVariants: readonly ForestVariant[] = ['pine-full', 'pine-young', 'forest-snag'];

/** Ground-anchored tree variations. All templates are ten metres tall so existing
 * sector matrices can use the same scale convention as the original pine. */
export class ForestExtraAssets {
  private templates = new Map<string, Mesh[]>();

  static async load(
    scene: Scene,
    assetSource: (filename: string) => Promise<string | Uint8Array> = async (filename) =>
      `/assets/models/${filename}`,
    skipMaterials = false,
  ): Promise<ForestExtraAssets> {
    const library = new ForestExtraAssets();
    for (const variant of forestVariants) {
      for (const far of variant === 'forest-snag' ? [false] : [false, true]) {
        const name = variant + (far ? '-far' : '');
        const imported = await ImportMeshAsync(await assetSource(`${name}.glb`), scene, {
          pluginExtension: '.glb',
          pluginOptions: { gltf: { skipMaterials } },
        });
        const meshes = imported.meshes.filter(
          (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0,
        );
        let minY = Infinity,
          maxY = -Infinity;
        for (const mesh of meshes) {
          mesh.computeWorldMatrix(true);
          const bounds = mesh.getBoundingInfo().boundingBox;
          minY = Math.min(minY, bounds.minimumWorld.y);
          maxY = Math.max(maxY, bounds.maximumWorld.y);
        }
        const base = Vector3.Zero();
        let baseCount = 0;
        for (const mesh of meshes) {
          const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
          for (let index = 0; index < positions.length; index += 3) {
            const vertex = Vector3.TransformCoordinates(
              Vector3.FromArray(positions, index),
              mesh.getWorldMatrix(),
            );
            if (vertex.y < minY + (maxY - minY) * 0.008) {
              base.addInPlace(vertex);
              baseCount++;
            }
          }
        }
        if (baseCount) base.scaleInPlace(1 / baseCount);
        const scale = 10 / Math.max(0.01, maxY - minY);
        for (const mesh of meshes) {
          const baked = mesh
            .getWorldMatrix()
            .multiply(Matrix.Translation(-base.x, -minY, -base.z))
            .multiply(Matrix.Scaling(scale, scale, scale));
          mesh.bakeTransformIntoVertices(baked);
          mesh.parent = null;
          mesh.position.setAll(0);
          mesh.rotation.setAll(0);
          mesh.rotationQuaternion = null;
          mesh.scaling.setAll(1);
          mesh.isPickable = false;
          if (mesh.material instanceof PBRMaterial) {
            mesh.material.roughness = 0.9;
            mesh.material.environmentIntensity = 0.32;
            mesh.material.backFaceCulling = false;
          }
          mesh.setEnabled(false);
        }
        for (const mesh of imported.meshes)
          if (!meshes.includes(mesh as Mesh)) mesh.dispose(false, false);
        library.templates.set(name, meshes);
      }
    }
    return library;
  }

  trees(variant: ForestVariant, matrices: number[], near: boolean, name: string): Mesh[] {
    if (!matrices.length) return [];
    const key = variant + (!near && variant !== 'forest-snag' ? '-far' : '');
    return this.templates.get(key)!.map((source) => {
      const mesh = source.clone(`${variant} batch ${name}`, null, true)!;
      mesh.makeGeometryUnique();
      mesh.setEnabled(true);
      mesh.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16);
      mesh.receiveShadows = true;
      mesh.metadata = { shadowCaster: near, vegetation: variant };
      return mesh;
    });
  }

  dispose(): void {
    const materials = new Set([...this.templates.values()].flat().map((mesh) => mesh.material));
    for (const meshes of this.templates.values()) for (const mesh of meshes) mesh.dispose();
    for (const material of materials) material?.dispose(false, true);
    this.templates.clear();
  }
}
