import * as THREE from 'three';
import type { PhysicsWorld, PhysicalObject } from '../physics/PhysicsWorld';
import { interpolatePose } from './VehicleView';

export class WorldView {
  readonly root = new THREE.Group();
  private readonly moving: { object: PhysicalObject; mesh: THREE.Mesh }[] = [];
  constructor(physics: PhysicsWorld) {
    const geometry = new THREE.BoxGeometry(1, 1, 1), transform = new THREE.Object3D();
    const batches = new Map<number, PhysicalObject[]>();
    for (const object of physics.objects) {
      const list = batches.get(object.spec.color) ?? [];
      list.push(object); batches.set(object.spec.color, list);
    }
    for (const [color, objects] of batches) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.94 });
      const fixed = objects.filter(o => !o.body);
      if (fixed.length) {
        const batch = new THREE.InstancedMesh(geometry, material, fixed.length);
        fixed.forEach((object, i) => {
          const s = object.spec;
          transform.position.copy(s.position);
          transform.quaternion.copy(s.rotation ?? new THREE.Quaternion());
          transform.scale.set(s.size.x, s.size.y, s.size.z); transform.updateMatrix();
          batch.setMatrixAt(i, transform.matrix);
        });
        batch.castShadow = true; batch.receiveShadow = true;
        batch.computeBoundingSphere(); this.root.add(batch);
      }
      for (const object of objects.filter(o => o.body)) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.copy(object.spec.size); mesh.castShadow = true; mesh.receiveShadow = true;
        this.root.add(mesh); this.moving.push({ object, mesh });
      }
    }
  }
  update(alpha: number) {
    for (const { object, mesh } of this.moving) interpolatePose(mesh, object.previous, object.current, alpha);
  }
}
