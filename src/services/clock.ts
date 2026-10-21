// Relógio de 1s que continua batendo com a aba em segundo plano.
// O Chrome desacelera setInterval de abas escondidas (até 1x por minuto); timers dentro
// de um Web Worker não sofrem essa desaceleração, então o worker avisa a página a cada segundo.
type Fn = () => void;

const listeners = new Set<Fn>();
let started = false;

function startClock() {
  if (started) return;
  started = true;
  const emit = () => listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('[clock]', e);
    }
  });
  try {
    const src = 'setInterval(function(){postMessage(0)},1000);';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = emit;
  } catch {
    setInterval(emit, 1000);
  }
}

/** Registra uma função chamada a cada ~1s. Retorna a função para cancelar. */
export function onTick(fn: Fn): () => void {
  startClock();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
