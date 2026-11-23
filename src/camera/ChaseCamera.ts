import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { identity } from '../core/math';

export class ChaseCamera {
  mode = 0;
  private yaw = 0;
  private initialized = false;
  private distance = 8;
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly heading = new THREE.Vector3();
  private readonly smoothPosition = new THREE.Vector3();
  private readonly sphere = new RAPIER.Ball(0.24);
  private readonly rotation = identity();
  constructor(readonly camera: THREE.PerspectiveCamera, readonly world: RAPIER.World, readonly chassis: RAPIER.RigidBody) {}
  reset() { this.initialized = false; }
  toggle() { this.mode = 1 - this.mode; }
  update(root: THREE.Object3D, speed: number, dt: number) {
    this.heading.set(0, 0, 1).applyQuaternion(root.quaternion);
    if (this.heading.x ** 2 + this.heading.z ** 2 > 0.02) {
      const wantedYaw = Math.atan2(this.heading.x, this.heading.z);
      const error = Math.atan2(Math.sin(wantedYaw - this.yaw), Math.cos(wantedYaw - this.yaw));
      this.yaw = this.initialized ? this.yaw + error * (1 - Math.exp(-4 * dt)) : wantedYaw;
    }
    this.target.copy(root.position).addScaledVector(this.heading.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 0.6);
    this.target.y += 0.55;
    const back = (this.mode ? 11 : 7.5) + Math.min(Math.abs(speed) * 0.06, 2.5);
    this.desired.copy(root.position).addScaledVector(this.heading, -back);
    this.desired.y += this.mode ? 6.5 : 3.4;
    if (!this.initialized) this.smoothPosition.copy(this.desired);
    else this.smoothPosition.lerp(this.desired, 1 - Math.exp(-7 * dt));
    // Cast to the SMOOTHED position, otherwise smoothing can still carry the camera through a wall.
    this.direction.copy(this.smoothPosition).sub(this.target);
    const desiredDistance = this.direction.length();
    this.direction.normalize();
    const hit = this.world.castShape(this.target, this.rotation, this.direction, this.sphere, 0,
      desiredDistance, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, this.chassis);
    const allowed = hit ? Math.max(0, hit.time_of_impact - 0.06) : desiredDistance;
    // Retract immediately to guarantee clearance; extend smoothly when the obstruction disappears.
    this.distance = !this.initialized ? allowed : Math.min(allowed,
      THREE.MathUtils.lerp(this.distance, allowed, 1 - Math.exp(-5 * dt)));
    this.camera.position.copy(this.target).addScaledVector(this.direction, this.distance);
    this.camera.lookAt(this.target);
    this.initialized = true;
  }
}
