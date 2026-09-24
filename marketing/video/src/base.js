'use strict';
/**
 * Base do vídeo: medidas, identidade visual, tempo musical e utilitários.
 *
 * Os arquivos de src/ são scripts clássicos (não módulos) carregados em ordem
 * pelo template: assim o mesmo código roda no HTML de desenvolvimento e no
 * HTML único que o gerador monta para download, sem bundler.
 */

const W = 1080;
const H = 1920;
const FPS = 30;
const DURACAO = 25;

/** Identidade oficial: só estas cores. Degradês saem do preto para o verde escuro. */
const COR = {
  verde: '#28D9B4',
  branco: '#FFFFFF',
  preto: '#000000',
  verdeEscuro: '#0B3D33',
  verdeProfundo: '#06241E',
};

const FONTE = '"Outfit", "Poppins", sans-serif';

/**
 * 120 BPM dá uma batida a cada 0,5 s: a música e o "pulso" visual usam o mesmo
 * relógio, então sempre há algo acontecendo a cada meio segundo.
 */
const BPM = 120;
const BATIDA = 60 / BPM;
/** A batida entra quando a TV termina de ligar. */
const INICIO_BATIDA = 1.5;

const CONTATO = {
  telefone: '(13) 99747-8695',
  frase: 'quero anunciar na smart vale tv',
};

// ---------------------------------------------------------------------------
// Matemática de animação

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
/** Progresso 0→1 de t dentro do intervalo [a, b]. */
const prog = (t, a, b) => clamp((t - a) / (b - a));

const Ease = {
  linear: (t) => t,
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

/** Pulso que acende em cada batida e decai rápido (0..1). */
function pulsoBatida(t, decaimento = 7) {
  if (t < INICIO_BATIDA) return 0;
  const fase = (t - INICIO_BATIDA) % BATIDA;
  return Math.exp(-fase * decaimento);
}

/**
 * Gerador pseudoaleatório com semente. O vídeo precisa ser determinístico:
 * render(t) desenha sempre o mesmo quadro, seja no preview, na gravação pelo
 * navegador ou na exportação quadro a quadro.
 */
function aleatorio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function criarCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Interpola uma lista de quadros-chave {t, ...valores}. Entre dois quadros usa
 * inOutCubic, para o movimento nunca começar nem parar de forma seca.
 */
function interpolarChaves(chaves, t) {
  if (t <= chaves[0].t) return { ...chaves[0] };
  const ultima = chaves[chaves.length - 1];
  if (t >= ultima.t) return { ...ultima };
  let i = 0;
  while (chaves[i + 1].t < t) i++;
  const a = chaves[i];
  const b = chaves[i + 1];
  const k = Ease.inOutCubic(prog(t, a.t, b.t));
  const r = { t };
  for (const campo of Object.keys(a)) {
    if (campo !== 't') r[campo] = lerp(a[campo], b[campo], k);
  }
  return r;
}

/** Escreve texto com brilho (sombra colorida) sem vazar o estado do contexto. */
function textoComBrilho(ctx, texto, x, y, cor, brilho) {
  ctx.save();
  ctx.fillStyle = cor;
  if (brilho > 0) {
    ctx.shadowColor = rgba(COR.verde, Math.min(1, brilho));
    ctx.shadowBlur = 40 * brilho;
  }
  ctx.fillText(texto, x, y);
  ctx.restore();
}

function fonte(tamanho) {
  return `700 ${tamanho}px ${FONTE}`;
}
