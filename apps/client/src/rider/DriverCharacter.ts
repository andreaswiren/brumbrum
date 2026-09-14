import {
  ImportMeshAsync,
  Color3,
  DynamicTexture,
  Matrix,
  Mesh,
  PBRMaterial,
  Quaternion,
  Scene,
  TransformNode,
  Texture,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

interface Limb {
  mesh: Mesh;
  height: number;
}

/** A textured, skinned character whose joints follow the riding/ragdoll rig. */
export class DriverCharacter {
  readonly meshes: Mesh[];
  private nodes = new Map<string, TransformNode>();
  private bind = new Map<string, Matrix>();
  private release = () => {};
  private disposed = false;

  private constructor(
    private root: TransformNode,
    private parts: ReadonlyMap<string, Limb>,
    meshes: Mesh[],
    nodes: TransformNode[],
  ) {
    this.meshes = meshes;
    for (const node of nodes) this.nodes.set(node.name, node);
  }

  static async load(
    scene: Scene,
    root: TransformNode,
    parts: ReadonlyMap<string, Limb>,
    source: string | Uint8Array = '/assets/models/human-rider.glb',
    skipMaterials = false,
  ): Promise<DriverCharacter> {
    const imported = await ImportMeshAsync(source, scene, {
      pluginExtension: '.glb',
      pluginOptions: { gltf: { skipMaterials } },
    });
    const importRoot = imported.meshes[0];
    const meshes = imported.meshes.filter(
      (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0,
    );
    const character = new DriverCharacter(root, parts, meshes, imported.transformNodes);
    character.release = () => {
      imported.animationGroups.forEach((group) => group.dispose());
      imported.skeletons.forEach((skeleton) => skeleton.dispose());
      importRoot.dispose(false, true);
    };
    if (root.isDisposed() || scene.isDisposed) {
      character.dispose();
      return character;
    }
    importRoot.parent = root;
    // This rig uses the authored +Z forward convention throughout, matching our bike.
    importRoot.rotationQuaternion = Quaternion.Identity();
    importRoot.scaling.setAll(1);
    const inverseRoot = Matrix.Invert(root.computeWorldMatrix(true));
    for (const [name, node] of character.nodes)
      character.bind.set(name, node.computeWorldMatrix(true).multiply(inverseRoot));
    for (const mesh of meshes) {
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.receiveShadows = true;
      mesh.metadata = { ...mesh.metadata, shadowCaster: true };
      character.ridingClothes(mesh, scene);
      if (mesh.material instanceof PBRMaterial) {
        mesh.material.roughness = 0.82;
        mesh.material.environmentIntensity = 0.45;
      }
    }
    imported.animationGroups.forEach((group) => group.stop());
    character.curlFingers();
    character.update();
    const observer = scene.onBeforeRenderObservable.add(() => character.update());
    const releaseAssets = character.release;
    character.release = () => {
      observer.remove();
      releaseAssets();
    };
    return character;
  }

  private point(part: string, along = 0): Vector3 {
    const limb = this.parts.get(part)!;
    return Vector3.TransformCoordinates(
      new Vector3(0, along, 0),
      limb.mesh.computeWorldMatrix(true),
    );
  }

  /** Color the authored surface as riding equipment without inflating its shape. */
  private ridingClothes(mesh: Mesh, scene: Scene): void {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) return;
    const colors = new Float32Array((positions.length / 3) * 4);
    const uvs = new Float32Array((positions.length / 3) * 2);
    const trousers = Color3.FromHexString('#263b4f');
    const jersey = Color3.FromHexString('#b52c20');
    const dark = Color3.FromHexString('#1c252d');
    const trim = Color3.FromHexString('#c2c8bd');
    const skin = Color3.FromHexString('#ba8668');
    for (let index = 0; index < positions.length / 3; index++) {
      const x = positions[index * 3],
        y = positions[index * 3 + 1],
        z = positions[index * 3 + 2];
      let color = y < 1.09 ? trousers : jersey;
      if (y < 0.34 || (Math.abs(x) > 0.71 && y > 1.3)) color = dark;
      // Reinforced side panels, knee fabric and cuffs are painted onto the mesh.
      if (y > 0.45 && y < 0.62 && z > 0.025) color = dark;
      if (y > 1.02 && y < 1.35 && Math.abs(x) > 0.14 && Math.abs(x) < 0.24) color = dark;
      if (y > 1.32 && y < 1.4 && Math.abs(x) < 0.2) color = trim;
      if (y > 1.49 && Math.abs(x) < 0.18) color = skin;
      colors.set([color.r, color.g, color.b, 1], index * 4);
      // Rest-space UVs stay attached as the skeleton moves and expose a subtle
      // woven surface rather than the source mannequin's flat palette swatches.
      uvs.set([x * 10 + z * 7, y * 10], index * 2);
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    mesh.setVerticesData(VertexBuffer.UVKind, uvs);
    mesh.useVertexColors = true;
    mesh.hasVertexAlpha = false;
    if (!(mesh.material instanceof PBRMaterial)) return;
    const fabric = new DynamicTexture(
      'fine woven riding fabric',
      { width: 64, height: 64 },
      scene,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    const context = fabric.getContext();
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const shade = 235 + ((x + y) % 4 === 0 ? 16 : 0) + ((x * 13 + y * 7) % 5);
        context.fillStyle = `rgb(${shade},${shade},${shade})`;
        context.fillRect(x, y, 1, 1);
      }
    fabric.wrapU = Texture.WRAP_ADDRESSMODE;
    fabric.wrapV = Texture.WRAP_ADDRESSMODE;
    fabric.update(false);
    mesh.material.albedoTexture?.dispose();
    mesh.material.albedoTexture = fabric;
    mesh.material.albedoColor = Color3.White();
    mesh.material.roughness = 0.9;
  }

  private orient(part: string): Quaternion {
    const rotation = Quaternion.Identity();
    this.parts.get(part)!.mesh.computeWorldMatrix(true).decompose(undefined, rotation);
    return rotation;
  }

  private place(name: string, position: Vector3, rotation: Quaternion): void {
    const node = this.nodes.get(name);
    if (!node) return;
    const world = Matrix.Compose(Vector3.One(), rotation, position);
    const parent = node.parent as TransformNode | null;
    const local = parent ? world.multiply(Matrix.Invert(parent.computeWorldMatrix(true))) : world;
    node.rotationQuaternion ??= Quaternion.Identity();
    // Every retargeted joint has unit world scale. Local TRS is therefore rigid
    // and safe to decompose, and Babylon's linked bones consume these TRS fields.
    local.decompose(node.scaling, node.rotationQuaternion, node.position);
    node.computeWorldMatrix(true);
  }

  update(): void {
    if (this.disposed) return;
    const hip = this.point('pelvis'),
      head = this.parts.get('head')!;
    const pelvisDelta = this.orient('pelvis'),
      torsoDelta = this.orient('torso');
    this.retarget('pelvis', hip, pelvisDelta);
    for (const name of ['spine_01', 'spine_02', 'spine_03', 'neck_01']) {
      const offset = this.restPoint(name).subtract(this.restPoint('pelvis'));
      this.retarget(name, hip.add(this.rotate(offset, torsoDelta)), torsoDelta);
    }
    this.retarget('head', this.point('head', -head.height / 2), this.orient('head'));
    for (const [suffix, side] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const upperArm = `upperArm${side}`,
        forearm = `forearm${side}`,
        thigh = `thigh${side}`,
        shin = `shin${side}`;
      const arm = this.parts.get(upperArm)!,
        fore = this.parts.get(forearm)!,
        upperLeg = this.parts.get(thigh)!,
        lowerLeg = this.parts.get(shin)!;
      const hand = this.point(forearm, -fore.height / 2),
        foot = this.point(shin, -lowerLeg.height / 2);
      const shoulder = this.point(upperArm, arm.height / 2);
      this.retarget(
        `clavicle_${suffix}`,
        shoulder.add(
          this.rotate(
            this.restPoint(`clavicle_${suffix}`).subtract(this.restPoint(`upperarm_${suffix}`)),
            torsoDelta,
          ),
        ),
        torsoDelta,
      );
      this.segment(`upperarm_${suffix}`, `lowerarm_${suffix}`, upperArm);
      this.segment(`lowerarm_${suffix}`, `hand_${suffix}`, forearm);
      const rootRotation = Quaternion.Identity();
      this.root.computeWorldMatrix(true).decompose(undefined, rootRotation);
      const riding =
        this.parts.get(forearm)!.mesh.parent === this.root && !this.root.metadata?.recoveryMotion;
      const handDirection = riding
        ? this.rotate(Vector3.Forward(), rootRotation)
        : hand.subtract(this.point(forearm, fore.height / 2)).normalize();
      const palmNormal = riding
        ? this.rotate(Vector3.Down(), rootRotation)
        : this.parts.get(forearm)!.mesh.getDirection(Vector3.Forward()).negate();
      const handDelta = this.frame(handDirection, palmNormal).multiply(
        this.frame(
          this.restPoint(`middle_01_${suffix}`)
            .subtract(this.restPoint(`hand_${suffix}`))
            .normalize(),
          Vector3.Down(),
        ).conjugate(),
      );
      this.retarget(`hand_${suffix}`, hand, handDelta);
      this.segment(`thigh_${suffix}`, `calf_${suffix}`, thigh);
      const shinDelta = this.segment(`calf_${suffix}`, `foot_${suffix}`, shin);
      const metadata = this.parts.get(shin)!.mesh.metadata;
      const plant = metadata?.footPlantBlend ?? 0;
      const forward = this.root.getDirection(Vector3.Forward());
      const groundFoot = Quaternion.RotationYawPitchRoll(
        Math.atan2(forward.x, forward.z),
        metadata?.footPlantPitch ?? 0,
        0,
      );
      this.retarget(
        `foot_${suffix}`,
        foot,
        this.parts.get(shin)!.mesh.parent === this.root
          ? Quaternion.Slerp(rootRotation, groundFoot, plant)
          : shinDelta,
      );
    }
  }

  private restPoint(name: string): Vector3 {
    return this.bind.get(name)!.getTranslation();
  }

  private rotate(vector: Vector3, rotation: Quaternion): Vector3 {
    return Vector3.TransformNormal(vector, Matrix.Compose(Vector3.One(), rotation, Vector3.Zero()));
  }

  private frame(axis: Vector3, forward: Vector3): Quaternion {
    const y = axis.normalizeToNew();
    const z = forward.subtract(y.scale(Vector3.Dot(y, forward))).normalize();
    const x = Vector3.Cross(y, z).normalize();
    return Quaternion.FromRotationMatrix(Matrix.FromXYZAxesToRef(x, y, z, Matrix.Identity()));
  }

  private retarget(name: string, position: Vector3, delta: Quaternion): void {
    const bindRotation = Quaternion.Identity();
    this.bind.get(name)!.decompose(undefined, bindRotation);
    this.place(name, position, delta.multiply(bindRotation));
  }

  private segment(name: string, child: string, part: string): Quaternion {
    const limb = this.parts.get(part)!,
      start = this.point(part, limb.height / 2),
      end = this.point(part, -limb.height / 2);
    const restAxis = this.restPoint(child).subtract(this.restPoint(name));
    const delta = this.frame(
      end.subtract(start),
      limb.mesh.getDirection(Vector3.Forward()),
    ).multiply(this.frame(restAxis, Vector3.Forward()).conjugate());
    this.retarget(name, start, delta);
    return delta;
  }

  private curlFingers(): void {
    for (const [name, node] of this.nodes) {
      const match = /^(index|middle|ring|pinky|thumb)_0([123])_[lr]$/.exec(name);
      if (!match || !node.rotationQuaternion) continue;
      const rest = this.bind.get(name)!;
      const worldAxis = new Vector3(0, 0, name.endsWith('_l') ? -1 : 1);
      const localAxis = Vector3.TransformNormal(worldAxis, Matrix.Invert(rest)).normalize();
      const curl = match[1] === 'thumb' ? 0.35 : match[2] === '1' ? 0.4 : 0.85;
      node.rotationQuaternion.multiplyInPlace(Quaternion.RotationAxis(localAxis, curl));
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
    this.nodes.clear();
  }
}
