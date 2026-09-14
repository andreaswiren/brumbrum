import './ui/style.css';
import { startGame } from './game/Game';
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
startGame(canvas).catch((error: unknown) => {
  console.error('Game initialization failed', error);
  const message = document.createElement('div');
  message.id = 'loading';
  const title = document.createElement('h2');
  title.textContent = 'PINE VALLEY COULDN’T START';
  const detail = document.createElement('p');
  detail.textContent =
    'A WebGPU or WebGL2 browser with hardware acceleration is required. Reload to try again.';
  const technical = document.createElement('p');
  technical.textContent = error instanceof Error ? error.message : String(error);
  message.append(title, detail, technical);
  document.querySelector('#ui')!.replaceChildren(message);
});
