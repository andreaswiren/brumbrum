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
export class ForestAssets {
  private near: Mesh[] = [];
  private far: Mesh[] = [];
  static async load(scene: Scene): Promise<ForestAssets> {
    const library = new ForestAssets();
    for (const [name, target] of [
      ['pine', library.near],
      ['pine-far', library.far],
    ] as const) {
      const result = await ImportMeshAsync(`/assets/models/${name}.glb`, scene);
      // The source includes three saplings. Retain one variant's primitives per LOD;
      // spatial transforms provide scale/orientation variation without tripling draws.
      const candidates = result.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      const firstParent = candidates[0]?.parent;
      const selected = candidates.filter((m) => m.parent === firstParent);
      let min = Infinity,
        max = -Infinity;
      for (const m of selected) {
        m.computeWorldMatrix(true);
        const b = m.getBoundingInfo().boundingBox;
        min = Math.min(min, b.minimumWorld.y);
        max = Math.max(max, b.maximumWorld.y);
      }
      const scale = 10 / Math.max(0.1, max - min);
      const base = Vector3.Zero();
      let baseCount = 0;
      for (const m of selected) {
        const vertices = m.getVerticesData(VertexBuffer.PositionKind)!;
        for (let i = 0; i < vertices.length; i += 3) {
          const p = Vector3.TransformCoordinates(
            Vector3.FromArray(vertices, i),
            m.getWorldMatrix(),
          );
          if (p.y < min + (max - min) * 0.01) {
            base.addInPlace(p);
            baseCount++;
          }
        }
      }
      if (baseCount) base.scaleInPlace(1 / baseCount);
      for (const mesh of selected) {
        mesh.bakeTransformIntoVertices(
          mesh
            .computeWorldMatrix(true)
            .multiply(Matrix.Translation(-base.x, -min, -base.z))
            .multiply(Matrix.Scaling(scale, scale, scale)),
        );
        mesh.parent = null;
        mesh.position.setAll(0);
        mesh.rotation.setAll(0);
        mesh.rotationQuaternion = null;
        mesh.scaling.setAll(1);
        if (mesh.material instanceof PBRMaterial) {
          mesh.material.environmentIntensity = 0.3;
          mesh.material.backFaceCulling = false;
          mesh.material.roughness = 0.86;
        }
        mesh.setEnabled(false);
        target.push(mesh);
      }
      for (const m of result.meshes) if (!selected.includes(m as Mesh)) m.dispose(false, false);
    }
    return library;
  }
  trees(matrices: number[], near: boolean, name: string): Mesh[] {
    if (!matrices.length) return [];
    return (near ? this.near : this.far).map((source) => {
      const clone = source.clone(`pine batch ${name}`, null, true)!;
      // WebGPU vertex layouts cache instance buffers on geometry. Each spatial
      // batch owns its geometry so a neighboring sector cannot overwrite it.
      clone.makeGeometryUnique();
      clone.setEnabled(true);
      clone.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16);
      clone.receiveShadows = true;
      clone.metadata = { shadowCaster: true };
      return clone;
    });
  }
}
