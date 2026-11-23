import type { Quat, Vec3 } from '../core/math';
export interface DriverInput { throttle: number; reverse: number; steering: number; handbrake: boolean }
export const neutralInput = (): DriverInput => ({ throttle: 0, reverse: 0, steering: 0, handbrake: false });
export interface Pose { position: Vec3; rotation: Quat }
export interface WheelState {
  length: number; rotation: number; steering: number; contact: boolean; force: number; lateralSlip: number;
  hardPoint: Vec3; contactPoint: Vec3; contactNormal: Vec3;
}
export interface VehicleState extends Pose { wheels: WheelState[] }
/** Inputs are consumed once per tick. Renderers only read these snapshots. */
export interface VehicleVisualState {
  readonly previous: VehicleState;
  readonly current: VehicleState;
  readonly mounts: readonly Vec3[];
}
export interface VehicleSystem extends VehicleVisualState {
  beforeStep(dt: number, input: DriverInput): void;
  afterStep(): void;
  reset(pose?: Pose): void;
  dispose(): void;
}
