import RAPIER from '@dimforge/rapier3d-compat';
import { ROAD_CAR, type VehicleConfig } from '../config/vehicle';
import { SIMULATION } from '../config/simulation';
import { approach, clamp, dot, identity, length, rotate, vec } from '../core/math';
import { copyPose, GROUP, groups, readPose } from '../physics/PhysicsWorld';
import type { DriverInput, Pose, VehicleState, VehicleSystem, WheelState } from './types';

const wheelState = (rest: number): WheelState => ({ length: rest, rotation: 0, steering: 0,
  contact: false, force: 0, hardPoint: vec(), contactPoint: vec(), contactNormal: vec(0, 1, 0) });
const state = (rest: number): VehicleState => ({ position: vec(), rotation: identity(), wheels: Array.from({ length: 4 }, () => wheelState(rest)) });
function copyState(from: VehicleState, to: VehicleState) {
  copyPose(from, to);
  for (let i = 0; i < 4; i++) {
    const a = from.wheels[i], b = to.wheels[i];
    b.length = a.length; b.rotation = a.rotation; b.steering = a.steering; b.contact = a.contact; b.force = a.force;
    Object.assign(b.hardPoint, a.hardPoint); Object.assign(b.contactPoint, a.contactPoint); Object.assign(b.contactNormal, a.contactNormal);
  }
}
/** Stock Rapier wheel dynamics are contained here, behind the VehicleSystem boundary. */
export class RaycastCar implements VehicleSystem {
  readonly body: RAPIER.RigidBody;
  controller: RAPIER.DynamicRayCastVehicleController;
  readonly previous: VehicleState;
  readonly current: VehicleState;
  readonly mounts;
  throttle = 0;
  brake = 0;
  steering = 0;
  signedSpeed = 0;
  private readonly forward = vec();
  private readonly velocity = vec();
  private readonly impulse = vec();
  private readonly rotation = identity();
  private disposed = false;

  constructor(readonly world: RAPIER.World, readonly spawn: Pose, readonly config: VehicleConfig = ROAD_CAR) {
    const c = config;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.position.x, spawn.position.y, spawn.position.z).setRotation(spawn.rotation)
      .setAdditionalMassProperties(c.mass, vec(), c.inertia, identity())
      .setCcdEnabled(true).setCanSleep(false)); // Wheel impulses are external to the solver's sleeping contacts.
    for (const [shape, z] of [[c.body, 0], [c.cabin, c.cabin.centerZ]] as const) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(shape.width / 2, shape.height / 2, shape.length / 2)
        .setTranslation(0, shape.centerY, z).setDensity(0).setFriction(0.45).setRestitution(0.05)
        .setCollisionGroups(groups(GROUP.vehicle)), this.body);
    }
    this.body.recomputeMassPropertiesFromColliders();
    // FL, FR, RL, RR. +Z forward, +X right; up cross axle = +Z => axle = -X.
    this.mounts = [-1, 1, -1, 1].map((side, i) => vec(side * c.wheel.track / 2, c.wheel.mountY,
      (i < 2 ? 1 : -1) * c.wheel.wheelbase / 2));
    this.previous = state(c.suspension.restLength);
    this.current = state(c.suspension.restLength);
    this.controller = this.makeController();
    readPose(this.body, this.current);
    copyState(this.current, this.previous);
  }
  private makeController() {
    const c = this.config, s = c.suspension;
    const controller = this.world.createVehicleController(this.body);
    controller.indexUpAxis = 1;
    controller.setIndexForwardAxis = 2; // 0.21.0 exposes this oddly named property setter, not a method.
    this.mounts.forEach((mount, i) => {
      controller.addWheel(mount, vec(0, -1, 0), vec(-1, 0, 0), s.restLength, c.wheel.radius);
      controller.setWheelMaxSuspensionTravel(i, s.travel);
      controller.setWheelSuspensionStiffness(i, s.stiffness);
      controller.setWheelSuspensionCompression(i, s.compression);
      controller.setWheelSuspensionRelaxation(i, s.rebound);
      controller.setWheelMaxSuspensionForce(i, s.maxForce);
      controller.setWheelFrictionSlip(i, c.tire.frictionSlip);
      controller.setWheelSideFrictionStiffness(i, c.tire.sideStiffness);
    });
    return controller;
  }
  beforeStep(dt: number, input: DriverInput) {
    copyState(this.current, this.previous);
    const c = this.config, ctl = this.controller;
    this.body.rotation(this.rotation);
    rotate(this.rotation, { x: 0, y: 0, z: 1 }, this.forward);
    this.body.linvel(this.velocity);
    this.signedSpeed = dot(this.velocity, this.forward);
    const speed = Math.abs(this.signedSpeed);
    const forward = clamp(input.throttle, 0, 1), reverse = clamp(input.reverse, 0, 1);
    let requestedThrottle = 0, requestedBrake = 0;
    if (forward && reverse) requestedBrake = 1;
    else if (reverse) {
      if (this.signedSpeed > c.drive.directionThreshold) requestedBrake = reverse;
      else requestedThrottle = -reverse;
    } else if (forward) {
      if (this.signedSpeed < -c.drive.directionThreshold) requestedBrake = forward;
      else requestedThrottle = forward;
    }
    const throttleRate = Math.abs(requestedThrottle) < Math.abs(this.throttle) ? c.drive.releaseRate : c.drive.throttleRate;
    this.throttle = approach(this.throttle, requestedThrottle, throttleRate * dt);
    this.brake = approach(this.brake, requestedBrake, c.brakes.response * dt);
    const maxAngle = c.steering.highSpeedAngle + (c.steering.lowSpeedAngle - c.steering.highSpeedAngle)
      / (1 + (speed / c.steering.transitionSpeed) ** 2);
    const target = clamp(input.steering, -1, 1) * maxAngle;
    this.steering = approach(this.steering, target, (input.steering ? c.steering.rate : c.steering.returnRate) * dt);
    // Ackermann from center steering: positive is right, inner front wheel has larger angle.
    const tangent = Math.tan(Math.abs(this.steering));
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const denominator = c.wheel.wheelbase - side * Math.sign(this.steering) * c.wheel.track / 2 * tangent;
      ctl.setWheelSteering(i, i < 2 ? Math.sign(this.steering) * Math.atan(c.wheel.wheelbase * tangent / denominator) : 0);
    }
    const direction = Math.sign(this.throttle);
    const cap = direction >= 0 ? c.drive.maxSpeed : c.drive.reverseSpeed;
    const taper = clamp((cap - speed) / (cap * 0.15), 0, 1);
    const available = direction >= 0 ? Math.min(c.drive.maxForce, c.drive.power / Math.max(speed, 1)) : c.drive.reverseForce;
    const engine = this.brake > 0 || input.handbrake || requestedBrake > 0 ? 0 : this.throttle * available * taper;
    const rrPerWheel = c.resistance.rollingCoefficient * c.mass * SIMULATION.gravity / 4;
    for (let i = 0; i < 4; i++) {
      const share = (i < 2 ? c.brakes.frontShare : 1 - c.brakes.frontShare) / 2;
      let brakeForce = this.brake * c.brakes.serviceForce * share;
      if (input.handbrake && i >= 2) brakeForce += c.brakes.handbrakeForce / 2;
      let drivingForce = i < 2 ? engine / 2 : 0;
      if (drivingForce !== 0) {
        drivingForce -= Math.sign(this.signedSpeed) * rrPerWheel * Math.min(speed / 0.5, 1);
      } else {
        brakeForce += rrPerWheel + (engine === 0 && this.brake === 0 ? c.resistance.coastForce / 4 : 0);
      }
      ctl.setWheelEngineForce(i, drivingForce);
      ctl.setWheelBrake(i, brakeForce * dt); // Rapier expects impulse (N s), NOT force.
    }
    // Drag is the only extra chassis resistance. Tire rolling/coast resistance above is not repeated here.
    const velocityLength = length(this.velocity);
    const factor = Math.min(c.mass, 0.5 * c.resistance.airDensity * c.resistance.dragArea * velocityLength * dt);
    this.impulse.x = -this.velocity.x * factor; this.impulse.y = -this.velocity.y * factor; this.impulse.z = -this.velocity.z * factor;
    this.body.applyImpulse(this.impulse, false);
    ctl.updateVehicle(dt, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
  }
  afterStep() {
    readPose(this.body, this.current);
    rotate(this.current.rotation, { x: 0, y: 0, z: 1 }, this.forward);
    this.body.linvel(this.velocity);
    this.signedSpeed = dot(this.velocity, this.forward);
    for (let i = 0; i < 4; i++) {
      const w = this.current.wheels[i], ctl = this.controller;
      w.length = ctl.wheelSuspensionLength(i) ?? this.config.suspension.restLength;
      w.rotation = ctl.wheelRotation(i) ?? 0;
      w.steering = ctl.wheelSteering(i) ?? 0;
      w.contact = ctl.wheelIsInContact(i) ?? false;
      w.force = ctl.wheelSuspensionForce(i) ?? 0;
      ctl.wheelHardPoint(i, w.hardPoint);
      ctl.wheelContactPoint(i, w.contactPoint);
      ctl.wheelContactNormal(i, w.contactNormal);
    }
  }
  syncHistory() { copyState(this.current, this.previous); }
  private safeSpawn(): Pose {
    const b = this.config.body, c = this.config.cabin;
    const bottom = b.centerY - b.height / 2, top = c.centerY + c.height / 2;
    const shape = new RAPIER.Cuboid(b.width / 2 + 0.05, (top - bottom) / 2 + 0.05, b.length / 2 + 0.05);
    const offset = rotate(this.spawn.rotation, vec(0, (top + bottom) / 2, 0));
    const position = { ...this.spawn.position };
    // A displaced prop may occupy the reset spot. Search upward for a clear drop position.
    for (let attempt = 0; attempt < 32; attempt++) {
      const center = vec(position.x + offset.x, position.y + offset.y, position.z + offset.z);
      const hit = this.world.intersectionWithShape(center, this.spawn.rotation, shape,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, this.body);
      if (!hit) return { position, rotation: this.spawn.rotation };
      position.y += 1.5;
    }
    throw new Error('No clear vehicle reset position above the configured spawn');
  }
  reset(pose: Pose = this.safeSpawn()) {
    this.world.removeVehicleController(this.controller);
    this.body.setTranslation(pose.position, true); this.body.setRotation(pose.rotation, true);
    this.body.setLinvel(vec(), true); this.body.setAngvel(vec(), true);
    this.body.resetForces(true); this.body.resetTorques(true);
    this.throttle = 0; this.brake = 0; this.steering = 0; this.signedSpeed = 0;
    this.controller = this.makeController(); // Clears contact caches AND wheel spin; API has no reset method.
    readPose(this.body, this.current);
    for (const w of this.current.wheels) Object.assign(w, wheelState(this.config.suspension.restLength));
    this.syncHistory();
    this.world.propagateModifiedBodyPositionsToColliders();
  }
  get groundedWheels() { return this.current.wheels.reduce((n, w) => n + Number(w.contact), 0); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.world.removeVehicleController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
