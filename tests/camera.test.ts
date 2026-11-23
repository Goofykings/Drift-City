import { beforeAll, expect, test } from 'vitest';
import * as THREE from 'three';
import { initializePhysics } from '../src/physics/PhysicsWorld';
import { Simulation } from '../src/physics/Simulation';
import { box, flatMap } from '../src/world/map';
import { vec } from '../src/core/math';
import { ChaseCamera } from '../src/camera/ChaseCamera';
import { neutralInput } from '../src/vehicles/types';

beforeAll(async () => { await initializePhysics(); });
test('camera sphere retracts before a wall and extends smoothly after clearance', () => {
  const map = flatMap(); map.boxes.push(box('rear-wall', vec(20, 10, 0.4), vec(0, 5, -3)));
  const sim = new Simulation(map);
  try {
    for (let i = 0; i < 400; i++) sim.step(neutralInput());
    const camera = new THREE.PerspectiveCamera(), root = new THREE.Object3D();
    root.position.copy(sim.car.body.translation());
    const follow = new ChaseCamera(camera, sim.physics.world, sim.car.body);
    follow.update(root, 0, 1 / 60);
    expect(camera.position.z).toBeGreaterThan(-2.56); expect(camera.position.z).toBeLessThan(-1);
    root.position.x = 15;
    for (let i = 0; i < 120; i++) follow.update(root, 0, 1 / 60);
    expect(camera.position.z).toBeLessThan(-7);
    expect(camera.position.y).toBeGreaterThan(0.24);
    root.position.set(40, 0.55, 40); follow.reset(); follow.update(root, 0, 1 / 60);
    expect(camera.position.distanceTo(root.position)).toBeLessThan(10);
  } finally { sim.dispose(); }
});
test('reset avoids a rigid prop occupying the configured spawn', () => {
  const map = flatMap(); map.boxes.push({ ...box('blocking-prop', vec(2, 2, 2), vec(15, 1, 0)), mass: 500 });
  const sim = new Simulation(map);
  try {
    sim.car.body.setTranslation(vec(20, 2, 0), true);
    sim.physics.dynamics[0].body!.setTranslation(vec(0, 1, 0), true);
    sim.step(neutralInput());
    sim.car.reset();
    expect(sim.car.body.translation().y).toBeGreaterThan(2);
    expect(sim.car.body.linvel()).toEqual(vec());
  } finally { sim.dispose(); }
});
