'use strict';
/**
 * Trilha e efeitos sonoros feitos na hora com Web Audio, sem arquivos de som.
 *
 * Funciona igual num AudioContext (assistir/gravar no navegador) e num
 * OfflineAudioContext (exportação do MP4), porque tudo é agendado em tempo
 * absoluto a partir de t0. Os efeitos vêm da lista de eventos que as cenas
 * declaram, então o som cai exatamente no quadro da animação.
 */

/** Frequências das notas usadas (Hz). */
const NOTA = {
  F2: 87.31, G2: 98.0, A2: 110.0, C3: 130.81, E3: 164.81, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F3: 174.61, G4: 392.0,
};

/** Am – F – C – G, um acorde por compasso (4 batidas = 2 s). */
const ACORDES = [
  { baixo: NOTA.A2, notas: [NOTA.A3, NOTA.C4, NOTA.E4] },
  { baixo: NOTA.F2, notas: [NOTA.F3, NOTA.A3, NOTA.C4] },
  { baixo: NOTA.C3, notas: [NOTA.C4, NOTA.E4, NOTA.G4] },
  { baixo: NOTA.G2, notas: [NOTA.G3, NOTA.B3, NOTA.D4] },
];

/** Momentos que mudam o arranjo (em segundos do vídeo). */
const ARRANJO = {
  pad: 0.45,
  batida: INICIO_BATIDA,
  completo: 4.0,
  pausaLiquido: [16.8, 17.3],
  final: 22.35,
};

class Trilha {
  constructor(ctx, destino) {
    this.ctx = ctx;
    this.mestre = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.mestre.connect(comp);
    comp.connect(destino);

    // Música um pouco abaixo dos efeitos: os momentos-chave se destacam.
    this.musica = ctx.createGain();
    this.musica.gain.value = 0.5;
    this.musica.connect(this.mestre);
    this.efeitos = ctx.createGain();
    this.efeitos.gain.value = 0.85;
    this.efeitos.connect(this.mestre);

    const r = aleatorio(42);
    this.ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const dados = this.ruido.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = r() * 2 - 1;
  }

  agendar(eventos, t0) {
    this.t0 = t0;
    this.mestre.gain.setValueAtTime(1.1, t0);
    this.mestre.gain.setValueAtTime(1.1, t0 + DURACAO - 0.35);
    this.mestre.gain.linearRampToValueAtTime(0.0001, t0 + DURACAO);
    this.agendarMusica();
    for (const e of eventos) {
      const tocar = this[e.tipo];
      if (typeof tocar !== 'function') throw new Error(`Som desconhecido: ${e.tipo}`);
      tocar.call(this, t0 + e.t, e);
    }
  }

  // -------------------------------------------------------------------------
  // Blocos básicos

  envelope(ganho, t, pico, ataque, queda) {
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.linearRampToValueAtTime(pico, t + ataque);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + ataque + queda);
  }

  oscilador(tipo, freq, t, dur, saida) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    o.connect(g);
    g.connect(saida);
    o.start(t);
    o.stop(t + dur + 0.05);
    return { o, g };
  }

  ruidoFiltrado(t, dur, tipoFiltro, freq, saida, q = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.ruido;
    const f = this.ctx.createBiquadFilter();
    f.type = tipoFiltro;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    const g = this.ctx.createGain();
    s.connect(f);
    f.connect(g);
    g.connect(saida);
    // Começo do buffer varia com o tempo para os sons não soarem idênticos.
    s.start(t, (t * 7.31) % 1.5);
    s.stop(t + dur + 0.05);
    return { s, f, g };
  }

  // -------------------------------------------------------------------------
  // Instrumentos da música

  bumbo(t, forca = 1, saida = this.musica) {
    const { o, g } = this.oscilador('sine', 150, t, 0.4, saida);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    this.envelope(g, t, forca, 0.004, 0.34);
  }

  chimbal(t, vol = 0.16) {
    const { g } = this.ruidoFiltrado(t, 0.08, 'highpass', 7500, this.musica);
    this.envelope(g, t, vol, 0.002, 0.05);
  }

  palma(t) {
    const { g } = this.ruidoFiltrado(t, 0.25, 'bandpass', 1500, this.musica, 0.8);
    g.gain.setValueAtTime(0.0001, t);
    for (const d of [0, 0.012, 0.024]) {
      g.gain.linearRampToValueAtTime(0.45, t + d + 0.002);
      g.gain.linearRampToValueAtTime(0.1, t + d + 0.01);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  }

  baixo(t, freq, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(260, t + 0.2);
    const g = this.ctx.createGain();
    o.connect(f);
    f.connect(g);
    g.connect(this.musica);
    this.envelope(g, t, vol, 0.005, 0.22);
    o.start(t);
    o.stop(t + 0.3);
  }

  pad(t, notas, dur, vol = 0.045) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = this.ctx.createGain();
    f.connect(g);
    g.connect(this.musica);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.25);
    g.gain.setValueAtTime(vol, t + dur - 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
    for (const n of notas) {
      for (const desafino of [-8, 8]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = n;
        o.detune.value = desafino;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.4);
      }
    }
  }

  dedilhado(t, freq, vol = 0.1) {
    const a = this.oscilador('triangle', freq, t, 0.3, this.musica);
    this.envelope(a.g, t, vol, 0.003, 0.25);
    const b = this.oscilador('sine', freq * 2, t, 0.2, this.musica);
    this.envelope(b.g, t, vol * 0.4, 0.003, 0.15);
  }

  agendarMusica() {
    const t0 = this.t0;
    const acordeEm = (t) =>
      ACORDES[t < ARRANJO.batida ? 0 : Math.floor((t - ARRANJO.batida) / 2) % ACORDES.length];
    const naPausa = (t) => t >= ARRANJO.pausaLiquido[0] && t < ARRANJO.pausaLiquido[1];

    // Pad: sustenta a harmonia desde que a TV liga.
    this.pad(t0 + ARRANJO.pad, ACORDES[0].notas, ARRANJO.batida - ARRANJO.pad);
    for (let t = ARRANJO.batida; t < ARRANJO.final; t += 2) {
      this.pad(t0 + t, acordeEm(t).notas, Math.min(2, ARRANJO.final - t));
    }

    // Grade de colcheias (0,25 s) a partir da primeira batida.
    const arpejo = [0, 1, 2, 1, 0, 2, 1, 2];
    for (let i = 0; ; i++) {
      const t = ARRANJO.batida + i * (BATIDA / 2);
      if (t >= ARRANJO.final - 0.01) break;
      const acorde = acordeEm(t);
      const naBatida = i % 2 === 0;
      const completo = t >= ARRANJO.completo;
      if (naPausa(t)) {
        // Na onda líquida a batida some e só o arpejo segue: dá o "respiro".
        this.dedilhado(t0 + t, acorde.notas[arpejo[i % 8]] * 2, 0.06);
        continue;
      }
      if (naBatida) this.bumbo(t0 + t, completo ? 0.95 : 0.75);
      else this.chimbal(t0 + t);
      if (completo && t >= 10.5 && t < 16.8) this.chimbal(t0 + t + BATIDA / 4, 0.07);
      if (completo && naBatida && Math.round((t - ARRANJO.batida) / BATIDA) % 2 === 1) this.palma(t0 + t);
      const oitava = i % 4 === 2 ? 2 : 1;
      this.baixo(t0 + t, acorde.baixo * oitava, completo ? 0.3 : 0.2);
      if (completo) this.dedilhado(t0 + t, acorde.notas[arpejo[i % 8]] * 2, 0.08);
    }

    // Final: acorde aberto em dó maior com um arpejo lento por cima.
    const final = [NOTA.C3, NOTA.E3, NOTA.G3, NOTA.C4, NOTA.E4];
    this.pad(t0 + ARRANJO.final, final, DURACAO - ARRANJO.final, 0.05);
    [NOTA.C4, NOTA.E4, NOTA.G4, NOTA.C4 * 2, NOTA.G4, NOTA.E4 * 2].forEach((n, i) => {
      this.dedilhado(t0 + ARRANJO.final + 0.5 + i * BATIDA * 0.8, n * 2, 0.07);
    });
  }

  // -------------------------------------------------------------------------
  // Efeitos sonoros (os nomes batem com o campo `tipo` dos eventos das cenas)

  tic(t, e = {}) {
    const vol = 0.2 * (e.volume ?? 1);
    const alt = 1 + ((t * 13.7) % 1) * 0.25;
    const { o, g } = this.oscilador('sine', 2300 * alt, t, 0.08, this.efeitos);
    o.frequency.exponentialRampToValueAtTime(1300 * alt, t + 0.05);
    this.envelope(g, t, vol, 0.002, 0.07);
  }

  pop(t) {
    const { o, g } = this.oscilador('sine', 480, t, 0.18, this.efeitos);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.09);
    this.envelope(g, t, 0.35, 0.004, 0.15);
  }

  whoosh(t, e = {}) {
    const dur = e.duracao ?? 0.4;
    const { f, g } = this.ruidoFiltrado(t, dur, 'bandpass', 300, this.efeitos, 1.2);
    f.frequency.exponentialRampToValueAtTime(5000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  subida(t, e = {}) {
    const dur = e.duracao ?? 0.8;
    const { f, g } = this.ruidoFiltrado(t, dur, 'bandpass', 200, this.efeitos, 1.5);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.03);
    const { o, g: g2 } = this.oscilador('sawtooth', 110, t, dur, this.efeitos);
    o.frequency.exponentialRampToValueAtTime(880, t + dur);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.06, t + dur);
    g2.gain.linearRampToValueAtTime(0.0001, t + dur + 0.03);
  }

  ligar(t) {
    const { o, g } = this.oscilador('sine', 60, t, 0.35, this.efeitos);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    this.envelope(g, t, 0.3, 0.01, 0.3);
    const zap = this.oscilador('square', 1200, t + 0.12, 0.08, this.efeitos);
    this.envelope(zap.g, t + 0.12, 0.08, 0.002, 0.07);
    this.bumbo(t + 0.13, 0.9, this.efeitos);
  }

  impacto(t) {
    const { o, g } = this.oscilador('sine', 120, t, 0.9, this.efeitos);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    this.envelope(g, t, 1.2, 0.004, 0.8);
    const r = this.ruidoFiltrado(t, 0.5, 'lowpass', 900, this.efeitos);
    this.envelope(r.g, t, 0.6, 0.002, 0.4);
  }

  impactoLeve(t) {
    this.bumbo(t, 0.8, this.efeitos);
    const r = this.ruidoFiltrado(t, 0.3, 'lowpass', 1500, this.efeitos);
    this.envelope(r.g, t, 0.3, 0.002, 0.25);
  }

  brilho(t) {
    [2093, 2637, 3136, 4186, 5274].forEach((f, i) => {
      const { g } = this.oscilador('sine', f, t + i * 0.04, 0.7, this.efeitos);
      this.envelope(g, t + i * 0.04, 0.07, 0.005, 0.6);
    });
  }

  digital(t, e = {}) {
    const r = aleatorio(Math.floor(t * 1000));
    const dur = e.duracao ?? 0.5;
    for (let i = 0; i < 12; i++) {
      const ti = t + (i / 12) * dur;
      const { g } = this.oscilador('square', 1000 + r() * 2000, ti, 0.03, this.efeitos);
      this.envelope(g, ti, 0.04, 0.001, 0.025);
    }
  }

  clique(t) {
    const a = this.oscilador('square', 1800, t, 0.02, this.efeitos);
    this.envelope(a.g, t, 0.12, 0.001, 0.015);
    const b = this.oscilador('sine', 500, t, 0.08, this.efeitos);
    this.envelope(b.g, t, 0.4, 0.002, 0.06);
  }

  final(t) {
    this.brilho(t + 0.1);
  }
}
