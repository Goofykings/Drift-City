import * as THREE from 'three';
import type { VehicleConfig } from '../config/vehicle';
import type { VehicleVisualState } from '../vehicles/types';

const maxMarks = 1800;
const maxDust = 80;
interface DustParticle { position: THREE.Vector3; velocity: THREE.Vector3; age: number; life: number }

/** Tire contact traces and light dust. All positions come from read-only physics snapshots. */
export class DriftEffects {
  readonly root = new THREE.Group();
  private readonly positions = new Float32Array(maxMarks * 18);
  private readonly marks: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly dust: THREE.InstancedMesh;
  private readonly previous: (THREE.Vector3 | undefined)[] = [undefined, undefined, undefined, undefined];
  private readonly particles: (DustParticle | undefined)[] = Array(maxDust).fill(undefined);
  private readonly dummy = new THREE.Object3D();
  private markIndex = 0;
  private dustIndex = 0;
  private sampleCount = 0;
  markCount = 0;
  dustEmitted = 0;
  get dustCount() { return this.dust.count; }

  constructor(private readonly config: VehicleConfig) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.marks = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0x20252a, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1,
    }));
    this.marks.frustumCulled = false;
    this.root.add(this.marks);
    this.dust = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0xc9b79b, transparent: true, opacity: 0.23, depthWrite: false }), maxDust);
    this.dust.frustumCulled = false;
    this.dust.count = 0;
    this.root.add(this.dust);
  }

  clearTrail() { this.previous.fill(undefined); }

  sample(car: VehicleVisualState, speed: number) {
    this.sampleCount++;
    const wheels = car.current.wheels;
    for (let i = 0; i < 4; i++) {
      const wheel = wheels[i];
      if (!wheel.contact || wheel.contactNormal.y < 0.65 || Math.abs(speed) < 3
        || Math.abs(wheel.lateralSlip) < this.config.tire.driftSlipSpeed) {
        this.previous[i] = undefined;
        continue;
      }
      const point = new THREE.Vector3(wheel.contactPoint.x, wheel.contactPoint.y, wheel.contactPoint.z);
      const prior = this.previous[i];
      if (prior) {
        const length = point.distanceTo(prior);
        if (length > 0.025 && length < 1.5) this.addMark(prior, point, wheel.contactNormal);
      }
      this.previous[i] = point;
      if (this.sampleCount % 10 === i * 2) this.spawnDust(point, car, wheel.lateralSlip);
    }
  }

  private addMark(a: THREE.Vector3, b: THREE.Vector3, normal: { x: number; y: number; z: number }) {
    const forward = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(normal.x, normal.y, normal.z).cross(forward).normalize()
      .multiplyScalar(this.config.wheel.width * 0.46);
    const lift = new THREE.Vector3(normal.x, normal.y, normal.z).multiplyScalar(0.027);
    const aLeft = a.clone().add(lift).sub(side), aRight = a.clone().add(lift).add(side);
    const bLeft = b.clone().add(lift).sub(side), bRight = b.clone().add(lift).add(side);
    const offset = this.markIndex * 18;
    this.positions.set([...aLeft.toArray(), ...aRight.toArray(), ...bLeft.toArray(),
      ...bLeft.toArray(), ...aRight.toArray(), ...bRight.toArray()], offset);
    this.markIndex = (this.markIndex + 1) % maxMarks;
    this.markCount = Math.min(this.markCount + 1, maxMarks);
    this.marks.geometry.setDrawRange(0, this.markCount * 6);
    (this.marks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawnDust(point: THREE.Vector3, car: VehicleVisualState, slip: number) {
    const q = car.current.rotation;
    const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    const side = new THREE.Vector3(behind.z, 0, -behind.x);
    const particle: DustParticle = {
      position: point.clone().add(new THREE.Vector3(0, 0.16, 0)),
      velocity: behind.multiplyScalar(1.1).addScaledVector(side, Math.sign(slip) * 0.65)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5)),
      age: 0, life: 0.55 + Math.random() * 0.25,
    };
    this.particles[this.dustIndex] = particle;
    this.dustEmitted++;
    this.dustIndex = (this.dustIndex + 1) % maxDust;
  }

  update(dt: number) {
    let visible = 0;
    for (const particle of this.particles) {
      if (!particle) continue;
      particle.age += dt;
      if (particle.age >= particle.life) continue;
      particle.position.addScaledVector(particle.velocity, dt);
      const fraction = particle.age / particle.life;
      this.dummy.position.copy(particle.position);
      this.dummy.scale.setScalar((0.55 + fraction * 2.2) * Math.min(1, (1 - fraction) * 3));
      this.dummy.updateMatrix();
      this.dust.setMatrixAt(visible++, this.dummy.matrix);
    }
    this.dust.count = visible;
    if (visible) this.dust.instanceMatrix.needsUpdate = true;
  }
}
