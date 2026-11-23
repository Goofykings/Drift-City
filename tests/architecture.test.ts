import { beforeAll, expect, test } from 'vitest';
import { initializePhysics, PhysicsWorld } from '../src/physics/PhysicsWorld';
import { RaycastCar } from '../src/vehicles/RaycastCar';
import { box } from '../src/world/map';
import { identity, vec } from '../src/core/math';
import { neutralInput } from '../src/vehicles/types';
import { interpolatePose } from '../src/rendering/VehicleView';
import * as THREE from 'three';

beforeAll(async () => { await initializePhysics(); });
test('fixed collider supports a falling dynamic box and the prop can sleep', () => {
  const physics = new PhysicsWorld(1 / 120);
  try {
    physics.addBox(box('floor', vec(20, 1, 20), vec(0, -0.5, 0)));
    const prop = physics.addBox({ ...box('prop', vec(1, 1, 1), vec(0, 3, 0)), mass: 50 }).body!;
    for (let i = 0; i < 1200; i++) physics.world.step();
    expect(prop.translation().y).toBeCloseTo(0.5, 2); expect(prop.isSleeping()).toBe(true);
  } finally { physics.dispose(); }
});
test('two vehicle controllers have independent state and disposal does not remove the other vehicle', () => {
  const physics = new PhysicsWorld(1 / 120);
  physics.addBox(box('floor', vec(200, 1, 200), vec(0, -0.5, 0))); physics.world.step();
  const a = new RaycastCar(physics.world, { position: vec(-5, 0.95, 0), rotation: identity() });
  const b = new RaycastCar(physics.world, { position: vec(5, 0.95, 0), rotation: identity() });
  try {
    for (let i = 0; i < 480; i++) {
      a.beforeStep(physics.dt, { ...neutralInput(), throttle: i > 120 ? 0.5 : 0 });
      b.beforeStep(physics.dt, neutralInput()); physics.world.step(); a.afterStep(); b.afterStep();
    }
    expect(a.body.translation().z).toBeGreaterThan(5); expect(Math.abs(b.body.translation().z)).toBeLessThan(0.01);
    a.reset(); expect(b.groundedWheels).toBe(4); a.dispose(); a.dispose();
    expect(physics.world.bodies.len()).toBe(1);
    b.beforeStep(physics.dt, { ...neutralInput(), reverse: 1 }); physics.world.step(); b.afterStep();
    expect(b.body.isValid()).toBe(true);
  } finally { a.dispose(); b.dispose(); physics.dispose(); }
});
test('render interpolation takes the shortest quaternion arc and never mutates authoritative snapshots', () => {
  const previous = { position: vec(1, 2, 3), rotation: identity() };
  const current = { position: vec(3, 4, 5), rotation: { x: 0, y: 0, z: 0, w: -1 } };
  const before = JSON.stringify([previous, current]); const mesh = new THREE.Object3D();
  interpolatePose(mesh, previous, current, 0.5);
  expect(mesh.position.toArray()).toEqual([2, 3, 4]); expect(Math.abs(mesh.quaternion.w)).toBe(1);
  expect(JSON.stringify([previous, current])).toBe(before);
});
