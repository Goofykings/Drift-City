export interface VehicleConfig {
  name: string;
  mass: number;
  body: { width: number; height: number; length: number; centerY: number };
  cabin: { width: number; height: number; length: number; centerY: number; centerZ: number };
  inertia: { x: number; y: number; z: number };
  wheel: { radius: number; width: number; wheelbase: number; track: number; mountY: number };
  suspension: { restLength: number; travel: number; stiffness: number; compression: number; rebound: number; maxForce: number };
  tire: { frictionSlip: number; frontSideStiffness: number; rearSideStiffness: number; driftSlipSpeed: number };
  steering: { lowSpeedAngle: number; highSpeedAngle: number; transitionSpeed: number; rate: number; returnRate: number };
  drive: { maxForce: number; power: number; reverseForce: number; maxSpeed: number; reverseSpeed: number; throttleRate: number; releaseRate: number; directionThreshold: number };
  brakes: { serviceForce: number; frontShare: number; handbrakeForce: number; response: number };
  resistance: { airDensity: number; dragArea: number; rollingCoefficient: number; coastForce: number };
}

export const ROAD_CAR: VehicleConfig = {
  name: 'Road car · 1400 kg',
  mass: 1400, // kg, all sprung mass; wheel masses are not independently simulated.
  // Meters relative to the COM/body origin. Two matching colliders, not one oversized box.
  body: { width: 1.8, height: 0.5, length: 4.3, centerY: 0.04 },
  cabin: { width: 1.5, height: 0.52, length: 2.05, centerY: 0.55, centerZ: -0.15 },
  // kg m²: passenger-car envelope approximation about COM; x=pitch, y=yaw, z=roll.
  inertia: { x: 2200, y: 2500, z: 650 },
  wheel: { radius: 0.33, width: 0.22, wheelbase: 2.6, track: 1.56, mountY: 0.05 },
  suspension: {
    restLength: 0.36, travel: 0.22, // m; stock ray reaches restLength + radius.
    stiffness: 24.525, // s^-2: k / TOTAL chassis mass. 34335 N/m per wheel, ~0.10 m static sag.
    compression: 2.8, rebound: 3.5, // s^-1: c / TOTAL mass, not N s/m.
    maxForce: 14000, // N per wheel, ~4x static load.
  },
  tire: {
    frictionSlip: 1.15, frontSideStiffness: 1, rearSideStiffness: 0.72,
    driftSlipSpeed: 1.8, // m/s lateral contact slip for visible marks and dust.
  }, // Stock controller tuning, not a measured tire coefficient.
  steering: {
    lowSpeedAngle: 0.55, highSpeedAngle: 0.075, // radians, center-equivalent angle before Ackermann.
    transitionSpeed: 12, // m/s, smooth inverse-quadratic blend.
    rate: 1.3, returnRate: 1.9, // rad/s.
  },
  drive: {
    maxForce: 9000, power: 145000, reverseForce: 3600, // N total (front drive), W at wheels, N.
    maxSpeed: 52, reverseSpeed: 9, // m/s, force taper, never a velocity clamp.
    throttleRate: 3, // normalized input per second.
    releaseRate: 8, // normalized input per second; close throttle faster than opening it.
    directionThreshold: 0.35, // m/s below which opposite command may engage.
  },
  brakes: { serviceForce: 12500, frontShare: 0.65, handbrakeForce: 9000, response: 6 }, // N; response in 1/s.
  resistance: {
    airDensity: 1.225, // kg/m³.
    dragArea: 0.68, // Cd*A in m².
    rollingCoefficient: 0.012, // Frr = Crr * load.
    coastForce: 110, // N total driveline resistance when coasting on ground.
  },
};
