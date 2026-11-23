import './style.css';
import { initializePhysics } from './physics/PhysicsWorld';
import { Game } from './core/Game';

declare global { interface Window { blockCity?: { telemetry: () => ReturnType<Game['telemetry']> } } }
let game: Game | undefined;
try {
  await initializePhysics();
  game = new Game(document.getElementById('game') as HTMLCanvasElement);
  window.blockCity = { telemetry: () => game!.telemetry() };
} catch (error) {
  game?.dispose();
  const status = document.getElementById('status')!;
  status.hidden = false;
  status.textContent = `Block City could not start: ${error instanceof Error ? error.message : String(error)}. Use a browser with WebGL 2 and WebAssembly support.`;
  console.error(error);
}
const dispose = () => { game?.dispose(); delete window.blockCity; window.removeEventListener('pagehide', onPageHide); };
const onPageHide = (event: PageTransitionEvent) => { if (!event.persisted) dispose(); };
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(dispose);
