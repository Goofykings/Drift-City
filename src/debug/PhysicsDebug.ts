import * as THREE from 'three';
import type { Simulation } from '../physics/Simulation';

export class PhysicsDebug {
  readonly root = new THREE.Group();
  private readonly collider = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
  private readonly contacts = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x55ffc7, depthTest: false }));
  private readonly points = new Float32Array(4 * 12);
  constructor() {
    this.collider.frustumCulled = false; this.contacts.frustumCulled = false;
    this.root.add(this.collider, this.contacts); this.root.visible = false;
    this.contacts.geometry.setAttribute('position', new THREE.BufferAttribute(this.points, 3));
  }
  update(simulation: Simulation) {
    if (!this.root.visible) return;
    const { vertices, colors } = simulation.physics.world.debugRender();
    const position = this.collider.geometry.getAttribute('position');
    if (!position || position.array.length !== vertices.length) {
      this.collider.geometry.dispose();
      this.collider.geometry = new THREE.BufferGeometry();
      this.collider.geometry.setAttribute('position', new THREE.BufferAttribute(vertices.slice(), 3));
      this.collider.geometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(), 4));
    } else {
      position.array.set(vertices); position.needsUpdate = true;
      const color = this.collider.geometry.getAttribute('color');
      color.array.set(colors); color.needsUpdate = true;
    }
    simulation.car.current.wheels.forEach((wheel, i) => {
      const h = wheel.hardPoint, p = wheel.contactPoint, n = wheel.contactNormal;
      this.points.set([h.x, h.y, h.z, p.x, p.y, p.z, p.x, p.y, p.z,
        p.x + n.x * 0.4, p.y + n.y * 0.4, p.z + n.z * 0.4], i * 12);
    });
    this.contacts.geometry.getAttribute('position').needsUpdate = true;
  }
}
