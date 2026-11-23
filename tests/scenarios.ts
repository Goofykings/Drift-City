import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Simulation } from '../src/physics/Simulation';
import { box, cityMap, flatMap } from '../src/world/map';
import { neutralInput, type DriverInput } from '../src/vehicles/types';
import { identity, length, rotate, vec } from '../src/core/math';
import { FixedStepClock } from '../src/core/FixedStepClock';
import { InputTimeline } from '../src/input/InputTimeline';
import { ROAD_CAR } from '../src/config/vehicle';

export type Metrics = Record<string, number | number[] | string>;
function run(sim: Simulation, seconds: number, input: DriverInput = neutralInput()) {
  for (let i = 0; i < Math.round(seconds / sim.dt); i++) sim.step(input);
}
function withSim<T>(fn: (sim: Simulation) => T, map = flatMap(), dt = 1 / 120): T {
  const sim = new Simulation(map, dt);
  try { return fn(sim); } finally { sim.dispose(); }
}
function valid(sim: Simulation) {
  const p = sim.car.body.translation(), v = sim.car.body.linvel(), w = sim.car.body.angvel();
  for (const value of [...Object.values(p), ...Object.values(v), ...Object.values(w)]) assert(Number.isFinite(value));
  assert(length(v) < 100, 'No explosive linear velocity'); assert(length(w) < 50, 'No explosive rotation');
}
export const scenarios: Record<string, () => Metrics> = {
  rest: () => withSim(sim => {
    run(sim, 4); const p0 = sim.car.body.translation();
    let ymin = p0.y, ymax = p0.y;
    for (let i = 0; i < 1200; i++) { sim.step(neutralInput()); const y = sim.car.body.translation().y; ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
    const p = sim.car.body.translation();
    const drift = Math.hypot(p.x - p0.x, p.z - p0.z);
    const sag = sim.car.current.wheels.map(w => ROAD_CAR.suspension.restLength - w.length);
    assert.equal(sim.car.groundedWheels, 4); assert(drift < 0.01); assert(ymax - ymin < 0.005);
    assert(p.y > 0.45 && p.y < 0.65); sag.forEach(s => assert(s > 0.08 && s < 0.12));
    assert.equal(sim.car.body.mass(), 1400);
    // Rapier sorts principal eigenvalues; verify the world tensor, not their returned order.
    const inertia = sim.car.body.effectiveWorldInvInertia();
    assert(Math.abs(1 / inertia.m11 - ROAD_CAR.inertia.x) < 0.1);
    assert(Math.abs(1 / inertia.m22 - ROAD_CAR.inertia.y) < 0.1);
    assert(Math.abs(1 / inertia.m33 - ROAD_CAR.inertia.z) < 0.1);
    const up = rotate(sim.car.body.rotation(), vec(0, 1, 0)); assert(up.y > 0.999);
    return { height_m: p.y, drift_m: drift, verticalRange_m: ymax - ymin, sag_m: sag,
      load_N: sim.car.current.wheels.map(w => w.force), postStepVerticalVelocity_mps: sim.car.body.linvel().y };
  }),
  acceleration: () => withSim(sim => {
    run(sim, 3); const input = { ...neutralInput(), throttle: 1 };
    let to50 = 0, to100 = 0, previous = 0;
    for (let i = 0; i < 1200; i++) {
      sim.step(input); const speed = sim.car.signedSpeed;
      assert(speed >= previous - 0.003); previous = speed;
      if (!to50 && speed >= 50 / 3.6) to50 = (i + 1) * sim.dt;
      if (!to100 && speed >= 100 / 3.6) to100 = (i + 1) * sim.dt;
    }
    const p = sim.car.body.translation();
    assert(to50 > 2 && to50 < 6); assert(to100 > 6 && to100 < 12);
    assert(p.z > 100); assert(Math.abs(p.x) < 0.05); assert(Math.abs(sim.car.body.angvel().y) < 0.005);
    const front = sim.car.current.wheels[0].length, rear = sim.car.current.wheels[2].length;
    assert(front > rear, 'Acceleration transfers load rearward');
    return { zeroTo50_s: to50, zeroTo100_s: to100, lateralDrift_m: p.x, speedAt10s_kmh: previous * 3.6 };
  }),
  braking: () => withSim(sim => {
    run(sim, 3); const throttle = { ...neutralInput(), throttle: 1 }, brake = { ...neutralInput(), reverse: 1 };
    while (sim.car.signedSpeed < 50 / 3.6) sim.step(throttle);
    const start = sim.car.body.translation().z, initial = sim.car.signedSpeed;
    let elapsed = 0, earlySpeed = 0, frontSag = 0, rearSag = 0;
    while (sim.car.signedSpeed > ROAD_CAR.drive.directionThreshold && elapsed < 10) {
      sim.step(brake); elapsed += sim.dt;
      if (elapsed >= 0.1 && earlySpeed === 0) earlySpeed = sim.car.signedSpeed;
      if (elapsed > 0.6 && elapsed < 0.7) {
        frontSag = ROAD_CAR.suspension.restLength - sim.car.current.wheels[0].length;
        rearSag = ROAD_CAR.suspension.restLength - sim.car.current.wheels[2].length;
      }
    }
    const distance = sim.car.body.translation().z - start;
    assert(earlySpeed > 10, 'Braking is progressive'); assert(distance > 9 && distance < 22);
    assert(elapsed > 1 && elapsed < 3); assert(frontSag > rearSag);
    run(sim, 2, brake); assert(sim.car.signedSpeed < -1, 'Reverse engages after slowing');
    return { initial_kmh: initial * 3.6, stopThreshold_mps: ROAD_CAR.drive.directionThreshold, distance_m: distance, duration_s: elapsed, frontSag_m: frontSag, rearSag_m: rearSag };
  }),
  steering: () => withSim(sim => {
    run(sim, 3); run(sim, 2, { ...neutralInput(), throttle: 0.3 });
    run(sim, 2, { ...neutralInput(), throttle: 0.3, steering: 1 });
    const speed = sim.car.signedSpeed, yawRate = sim.car.body.angvel().y;
    const radius = Math.abs(speed / yawRate), up = rotate(sim.car.body.rotation(), vec(0, 1, 0));
    assert(yawRate > 0.15); assert(sim.car.body.translation().x > 1); assert(up.y > 0.92);
    assert(radius > 3 && radius < 20); assert(Math.abs(up.x) + Math.abs(up.z) > 0.001, 'Body roll is not locked');
    const lowAngle = sim.car.steering;
    sim.car.reset(); run(sim, 3); run(sim, 4, { ...neutralInput(), throttle: 1 });
    run(sim, 2, { ...neutralInput(), steering: 1, throttle: 0.25 });
    valid(sim); assert(Math.abs(sim.car.steering) < lowAngle); assert(rotate(sim.car.body.rotation(), vec(0, 1, 0)).y > 0.85);
    return { lowSpeed_mps: speed, radius_m: radius, yawRate_radps: yawRate, lowAngle_rad: lowAngle, moderateAngle_rad: sim.car.steering };
  }),
  reverse: () => withSim(sim => {
    run(sim, 3); run(sim, 2, { ...neutralInput(), reverse: 1 });
    assert(sim.car.signedSpeed < -1); assert(sim.car.body.translation().z < -1);
    run(sim, 0.8, { ...neutralInput(), reverse: 0.5, steering: 1 });
    assert(sim.car.body.angvel().y < -0.1); assert(sim.car.current.wheels[1].steering > 0);
    assert(sim.car.current.wheels[0].rotation < 0);
    return { speed_mps: sim.car.signedSpeed, yawRate_radps: sim.car.body.angvel().y };
  }),
  suspension: () => {
    const map = flatMap();
    map.boxes.push(box('one-wheel-bump', vec(0.65, 0.08, 1.4), vec(0.78, 0.04, 12)));
    return withSim(sim => {
      run(sim, 3); let differential = 0, minLength = 1, maxLength = 0, minContact = 4;
      for (let i = 0; i < 600; i++) {
        sim.step({ ...neutralInput(), throttle: 0.3 });
        const wheels = sim.car.current.wheels;
        differential = Math.max(differential, Math.abs(wheels[0].length - wheels[1].length));
        minLength = Math.min(minLength, ...wheels.map(w => w.length)); maxLength = Math.max(maxLength, ...wheels.map(w => w.length));
        minContact = Math.min(minContact, sim.car.groundedWheels); valid(sim);
      }
      assert(differential > 0.025); assert(minLength >= ROAD_CAR.suspension.restLength - ROAD_CAR.suspension.travel - 0.002);
      assert(sim.car.body.translation().y > 0.3); assert(rotate(sim.car.body.rotation(), vec(0, 1, 0)).y > 0.95);
      run(sim, 4, { ...neutralInput(), handbrake: true });
      assert.equal(sim.car.groundedWheels, 4);
      return { leftRightDifference_m: differential, minLength_m: minLength, maxLength_m: maxLength, minimumGrounded: minContact };
    }, map);
  },
  airborne: () => {
    const map = flatMap(); const angle = -8 * Math.PI / 180;
    map.boxes.push({ ...box('ramp', vec(6, 0.25, 10), vec(0, 0.57, 22)),
      rotation: { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) } });
    return withSim(sim => {
      run(sim, 3); let airtime = 0, peak = 0, landed = false, airborne = false, accelerationError = 0, samples = 0;
      for (let i = 0; i < 1000; i++) {
        const previousVy = sim.car.body.linvel().y, wasAir = sim.car.groundedWheels === 0;
        sim.step({ ...neutralInput(), throttle: i < 600 ? 0.7 : 0, handbrake: i >= 600 });
        const p = sim.car.body.translation(); peak = Math.max(peak, p.y);
        if (sim.car.groundedWheels === 0 && p.z > 20) {
          for (let wheel = 0; wheel < 4; wheel++) {
            assert.equal(sim.car.current.wheels[wheel].force, 0);
            assert.equal(sim.car.controller.wheelForwardImpulse(wheel), 0);
            assert.equal(sim.car.controller.wheelSideImpulse(wheel), 0);
          }
          airborne = true; airtime += sim.dt;
          if (wasAir && p.y > 0.9) {
            accelerationError = Math.max(accelerationError, Math.abs((sim.car.body.linvel().y - previousVy) / sim.dt + 9.81)); samples++;
          }
        }
        if (airborne && sim.car.groundedWheels > 0) landed = true;
        valid(sim);
      }
      assert(airtime > 0.15); assert(peak > 1.5); assert(landed); assert(samples > 5); assert(accelerationError < 0.2);
      run(sim, 3, { ...neutralInput(), handbrake: true }); assert.equal(sim.car.groundedWheels, 4);
      return { airtime_s: airtime, peakCOMHeight_m: peak, maxGravityError_mps2: accelerationError };
    }, map);
  },
  collisions: () => {
    const map = flatMap(); map.boxes.push(box('wall', vec(20, 4, 0.25), vec(0, 2, 40)));
    return withSim(sim => {
      run(sim, 3); let furthest = 0, impactSpeed = 0;
      for (let i = 0; i < 1200; i++) {
        impactSpeed = Math.max(impactSpeed, sim.car.signedSpeed);
        sim.step({ ...neutralInput(), throttle: 1 }); valid(sim);
        furthest = Math.max(furthest, sim.car.body.translation().z);
      }
      assert(impactSpeed > 15); assert(furthest < 40); assert(sim.car.body.translation().z < 39);
      // A separate high-speed crash directly seeds a test initial condition, never gameplay movement.
      sim.car.reset({ position: vec(0, 0.55, 32), rotation: identity() });
      sim.car.body.setLinvel(vec(0, 0, 80), true);
      run(sim, 0.5); valid(sim); const ccdZ = sim.car.body.translation().z; assert(ccdZ < 40);
      return { impactSpeed_mps: impactSpeed, furthestCOM_z: furthest, ccd80mpsFinal_z: ccdZ };
    }, map);
  },
  movable: () => {
    const map = flatMap(); map.boxes.push({ ...box('crate', vec(1, 1, 1), vec(0, 0.5, 12)), mass: 65 });
    return withSim(sim => {
      run(sim, 3); const crate = sim.physics.dynamics[0].body!;
      let maximumVelocity = 0;
      for (let i = 0; i < 600; i++) {
        sim.step({ ...neutralInput(), throttle: 0.4 }); maximumVelocity = Math.max(maximumVelocity, length(crate.linvel())); valid(sim);
      }
      assert(crate.translation().z > 13); assert(maximumVelocity > 1 && maximumVelocity < 30);
      return { crateDisplacement_m: crate.translation().z - 12, maxCrateSpeed_mps: maximumVelocity };
    }, map);
  },
  frameSchedules: () => {
    const finals: number[][] = [];
    for (const fps of [30, 60, 144]) withSim(sim => {
      const input = new InputTimeline();
      input.enqueue(0.307, 'KeyW', true); input.enqueue(3.019, 'KeyD', true);
      input.enqueue(4.117, 'KeyD', false); input.enqueue(6.337, 'KeyW', false);
      input.enqueue(6.337, 'KeyS', true); input.enqueue(9.061, 'KeyS', false);
      const clock = new FixedStepClock(sim.dt);
      for (let i = 0; i < fps * 12; i++) clock.advance(1 / fps, (dt, tick) => sim.step(input.sample((tick + 1) * dt)));
      assert.equal(clock.tick, 1440); assert.equal(clock.droppedSeconds, 0);
      finals.push([...Object.values(sim.car.body.translation()), ...Object.values(sim.car.body.rotation()), ...Object.values(sim.car.body.linvel())]);
    });
    let maxDifference = 0;
    for (const result of finals) result.forEach((value, i) => { maxDifference = Math.max(maxDifference, Math.abs(value - finals[0][i])); });
    assert(maxDifference < 1e-6);
    return { fps: [30, 60, 144], steps: 1440, maximumStateDifference: maxDifference };
  },
  extended: () => withSim(sim => {
    let maxSpeed = 0, maxAngular = 0, resets = 0;
    for (let i = 0; i < 120 * 180; i++) {
      const t = i * sim.dt, phase = t % 12;
      const input = { throttle: phase < 5 ? 1 : 0, reverse: phase > 7 ? 1 : 0,
        steering: phase > 2 && phase < 8 ? Math.sin(t * 0.6) : 0, handbrake: phase > 6 && phase < 6.5 };
      sim.step(input); valid(sim);
      maxSpeed = Math.max(maxSpeed, length(sim.car.body.linvel())); maxAngular = Math.max(maxAngular, length(sim.car.body.angvel()));
      if (i > 0 && i % 3600 === 0) { sim.car.reset(); resets++; }
    }
    return { simulatedSeconds: 180, maximumSpeed_mps: maxSpeed, maximumAngular_radps: maxAngular, resets };
  }, cityMap()),
  reset: () => withSim(sim => {
    run(sim, 3); run(sim, 3, { ...neutralInput(), throttle: 1, steering: 1 });
    sim.car.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true);
    sim.car.body.setAngvel(vec(3, 2, 1), true);
    sim.car.reset(); assert.equal(length(sim.car.body.linvel()), 0); assert.equal(length(sim.car.body.angvel()), 0);
    assert.equal(sim.car.throttle, 0); assert.equal(sim.car.steering, 0);
    assert.deepEqual(sim.car.previous, sim.car.current); assert.equal(sim.car.controller.numWheels(), 4);
    run(sim, 5); assert.equal(sim.car.groundedWheels, 4);
    for (let i = 0; i < 50; i++) { sim.car.reset(); sim.step(neutralInput()); }
    run(sim, 5); valid(sim); assert.equal(sim.physics.world.bodies.len(), 1);
    return { resets: 51, finalHeight_m: sim.car.body.translation().y, bodies: sim.physics.world.bodies.len() };
  }),
  resistanceAndHandbrake: () => withSim(sim => {
    run(sim, 3); run(sim, 4, { ...neutralInput(), throttle: 1 });
    const start = sim.car.signedSpeed; run(sim, 3); const coast = sim.car.signedSpeed;
    assert(coast < start - 0.3 && coast > start * 0.75, `Coast speeds: ${start} -> ${coast}`);
    run(sim, 5, { ...neutralInput(), handbrake: true }); assert(Math.abs(sim.car.signedSpeed) < 0.2);
    const parked = sim.car.body.translation(); run(sim, 3, { ...neutralInput(), handbrake: true });
    assert(Math.abs(sim.car.body.translation().z - parked.z) < 0.02);
    return { beforeCoast_mps: start, after3sCoast_mps: coast, parkedSpeed_mps: sim.car.signedSpeed };
  }),
  topSpeedAndRecovery: () => withSim(sim => {
    run(sim, 3); run(sim, 45, { ...neutralInput(), throttle: 1 });
    const topSpeed = sim.car.signedSpeed;
    assert(topSpeed > 35 && topSpeed < ROAD_CAR.drive.maxSpeed + 0.2);
    sim.car.reset(); run(sim, 3); run(sim, 3, { ...neutralInput(), throttle: 1 });
    run(sim, 1, { ...neutralInput(), steering: 1, handbrake: true });
    const sliding = length(sim.car.body.angvel()); valid(sim);
    run(sim, 5, { ...neutralInput(), throttle: 1, reverse: 1 }); // Both pedals demand service brake.
    assert(Math.abs(sim.car.signedSpeed) < 0.3); assert(rotate(sim.car.body.rotation(), vec(0, 1, 0)).y > 0.9);
    return { topSpeed_kmh: topSpeed * 3.6, cornerHandbrakeAngular_radps: sliding, recoveredSpeed_mps: sim.car.signedSpeed };
  }, flatMap(6000)),
  timestepComparison: () => {
    const metrics: Metrics = {};
    for (const hz of [60, 120]) withSim(sim => {
      run(sim, 4); metrics[`sag_${hz}Hz_m`] = ROAD_CAR.suspension.restLength - sim.car.current.wheels[0].length;
      const start = performance.now();
      for (let i = 0; i < hz * 20; i++) sim.step({ ...neutralInput(), throttle: i < hz * 5 ? 1 : 0, reverse: i >= hz * 5 && i < hz * 7 ? 1 : 0 });
      metrics[`meanTick_${hz}Hz_ms`] = (performance.now() - start) / (hz * 20);
      metrics[`distance_${hz}Hz_m`] = sim.car.body.translation().z;
      assert.equal(sim.car.groundedWheels, 4); valid(sim);
    }, flatMap(), 1 / hz);
    return metrics;
  },
};
