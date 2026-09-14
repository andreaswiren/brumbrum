import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import type { RealtimePlayer, RealtimePose } from '../../../../packages/protocol/src/realtime';
import { collisionHeight, waterAt } from '@brumbrum/world-format';
import {
  timberStructures,
  timberSurfaceHeight,
  timberSurfaceRange,
} from '../../../../packages/world-format/src/timber';
import { vehicleSetup } from '../vehicles/VehicleSetup';
import { WheelAnimation } from '../vehicles/WheelAnimation';
import { animateSnowmobile } from '../vehicles/SnowmobileVisual';
import type { RiderRig } from '../rider/RiderRig';
import { SnapshotInterpolation } from './SnapshotInterpolation';

interface Remote {
  id: string;
  name: string;
  frames: SnapshotInterpolation;
  setup: ReturnType<typeof vehicleSetup>;
  wheels: WheelAnimation;
  label?: Mesh;
  crashVelocity?: Vector3;
  crashAge: number;
  crashYaw: number;
}

/** Remote vehicles are rendering-only: no Havok bodies and no local input. */
export class RemotePlayers {
  private players = new Map<string, Remote>();
  private lastUpdate?: number;
  private lastSnapshotTime = -Infinity;
  constructor(
    private scene: Scene,
    private addCaster: (mesh: Mesh) => void = () => {},
    private loadRider: (rider: RiderRig) => Promise<void> = (rider) => rider.loadCharacter(),
  ) {}
  get count(): number {
    return this.players.size;
  }

  receive(players: RealtimePlayer[], localId: string, serverTime: number): void {
    if (
      !Array.isArray(players) ||
      !Number.isFinite(serverTime) ||
      serverTime <= this.lastSnapshotTime
    )
      return;
    this.lastSnapshotTime = serverTime;
    const arrival = performance.now(),
      present = new Set<string>();
    for (const player of players) {
      if (!player || player.id === localId || typeof player.id !== 'string' || !player.pose)
        continue;
      if (!['bike', 'atv', 'monster', 'snowmobile'].includes(player.pose.kind)) continue;
      present.add(player.id);
      let remote = this.players.get(player.id);
      if (remote && remote.frames.latest?.kind !== player.pose.kind) {
        this.remove(remote);
        remote = undefined;
      }
      if (!remote) {
        const frames = new SnapshotInterpolation();
        if (!frames.push(player.pose, arrival, serverTime)) continue;
        const setup = vehicleSetup(this.scene, player.pose.kind);
        setup.visual.riderRig.setVehicle(player.pose.kind);
        remote = {
          id: player.id,
          name: String(player.name).slice(0, 24),
          frames,
          setup,
          wheels: new WheelAnimation(setup.visual, player.pose.kind, setup.tuning.wheelbase),
          crashAge: 0,
          crashYaw: 0,
        };
        this.players.set(player.id, remote);
        for (const mesh of setup.visual.meshes) if (!mesh.isDisposed()) this.addCaster(mesh);
        if (typeof document !== 'undefined') remote.label = this.nameLabel(remote);
        const current = remote;
        void this.loadRider(setup.visual.riderRig)
          .then(() => {
            if (this.players.get(current.id) !== current) return;
            for (const mesh of current.setup.visual.riderRig.meshes)
              if (!mesh.isDisposed()) this.addCaster(mesh);
          })
          .catch((error) => {
            if (this.players.get(current.id) === current)
              console.warn('Remote rider mesh could not load', error);
          });
      } else remote.frames.push(player.pose, arrival, serverTime);
    }
    for (const remote of this.players.values()) if (!present.has(remote.id)) this.remove(remote);
  }

  update(now = performance.now()): void {
    const dt = Math.min(0.1, Math.max(0, (now - (this.lastUpdate ?? now)) / 1000));
    this.lastUpdate = now;
    for (const remote of this.players.values()) {
      const pose = remote.frames.sample(now);
      if (!pose) continue;
      const { visual, tuning } = remote.setup;
      visual.chassis.position.copyFromFloats(...pose.position);
      visual.chassis.rotationQuaternion!.copyFromFloats(...pose.rotation);
      visual.chassis.computeWorldMatrix(true);
      const up = visual.chassis.getDirection(Vector3.Up());
      for (const wheel of visual.wheels) {
        const mount = Vector3.TransformCoordinates(
          new Vector3(wheel.position.x, 0, wheel.position.z),
          visual.chassis.getWorldMatrix(),
        );
        const floor = this.supportHeight(mount.x, mount.z, mount.y, pose);
        wheel.position.y =
          up.y > 0.3
            ? Math.max(
                -tuning.suspensionLength,
                Math.min(-0.025, (floor + tuning.wheelRadius - mount.y) / up.y),
              )
            : -tuning.suspensionLength * 0.85;
      }
      remote.wheels.update(dt, pose.steer, pose.speed, tuning.wheelRadius);
      if (pose.kind === 'snowmobile') animateSnowmobile(visual, dt, pose.speed, pose.steer);
      if (pose.crashed) this.crash(remote, pose, dt);
      else {
        if (remote.crashVelocity) {
          visual.riderRig.reset();
          remote.crashVelocity = undefined;
        }
        visual.riderRig.pose(
          pose.steer,
          pose.speed,
          pose.speed > 1 ? 0.45 : 0,
          0,
          0.04,
          dt,
          0,
          0,
          true,
        );
      }
    }
  }

  private supportHeight(x: number, z: number, y: number, pose: RealtimePose): number {
    let height = collisionHeight(x, z);
    const water = waterAt(x, z);
    if (water !== undefined && pose.speed > 14 && y > water) height = Math.max(height, water);
    for (const structure of timberStructures) {
      const [start, end] = timberSurfaceRange(structure),
        along = z - structure.z;
      if (Math.abs(x - structure.x) <= structure.width / 2 && along >= start && along <= end) {
        const deck = timberSurfaceHeight(structure, along);
        if (y > deck) height = Math.max(height, deck);
      }
    }
    return height;
  }

  private crash(remote: Remote, pose: RealtimePose, dt: number): void {
    const root = remote.setup.visual.riderRig.root;
    if (!remote.crashVelocity) {
      root.setParent(null);
      remote.crashVelocity = Vector3.FromArray(pose.velocity).add(new Vector3(0, 2.5, 0));
      const forward = remote.setup.visual.chassis.getDirection(Vector3.Forward());
      remote.crashYaw = Math.atan2(forward.x, forward.z);
      remote.crashAge = 0;
    }
    remote.crashAge += dt;
    remote.crashVelocity.y -= 9.81 * dt;
    root.position.addInPlace(remote.crashVelocity.scale(dt));
    const floor = collisionHeight(root.position.x, root.position.z) + 0.35;
    if (root.position.y < floor) {
      root.position.y = floor;
      remote.crashVelocity.setAll(0);
    }
    root.rotationQuaternion = Quaternion.RotationYawPitchRoll(
      remote.crashYaw,
      0,
      Math.min(1.45, remote.crashAge * 2),
    );
  }

  private nameLabel(remote: Remote): Mesh {
    const texture = new DynamicTexture(
      'remote rider name',
      { width: 512, height: 96 },
      this.scene,
      false,
    );
    texture.hasAlpha = true;
    texture.drawText(remote.name, null, 66, 'bold 42px Arial', '#ffffff', 'transparent', true);
    const material = new StandardMaterial('remote name lettering', this.scene);
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.emissiveColor = Color3.White();
    material.disableLighting = true;
    material.backFaceCulling = false;
    const label = MeshBuilder.CreatePlane(
      'remote rider name',
      { width: 2.8, height: 0.53 },
      this.scene,
    );
    label.material = material;
    label.parent = remote.setup.visual.chassis;
    label.position.y = remote.frames.latest!.kind === 'monster' ? 3.1 : 2.25;
    label.billboardMode = Mesh.BILLBOARDMODE_ALL;
    label.isPickable = false;
    return label;
  }

  private remove(remote: Remote): void {
    this.players.delete(remote.id);
    remote.label?.dispose(false, true);
    remote.setup.visual.riderRig.dispose();
    remote.setup.visual.chassis.dispose(false, true);
  }
  clear(): void {
    for (const remote of this.players.values()) this.remove(remote);
    this.lastUpdate = undefined;
    this.lastSnapshotTime = -Infinity;
  }
  dispose(): void {
    this.clear();
  }
}
