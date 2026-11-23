import RAPIER from '@dimforge/rapier3d-compat';
import { SIMULATION } from '../config/simulation';
import { identity, vec } from '../core/math';
import type { BoxSpec } from '../world/map';
import type { Pose } from '../vehicles/types';

let initialization: Promise<void> | undefined;
export function initializePhysics() { return initialization ??= RAPIER.init(); }
export const GROUP = { environment: 1, vehicle: 2, prop: 4 } as const;
export const groups = (membership: number, filter = 0xffff) => ((membership << 16) | filter) >>> 0;
export interface PhysicalObject {
  spec: BoxSpec; body: RAPIER.RigidBody | null;
  previous: Pose; current: Pose;
}
const pose = (): Pose => ({ position: vec(), rotation: identity() });
export function readPose(body: RAPIER.RigidBody, target: Pose) {
  body.translation(target.position);
  body.rotation(target.rotation);
}
export function copyPose(source: Pose, target: Pose) {
  Object.assign(target.position, source.position);
  Object.assign(target.rotation, source.rotation);
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly objects: PhysicalObject[] = [];
  readonly dynamics: PhysicalObject[] = [];
  constructor(readonly dt: number) {
    this.world = new RAPIER.World(vec(0, -SIMULATION.gravity, 0));
    this.world.timestep = dt;
    this.world.numSolverIterations = SIMULATION.solverIterations;
    this.world.maxCcdSubsteps = 4;
  }
  addBox(spec: BoxSpec): PhysicalObject {
    const obj: PhysicalObject = { spec, body: null, previous: pose(), current: pose() };
    Object.assign(obj.current.position, spec.position);
    Object.assign(obj.current.rotation, spec.rotation ?? identity());
    if (spec.collider) {
      const desc = RAPIER.ColliderDesc.cuboid(spec.size.x / 2, spec.size.y / 2, spec.size.z / 2)
        .setFriction(spec.friction ?? 0.8).setRestitution(0.05)
        .setCollisionGroups(groups(spec.mass ? GROUP.prop : GROUP.environment));
      if (spec.mass) {
        obj.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(spec.position.x, spec.position.y, spec.position.z)
          .setRotation(spec.rotation ?? identity()).setCcdEnabled(true));
        this.world.createCollider(desc.setMass(spec.mass), obj.body);
        this.dynamics.push(obj);
      } else {
        this.world.createCollider(desc.setTranslation(spec.position.x, spec.position.y, spec.position.z)
          .setRotation(spec.rotation ?? identity()));
      }
    }
    copyPose(obj.current, obj.previous);
    this.objects.push(obj);
    return obj;
  }
  beforeStep() { for (const obj of this.dynamics) copyPose(obj.current, obj.previous); }
  afterStep() { for (const obj of this.dynamics) readPose(obj.body!, obj.current); }
  syncHistory() { this.afterStep(); for (const obj of this.dynamics) copyPose(obj.current, obj.previous); }
  dispose() { this.world.free(); }
}
