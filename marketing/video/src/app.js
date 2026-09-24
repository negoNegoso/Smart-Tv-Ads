'use strict';
/**
 * Monta o vídeo (cenas + companheiro + transições) numa função render(t) e
 * liga a página: assistir, gravar o MP4 no navegador e os ganchos que o
 * gerador usa para exportar quadro a quadro.
 */

/**
 * Caminho do ícone que acompanha o vídeo. Some dentro da TV na abertura,
 * aparece em cada cena num lugar livre de texto e termina pousando no ícone
 * da logo (o ponto é calculado a partir da caixa da logo na cena final).
 */
function chavesCompanheiro(caixaLogo) {
  // No arquivo da logo, o ícone tem o centro a 80,7% da largura, ocupa 32%
  // dela e fica centrado na altura: é ali que o companheiro "encaixa".
  const pouso = {
    x: caixaLogo.x - caixaLogo.w / 2 + caixaLogo.w * 0.807,
    y: caixaLogo.y,
    w: caixaLogo.w * 0.32,
  };
  return [
    { t: 4.3, x: 540, y: 250, w: 170, rot: 0, a: 0 },
    { t: 4.7, x: 540, y: 330, w: 170, rot: 0, a: 1 },
    { t: 6.95, x: 540, y: 330, w: 170, rot: 0, a: 1 },
    { t: 7.35, x: 540, y: 470, w: 160, rot: -6, a: 1 },
    { t: 10.4, x: 540, y: 470, w: 160, rot: -6, a: 1 },
    { t: 10.85, x: 540, y: 235, w: 110, rot: 0, a: 1 },
    { t: 16.85, x: 540, y: 235, w: 110, rot: 0, a: 1 },
    { t: 17.5, x: 540, y: 610, w: 320, rot: 0, a: 1 },
    { t: 19.9, x: 540, y: 610, w: 320, rot: 0, a: 1 },
    { t: 20.35, x: 540, y: 500, w: 210, rot: 0, a: 1 },
    { t: 22.3, x: 540, y: 500, w: 210, rot: 0, a: 1 },
    { t: 22.75, x: pouso.x, y: pouso.y, w: pouso.w, rot: 0, a: 1 },
    { t: 23.05, x: pouso.x, y: pouso.y, w: pouso.w, rot: 0, a: 0 },
  ];
}

/** Transições globais: desenham por cima de tudo e trazem o próprio som. */
const TRANSICOES = [
  { desenhar: (ctx, t) => Transicao.luz(ctx, t, 0.47, { duracao: 0.4, forca: 0.75 }) },
  { desenhar: (ctx, t) => Transicao.luz(ctx, t, 4.2, { forca: 0.6 }) },
  { desenhar: (ctx, t) => Transicao.luz(ctx, t, 7.08, { forca: 0.45 }) },
  { desenhar: (ctx, t) => Transicao.luz(ctx, t, 10.55, { forca: 0.45 }) },
  {
    desenhar: (ctx, t) => Transicao.liquido(ctx, t, 16.85, 1.0),
    sons: [{ t: 16.85, tipo: 'whoosh', duracao: 0.55 }, { t: 17.3, tipo: 'pop' }],
  },
  { desenhar: (ctx, t) => Transicao.luz(ctx, t, 20.05, { forca: 0.45 }) },
  {
    // O verde do clique se dissolve e revela a logo.
    desenhar: (ctx, t) => {
      if (t < 22.34 || t > 22.95) return;
      ctx.save();
      ctx.globalAlpha = 1 - Ease.outCubic(prog(t, 22.38, 22.95));
      ctx.fillStyle = COR.verde;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },
  },
];

function criarVideo(canvas, logo) {
  const ctx = canvas.getContext('2d');
  const fundo = new Fundo();
  const cenas = [
    new CenaAbertura(new Loja()),
    new CenaRede(),
    new CenaPreco(),
    new CenaDiferenciais(),
    new CenaParceiro(),
    new CenaConvite(),
    new CenaFinal(logo),
  ];
  const final = cenas[cenas.length - 1];
  const companheiro = new Companheiro(chavesCompanheiro(final.caixaLogo));

  /** Na abertura a loja é o fundo; no final o fundo fica mais calmo. */
  const intensidadeFundo = (t) => lerp(0.4, 1, prog(t, 3.9, 4.4)) * lerp(1, 0.7, prog(t, 22.3, 22.6));

  function render(t) {
    t = clamp(t, 0, DURACAO);
    ctx.save();
    fundo.desenhar(ctx, t, intensidadeFundo(t));
    for (const cena of cenas) if (cena.ativa(t)) cena.desenhar(ctx, t);
    companheiro.desenhar(ctx, t);
    for (const tr of TRANSICOES) tr.desenhar(ctx, t);
    fundo.granulado(ctx, t);
    ctx.restore();
  }

  function sons() {
    return [...cenas.flatMap((c) => c.sons()), ...TRANSICOES.flatMap((tr) => tr.sons ?? [])]
      .filter((e) => e.t >= 0 && e.t < DURACAO)
      .sort((a, b) => a.t - b.t);
  }

  return { render, sons };
}

// ---------------------------------------------------------------------------
// Áudio: WAV para a exportação offline

function audioParaWav(buffer) {
  const canais = buffer.numberOfChannels;
  const n = buffer.length;
  const bytes = new DataView(new ArrayBuffer(44 + n * canais * 2));
  const escrever = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
  escrever(0, 'RIFF');
  bytes.setUint32(4, 36 + n * canais * 2, true);
  escrever(8, 'WAVE');
  escrever(12, 'fmt ');
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, canais, true);
  bytes.setUint32(24, buffer.sampleRate, true);
  bytes.setUint32(28, buffer.sampleRate * canais * 2, true);
  bytes.setUint16(32, canais * 2, true);
  bytes.setUint16(34, 16, true);
  escrever(36, 'data');
  bytes.setUint32(40, n * canais * 2, true);
  const dados = [...Array(canais)].map((_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < canais; c++) {
      bytes.setInt16(o, clamp(dados[c][i], -1, 1) * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(bytes.buffer);
}

// ---------------------------------------------------------------------------
// Página

/** Formatos em ordem de preferência: MP4 (H.264 + AAC) primeiro. */
const FORMATOS = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.4d0028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

async function iniciar() {
  await document.fonts.load(fonte(100));
  const logo = document.getElementById('logo');
  if (!logo.complete) await new Promise((ok) => logo.addEventListener('load', ok, { once: true }));

  const canvas = document.getElementById('video');
  const video = criarVideo(canvas, logo);
  video.render(0);

  // Ganchos do gerador (marketing/video/gerar-video.mjs).
  window.exportar = {
    quadro(t, qualidade = 0.95) {
      video.render(t);
      return canvas.toDataURL('image/jpeg', qualidade);
    },
    async audioWav() {
      const taxa = 48000;
      const off = new OfflineAudioContext(2, taxa * DURACAO, taxa);
      new Trilha(off, off.destination).agendar(video.sons(), 0);
      const wav = audioParaWav(await off.startRendering());
      let bin = '';
      for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode(...wav.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    duracao: DURACAO,
    fps: FPS,
  };
  window.videoPronto = true;

  ligarControles(canvas, video);
}

function ligarControles(canvas, video) {
  const botaoAssistir = document.getElementById('assistir');
  const botaoBaixar = document.getElementById('baixar');
  const status = document.getElementById('status');
  const barra = document.getElementById('barra');
  if (!botaoAssistir) return;

  let tocando = false;

  /** Toca o vídeo com o relógio do áudio, para imagem e som não descolarem. */
  async function tocar({ gravar }) {
    if (tocando) return;
    tocando = true;
    botaoAssistir.disabled = botaoBaixar.disabled = true;
    const audio = new AudioContext({ sampleRate: 48000 });
    await audio.resume();
    const saidas = [audio.destination];
    let gravador;
    let partes = [];
    let formato;

    if (gravar) {
      const destinoGravacao = audio.createMediaStreamDestination();
      saidas.push(destinoGravacao);
      const fluxo = new MediaStream([
        ...canvas.captureStream(FPS).getVideoTracks(),
        ...destinoGravacao.stream.getAudioTracks(),
      ]);
      formato = FORMATOS.find((f) => MediaRecorder.isTypeSupported(f));
      gravador = new MediaRecorder(fluxo, {
        mimeType: formato,
        videoBitsPerSecond: 16_000_000,
        audioBitsPerSecond: 256_000,
      });
      gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);
    }

    // Um só grafo de áudio alimentando alto-falante e gravação.
    const mistura = audio.createGain();
    for (const s of saidas) mistura.connect(s);
    const t0 = audio.currentTime + 0.3;
    new Trilha(audio, mistura).agendar(video.sons(), t0);
    video.render(0);
    if (gravador) gravador.start(250);

    await new Promise((fim) => {
      const quadro = () => {
        const t = audio.currentTime - t0;
        video.render(Math.max(0, t));
        barra.style.width = `${clamp(t / DURACAO) * 100}%`;
        status.textContent = gravar
          ? `Gravando… ${Math.max(0, Math.ceil(DURACAO - t))}s. Deixe esta aba aberta na frente.`
          : 'Tocando…';
        if (t < DURACAO + 0.15) requestAnimationFrame(quadro);
        else fim();
      };
      requestAnimationFrame(quadro);
    });

    if (gravador) {
      await new Promise((ok) => {
        gravador.onstop = ok;
        gravador.stop();
      });
      const tipo = formato.split(';')[0];
      const extensao = tipo === 'video/mp4' ? 'mp4' : 'webm';
      const arquivo = new Blob(partes, { type: tipo });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(arquivo);
      link.download = `smart-vale-tv.${extensao}`;
      link.click();
      status.textContent =
        extensao === 'mp4'
          ? 'Pronto! O arquivo smart-vale-tv.mp4 foi para a pasta Downloads.'
          : 'Pronto! Este Chrome não grava MP4, então saiu em .webm. Atualize o Chrome para ter MP4.';
    } else {
      status.textContent = 'Fim. Pode assistir de novo ou baixar.';
    }
    await audio.close();
    tocando = false;
    botaoAssistir.disabled = botaoBaixar.disabled = false;
  }

  botaoAssistir.addEventListener('click', () => tocar({ gravar: false }));
  botaoBaixar.addEventListener('click', () => tocar({ gravar: true }));
}

iniciar();
