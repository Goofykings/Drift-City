import { mkdirSync, writeFileSync } from 'node:fs';
import { initializePhysics } from '../src/physics/PhysicsWorld';
import { scenarios, type Metrics } from '../tests/scenarios';
await initializePhysics();
const report: Record<string, Metrics> = {};
for (const [name, scenario] of Object.entries(scenarios)) {
  report[name] = scenario(); console.log(`PASS ${name}: ${JSON.stringify(report[name])}`);
}
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/physics-validation.json', JSON.stringify({ runtime: process.version, results: report }, null, 2));
