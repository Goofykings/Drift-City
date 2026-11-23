import { SIMULATION } from '../config/simulation';
import { ROAD_CAR, type VehicleConfig } from '../config/vehicle';
import { PhysicsWorld } from './PhysicsWorld';
import { RaycastCar } from '../vehicles/RaycastCar';
import type { DriverInput } from '../vehicles/types';
import { cityMap, type MapSpec } from '../world/map';

/** No DOM or Three.js dependencies. The same tick implementation runs in the browser and tests. */
export class Simulation {
  readonly physics: PhysicsWorld;
  readonly car: RaycastCar;
  tick = 0;
  constructor(readonly map: MapSpec = cityMap(), readonly dt = 1 / SIMULATION.hz, config: VehicleConfig = ROAD_CAR) {
    this.physics = new PhysicsWorld(dt);
    map.boxes.forEach(spec => this.physics.addBox(spec));
    // Populate Rapier's broad phase before the vehicle's first wheel queries.
    this.physics.world.step();
    this.physics.syncHistory();
    this.car = new RaycastCar(this.physics.world, map.spawn, config);
  }
  step(input: DriverInput) {
    this.physics.beforeStep();
    this.car.beforeStep(this.dt, input);
    this.physics.world.step();
    this.car.afterStep();
    this.physics.afterStep();
    this.tick++;
  }
  syncHistory() { this.car.syncHistory(); this.physics.syncHistory(); }
  dispose() { this.car.dispose(); this.physics.dispose(); }
}
