import * as THREE from 'three';
import { SIMULATION } from '../config/simulation';
import { FixedStepClock } from './FixedStepClock';
import { Simulation } from '../physics/Simulation';
import { KeyboardInput } from '../input/KeyboardInput';
import { VehicleView } from '../rendering/VehicleView';
import { WorldView } from '../rendering/WorldView';
import { DriftEffects } from '../rendering/DriftEffects';
import { ChaseCamera } from '../camera/ChaseCamera';
import { PhysicsDebug } from '../debug/PhysicsDebug';
import { length } from './math';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Game {
  readonly simulation = new Simulation();
  readonly clock = new FixedStepClock(this.simulation.dt, SIMULATION.maxCatchUpSteps, SIMULATION.maxFrameSeconds);
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.08, 500);
  readonly carView = new VehicleView(this.simulation.car.config);
  readonly worldView = new WorldView(this.simulation.physics);
  readonly driftEffects = new DriftEffects(this.simulation.car.config);
  readonly chase = new ChaseCamera(this.camera, this.simulation.physics.world, this.simulation.car.body);
  readonly debug = new PhysicsDebug();
  readonly input: KeyboardInput;
  private readonly abort = new AbortController();
  private readonly sun = new THREE.DirectionalLight(0xfff4df, 2.4);
  private readonly sunOffset = new THREE.Vector3(-35, 65, -25);
  private lastFrame = performance.now();
  private lastHud = 0;
  private frameHandle = 0;
  private fps = 60;
  private stepMs = 0;
  private disposed = false;
  private frameCount = 0;
  private frameTimeTotal = 0;
  private stepTimeTotal = 0;
  private measuredSteps = 0;
  private readonly speedText = element('speed');
  private readonly gearText = element('gear');
  private readonly debugText = element('debug');
  constructor(canvas: HTMLCanvasElement, onHome: () => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene.background = new THREE.Color(0xaebfc9);
    this.scene.fog = new THREE.Fog(0xaebfc9, 100, 280);
    this.scene.add(new THREE.HemisphereLight(0xe5f0ff, 0x687668, 2));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 160 });
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun, this.sun.target, this.carView.root, this.worldView.root, this.driftEffects.root, this.debug.root);
    this.input = new KeyboardInput(timestamp => this.clock.tick * this.clock.dt + this.clock.alpha * this.clock.dt
      + Math.max(0, (timestamp - this.lastFrame) / 1000), key => this.action(key), () => this.setPaused(true));
    const options = { signal: this.abort.signal };
    window.addEventListener('resize', () => this.resize(), options);
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault(); this.setPaused(true);
      element('status').hidden = false;
      element('status').textContent = 'The graphics context was lost. Reload the page to restart.';
    }, options);
    for (const [id, key] of [['reset', 'KeyR'], ['camera', 'KeyC'], ['pause', 'Escape'], ['debug-toggle', 'F3'], ['resume', 'Escape']]) {
      element(id).addEventListener('click', () => { this.action(key); element(id).blur(); }, options);
    }
    element('home').addEventListener('click', onHome, options);
    this.resize();
    element('status').hidden = true;
    this.frameHandle = requestAnimationFrame(this.frame);
  }
  private resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
  private action(key: string) {
    if (key === 'KeyP' || key === 'Escape') this.setPaused(!this.clock.paused);
    if (key === 'KeyR') this.reset();
    if (key === 'KeyC') this.chase.toggle();
    if (key === 'F3') {
      this.debug.root.visible = !this.debug.root.visible;
      this.debugText.hidden = !this.debug.root.visible;
      element('debug-toggle').setAttribute('aria-pressed', String(this.debug.root.visible));
      this.updateHud();
    }
  }
  setPaused(paused: boolean) {
    this.clock.setPaused(paused); this.input.timeline.clear();
    this.simulation.syncHistory(); this.lastFrame = performance.now();
    element('pause-screen').hidden = !paused;
    element('pause').textContent = paused ? 'Resume' : 'Pause';
  }
  reset() {
    this.input.timeline.clear(); this.clock.clearDebt();
    this.simulation.car.reset(); this.simulation.syncHistory(); this.chase.reset();
    this.driftEffects.clearTrail();
  }
  private frame = (now: number) => {
    if (this.disposed) return;
    const elapsed = Math.max(0, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    // Discard stale control transitions when abandoning a long wall-time interval.
    if (elapsed > this.clock.maxFrame) this.input.timeline.clear();
    const alpha = this.clock.advance(elapsed, (dt, tick) => {
      const start = performance.now();
      this.simulation.step(this.input.timeline.sample((tick + 1) * dt));
      this.driftEffects.sample(this.simulation.car, this.simulation.car.signedSpeed);
      const cost = performance.now() - start;
      this.stepMs += (cost - this.stepMs) * 0.03;
      this.stepTimeTotal += cost; this.measuredSteps++;
    });
    const renderAlpha = this.clock.paused ? 1 : alpha;
    this.carView.update(this.simulation.car, renderAlpha);
    this.worldView.update(renderAlpha);
    this.driftEffects.update(this.clock.paused ? 0 : Math.min(elapsed, 0.1));
    this.chase.update(this.carView.root, this.simulation.car.signedSpeed, Math.min(elapsed, 0.1));
    this.sun.position.copy(this.carView.root.position).add(this.sunOffset);
    this.sun.target.position.copy(this.carView.root.position);
    this.debug.update(this.simulation);
    this.renderer.render(this.scene, this.camera);
    if (elapsed > 0 && elapsed < 0.25) {
      this.fps += (1 / elapsed - this.fps) * 0.05;
      if (!this.clock.paused) { this.frameCount++; this.frameTimeTotal += elapsed; }
    }
    if (now - this.lastHud > 100) { this.updateHud(); this.lastHud = now; }
    this.frameHandle = requestAnimationFrame(this.frame);
  };
  private updateHud() {
    const car = this.simulation.car, speed = car.signedSpeed;
    this.speedText.textContent = String(Math.round(Math.abs(speed) * 3.6));
    this.gearText.textContent = speed < -0.2 ? 'R' : speed > 0.2 ? 'D' : 'N';
    if (!this.debug.root.visible) return;
    const p = car.body.translation(), v = car.body.linvel(), a = car.body.angvel();
    const xyz = (n: { x: number; y: number; z: number }) => `${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}`;
    this.debugText.textContent = [car.config.name, `${SIMULATION.hz} Hz physics | ${this.fps.toFixed(0)} FPS | ${this.stepMs.toFixed(2)} ms/tick`,
      `Tick ${this.clock.tick} | discarded ${this.clock.droppedSeconds.toFixed(3)} s`,
      `Speed ${(speed * 3.6).toFixed(1)} km/h | ${length(v).toFixed(2)} m/s magnitude`,
      `Position m: ${xyz(p)}`, `Velocity m/s: ${xyz(v)}`, `Angular rad/s: ${xyz(a)}`,
      `Steer ${(car.steering * 180 / Math.PI).toFixed(1)}° | throttle ${car.throttle.toFixed(2)} | brake ${car.brake.toFixed(2)}`,
      `Grounded ${car.groundedWheels}/4 | Camera ${this.chase.mode ? 'high' : 'chase'}`,
      ...car.current.wheels.map((w, i) => `${['FL', 'FR', 'RL', 'RR'][i]} ${w.contact ? 'contact' : 'air    '}  length ${w.length.toFixed(3)} m  load ${w.force.toFixed(0)} N`),
      'Green: suspension rays and contact normals', 'Raycast tires · no physical wheel sidewalls'].join('\n');
  }
  // Read-only browser QA seam; no transport or multiplayer state is implemented.
  telemetry() {
    const car = this.simulation.car;
    return { tick: this.clock.tick, paused: this.clock.paused, position: car.body.translation(),
      rotation: car.body.rotation(), velocity: car.body.linvel(), signedSpeed: car.signedSpeed,
      grounded: car.groundedWheels, throttle: car.throttle, steering: car.steering, brake: car.brake,
      cameraMode: this.chase.mode, cameraPosition: this.camera.position.toArray(),
      debug: this.debug.root.visible, droppedSeconds: this.clock.droppedSeconds,
      driftMarks: this.driftEffects.markCount,
      dustParticles: this.driftEffects.dustCount,
      dustEmitted: this.driftEffects.dustEmitted,
      averageFps: this.frameCount / Math.max(this.frameTimeTotal, 0.001),
      averageStepMs: this.stepTimeTotal / Math.max(this.measuredSteps, 1),
      drawCalls: this.renderer.info.render.calls, geometries: this.renderer.info.memory.geometries };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frameHandle); this.abort.abort(); this.input.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(mat);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    this.sun.shadow.dispose(); this.renderer.dispose(); this.simulation.dispose();
  }
}
