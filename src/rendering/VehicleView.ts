import * as THREE from 'three';
import type { VehicleConfig } from '../config/vehicle';
import type { Pose, VehicleVisualState } from '../vehicles/types';

const previousQ = new THREE.Quaternion(), currentQ = new THREE.Quaternion();
export function interpolatePose(object: THREE.Object3D, previous: Pose, current: Pose, alpha: number) {
  object.position.set(
    THREE.MathUtils.lerp(previous.position.x, current.position.x, alpha),
    THREE.MathUtils.lerp(previous.position.y, current.position.y, alpha),
    THREE.MathUtils.lerp(previous.position.z, current.position.z, alpha));
  previousQ.set(previous.rotation.x, previous.rotation.y, previous.rotation.z, previous.rotation.w);
  currentQ.set(current.rotation.x, current.rotation.y, current.rotation.z, current.rotation.w);
  object.quaternion.slerpQuaternions(previousQ, currentQ, alpha);
}
/** Replace this primitive view with a GLB adapter; physics and wheel pivots stay unchanged. */
export class VehicleView {
  readonly root = new THREE.Group();
  private readonly steeringPivots: THREE.Group[] = [];
  private readonly wheels: THREE.Group[] = [];
  constructor(config: VehicleConfig) {
    const paint = new THREE.MeshStandardMaterial({ color: 0xd9a54a, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x293d49, roughness: 0.3 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x171c20, roughness: 1 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xa0acb1, roughness: 0.55 });
    const part = (size: number[], at: number[], material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number, number, number]), material);
      mesh.position.set(...at as [number, number, number]); mesh.castShadow = true; mesh.receiveShadow = true;
      this.root.add(mesh); return mesh;
    };
    const b = config.body, c = config.cabin;
    // Simple wheel openings: the collider remains the conservative body envelope.
    part([1.3, b.height, b.length], [0, b.centerY, 0], paint);
    part([b.width, 0.16, b.length], [0, b.centerY + b.height / 2 - 0.08, 0], paint);
    const openingHalfLength = config.wheel.radius + 0.07;
    const centerLength = config.wheel.wheelbase - 2 * openingHalfLength;
    const endLength = (b.length - config.wheel.wheelbase) / 2 - openingHalfLength;
    part([b.width, b.height, centerLength], [0, b.centerY, 0], paint);
    for (const side of [-1, 1]) part([b.width, b.height, endLength], [0, b.centerY, side * (b.length - endLength) / 2], paint);
    part([c.width, c.height, c.length], [0, c.centerY, c.centerZ], glass);
    part([c.width + 0.04, 0.05, c.length], [0, c.centerY + c.height / 2, c.centerZ], paint);
    const front = new THREE.MeshBasicMaterial({ color: 0xf1f3dc });
    const rear = new THREE.MeshBasicMaterial({ color: 0xa83128 });
    for (const side of [-1, 1]) {
      part([0.43, 0.14, 0.025], [side * 0.56, 0.10, b.length / 2 + 0.012], front);
      part([0.4, 0.14, 0.025], [side * 0.56, 0.10, -b.length / 2 - 0.012], rear);
    }
    const tireGeometry = new THREE.CylinderGeometry(config.wheel.radius, config.wheel.radius, config.wheel.width, 16);
    tireGeometry.rotateZ(Math.PI / 2);
    const hubGeometry = new THREE.CylinderGeometry(config.wheel.radius * 0.55, config.wheel.radius * 0.55, config.wheel.width + 0.015, 10);
    hubGeometry.rotateZ(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group(), spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeometry, rubber); tire.castShadow = true;
      spin.add(tire, new THREE.Mesh(hubGeometry, rim));
      // A visible spoke makes the controller-driven wheel rotation readable.
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(config.wheel.width + 0.025, 0.045, config.wheel.radius * 0.95), rubber);
      spin.add(spoke); pivot.add(spin); this.root.add(pivot);
      this.steeringPivots.push(pivot); this.wheels.push(spin);
    }
  }
  update(car: VehicleVisualState, alpha: number) {
    interpolatePose(this.root, car.previous, car.current, alpha);
    for (let i = 0; i < 4; i++) {
      const prev = car.previous.wheels[i], curr = car.current.wheels[i], mount = car.mounts[i];
      this.steeringPivots[i].position.set(mount.x, mount.y - THREE.MathUtils.lerp(prev.length, curr.length, alpha), mount.z);
      this.steeringPivots[i].rotation.y = THREE.MathUtils.lerp(prev.steering, curr.steering, alpha);
      this.wheels[i].rotation.x = THREE.MathUtils.lerp(prev.rotation, curr.rotation, alpha);
    }
  }
}
