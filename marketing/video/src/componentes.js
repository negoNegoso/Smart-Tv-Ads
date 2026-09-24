'use strict';
/**
 * Componentes visuais reaproveitados pelas cenas. Nenhum deles sabe em que
 * cena está: recebem tempo, posição e tamanho e desenham. As cenas só
 * combinam componentes e decidem o "quando".
 */

// ---------------------------------------------------------------------------
// Fundo: degradê preto → verde escuro, luzes desfocadas, partículas e granulado

class Fundo {
  constructor() {
    const r = aleatorio(7);
    this.manchas = [
      { cx: 0.18, cy: 0.22, raio: 950, vel: 0.05, fase: 0.0, cor: COR.verdeEscuro, a: 0.95 },
      { cx: 0.88, cy: 0.58, raio: 1050, vel: 0.04, fase: 2.1, cor: COR.verdeEscuro, a: 0.85 },
      { cx: 0.3, cy: 0.95, raio: 850, vel: 0.06, fase: 4.0, cor: COR.verdeEscuro, a: 0.8 },
      { cx: 0.72, cy: 0.12, raio: 520, vel: 0.07, fase: 1.3, cor: COR.verde, a: 0.1 },
      { cx: 0.2, cy: 0.7, raio: 420, vel: 0.08, fase: 5.2, cor: COR.verde, a: 0.07 },
    ];
    this.particulas = Array.from({ length: 28 }, () => ({
      x: r(),
      y: r(),
      raio: 3 + r() * 11,
      vel: 0.01 + r() * 0.025,
      fase: r() * Math.PI * 2,
      a: 0.15 + r() * 0.35,
    }));

    // Granulado pré-calculado: gerar ruído por quadro seria caro demais.
    const lado = 384;
    this.ruido = criarCanvas(lado, lado);
    const g = this.ruido.getContext('2d');
    const img = g.createImageData(lado, lado);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = r() * 255;
    }
    g.putImageData(img, 0, 0);
    this.ladoRuido = lado;
  }

  desenhar(ctx, t, intensidade = 1) {
    ctx.fillStyle = COR.preto;
    ctx.fillRect(0, 0, W, H);

    const pulso = pulsoBatida(t, 5);
    for (const m of this.manchas) {
      const x = m.cx * W + Math.sin(t * m.vel * Math.PI * 2 + m.fase) * 160;
      const y = m.cy * H + Math.cos(t * m.vel * Math.PI * 2 * 0.8 + m.fase) * 200;
      const g = ctx.createRadialGradient(x, y, 0, x, y, m.raio);
      g.addColorStop(0, rgba(m.cor, m.a * intensidade * (1 + 0.18 * pulso)));
      g.addColorStop(1, rgba(m.cor, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Partículas de luz subindo devagar, como poeira iluminada pela tela.
    for (const p of this.particulas) {
      const y = (((p.y - t * p.vel) % 1) + 1) % 1;
      const x = p.x * W + Math.sin(t * 0.6 + p.fase) * 30;
      const a = p.a * intensidade * (0.6 + 0.4 * Math.sin(t * 2 + p.fase));
      const g = ctx.createRadialGradient(x, y * H, 0, x, y * H, p.raio * 2.5);
      g.addColorStop(0, rgba(COR.verde, a));
      g.addColorStop(1, rgba(COR.verde, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - p.raio * 3, y * H - p.raio * 3, p.raio * 6, p.raio * 6);
    }

    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  /**
   * Vai por cima de tudo: textura que tira a cara de "digital liso". Muda a
   * cada 3 quadros (10 por segundo, como grão de filme): trocar em todo
   * quadro multiplica o tamanho do MP4 sem diferença visível.
   */
  granulado(ctx, t) {
    const r = aleatorio(Math.floor((t * FPS) / 3) + 1);
    const ox = Math.floor(r() * this.ladoRuido);
    const oy = Math.floor(r() * this.ladoRuido);
    this.padrao ??= ctx.createPattern(this.ruido, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = this.padrao;
    ctx.fillRect(ox, oy, W, H);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Loja desfocada atrás da TV (cena de abertura)

class Loja {
  constructor() {
    const nitida = criarCanvas(W, H);
    const g = nitida.getContext('2d');
    const r = aleatorio(21);

    const parede = g.createLinearGradient(0, 0, 0, H);
    parede.addColorStop(0, COR.verdeProfundo);
    parede.addColorStop(0.7, '#020d0b');
    parede.addColorStop(1, COR.preto);
    g.fillStyle = parede;
    g.fillRect(0, 0, W, H);

    // Spots do teto.
    for (const x of [180, 540, 900]) {
      const s = g.createRadialGradient(x, 0, 0, x, 0, 420);
      s.addColorStop(0, rgba(COR.verde, 0.22));
      s.addColorStop(1, rgba(COR.verde, 0));
      g.fillStyle = s;
      g.fillRect(0, 0, W, 500);
    }

    // Prateleiras com produtos nas laterais.
    const tons = ['#0B3D33', '#0f4a3e', '#145c4d', '#1b7563', 'rgba(255,255,255,0.18)'];
    for (const [x0, x1] of [[0, 250], [830, W]]) {
      for (let y = 330; y < 1500; y += 210) {
        let x = x0 + 8;
        while (x < x1 - 30) {
          const w = 30 + r() * 45;
          const h = 60 + r() * 110;
          g.fillStyle = tons[Math.floor(r() * tons.length)];
          g.fillRect(x, y - h, Math.min(w, x1 - x - 8), h);
          x += w + 6;
        }
        g.fillStyle = '#123f36';
        g.fillRect(x0, y, x1 - x0, 16);
      }
    }

    // Balcão em primeiro plano.
    const balcao = g.createLinearGradient(0, 1480, 0, H);
    balcao.addColorStop(0, '#0d3a31');
    balcao.addColorStop(1, COR.preto);
    g.fillStyle = balcao;
    g.fillRect(0, 1480, W, H - 1480);
    g.fillStyle = rgba(COR.verde, 0.3);
    g.fillRect(0, 1480, W, 4);

    // O desfoque é feito uma vez só; por quadro é só um drawImage.
    this.imagem = criarCanvas(W, H);
    const b = this.imagem.getContext('2d');
    b.filter = 'blur(10px)';
    b.drawImage(nitida, 0, 0);
  }

  desenhar(ctx, alpha, escala = 1) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(W / 2, H / 2);
    ctx.scale(escala, escala);
    ctx.drawImage(this.imagem, -W / 2, -H / 2);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Ícone da tela em perspectiva (o mesmo desenho da logo), usado como TV e
// como o elemento que acompanha o vídeo todo.

const IconeTela = {
  /** Cantos normalizados: o lado esquerdo é mais baixo, como na logo. */
  cantos(w, h) {
    return [
      [-w / 2, -h / 2 + h * 0.19],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2 - h * 0.15],
    ];
  },

  tracar(ctx, pts, raio) {
    const n = pts.length;
    const meio = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
    ctx.beginPath();
    ctx.moveTo(meio[0], meio[1]);
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      ctx.arcTo(a[0], a[1], b[0], b[1], raio);
    }
    ctx.closePath();
  },

  /**
   * @param o {x, y, w, proporcao, rot, alpha, brilho, play, cor, espessura, interior(ctx, w, h)}
   *   interior desenha o conteúdo da tela já recortado pela moldura.
   */
  desenhar(ctx, o) {
    const w = o.w;
    const h = w * (o.proporcao ?? 0.92);
    const esp = w * (o.espessura ?? 0.075);
    const pts = this.cantos(w, h);
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.translate(o.x, o.y);
    ctx.rotate(((o.rot ?? 0) * Math.PI) / 180);

    if (o.interior) {
      const fx = 1 - (esp * 1.2) / w;
      const fy = 1 - (esp * 1.2) / h;
      ctx.save();
      this.tracar(ctx, pts.map(([x, y]) => [x * fx, y * fy]), w * 0.05);
      ctx.clip();
      o.interior(ctx, w, h);
      ctx.restore();
    }

    const cor = o.cor ?? COR.verde;
    ctx.lineWidth = esp;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cor;
    ctx.shadowColor = o.cor ? 'rgba(0,0,0,0)' : rgba(COR.verde, 0.85);
    ctx.shadowBlur = 30 * (o.brilho ?? 1);
    this.tracar(ctx, pts, w * 0.09);
    ctx.stroke();

    if (o.play !== false) {
      const s = w * 0.23;
      ctx.beginPath();
      ctx.moveTo(w * 0.06 - s * 0.38, -s * 0.47);
      ctx.lineTo(w * 0.06 + s * 0.52, 0);
      ctx.lineTo(w * 0.06 - s * 0.38, s * 0.47);
      ctx.closePath();
      ctx.fillStyle = COR.verde;
      ctx.lineWidth = w * 0.05;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  },
};

/**
 * O elemento que acompanha o vídeo: o ícone da tela viajando entre as cenas
 * por quadros-chave, com rastro de luz quando se move rápido.
 */
class Companheiro {
  constructor(chaves) {
    this.chaves = chaves;
  }

  estado(t) {
    return interpolarChaves(this.chaves, t);
  }

  desenhar(ctx, t) {
    const e = this.estado(t);
    if (e.a <= 0.01) return;
    const pulso = pulsoBatida(t);

    // Rastro: cópias apagadas das posições anteriores.
    for (let k = 3; k >= 1; k--) {
      const antes = this.estado(t - k * 0.04);
      const distancia = Math.hypot(antes.x - e.x, antes.y - e.y);
      if (distancia < 6) continue;
      IconeTela.desenhar(ctx, { ...antes, alpha: antes.a * (0.22 / k), brilho: 0.5 });
    }

    const flutua = Math.sin(t * 2.4) * 8;
    IconeTela.desenhar(ctx, {
      x: e.x,
      y: e.y + flutua,
      w: e.w * (1 + 0.05 * pulso),
      rot: e.rot + Math.sin(t * 1.7) * 2,
      alpha: e.a,
      brilho: 0.8 + pulso * 0.8,
    });
  }
}

// ---------------------------------------------------------------------------
// Texto que entra palavra por palavra, com palavras em destaque

class TextoAnimado {
  /**
   * @param o {texto, x, y, tamanho, inicio, intervalo, larguraMax, destaque,
   *           cor, alinhamento, entrelinha, som}
   *   y é o centro vertical do bloco; destaque lista palavras em verde.
   */
  constructor(o) {
    this.o = {
      larguraMax: 900,
      intervalo: 0.18,
      duracao: 0.45,
      destaque: [],
      cor: COR.branco,
      alinhamento: 'center',
      entrelinha: 1.12,
      som: true,
      ...o,
    };
    this.palavras = null;
  }

  static normalizar(p) {
    return p.toLowerCase().replace(/[.,!?:;“”"]/g, '');
  }

  /** O layout depende da fonte carregada, então é feito no primeiro desenho. */
  montar(ctx) {
    const o = this.o;
    ctx.font = fonte(o.tamanho);
    // O espaço da Outfit é estreito e as palavras entram crescendo: um
    // respiro maior evita que encostem durante a animação.
    const espaco = Math.max(ctx.measureText(' ').width, o.tamanho * 0.3);
    const linhas = [[]];
    let largura = 0;
    for (const txt of o.texto.split(' ')) {
      const w = ctx.measureText(txt).width;
      const atual = linhas[linhas.length - 1];
      if (atual.length && largura + espaco + w > o.larguraMax) {
        linhas.push([]);
        largura = 0;
      }
      const linha = linhas[linhas.length - 1];
      largura += (linha.length ? espaco : 0) + w;
      linha.push({ txt, w });
    }

    const alturaLinha = o.tamanho * o.entrelinha;
    this.palavras = [];
    linhas.forEach((linha, i) => {
      const total = linha.reduce((s, p) => s + p.w, 0) + espaco * (linha.length - 1);
      let x = o.alinhamento === 'center' ? o.x - total / 2 : o.x;
      const y = o.y - ((linhas.length - 1) * alturaLinha) / 2 + i * alturaLinha;
      for (const p of linha) {
        const destaque = o.destaque.includes(TextoAnimado.normalizar(p.txt));
        this.palavras.push({ ...p, x, y, destaque });
        x += p.w + espaco;
      }
    });
  }

  /** Momentos em que cada palavra entra, para a trilha tocar o "tic". */
  horarios() {
    if (!this.o.som) return [];
    return this.o.texto.split(' ').map((_, i) => this.o.inicio + i * this.o.intervalo);
  }

  desenhar(ctx, t, alpha = 1) {
    if (alpha <= 0) return;
    if (!this.palavras) this.montar(ctx);
    const o = this.o;
    ctx.save();
    ctx.font = fonte(o.tamanho);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.palavras.forEach((p, i) => {
      const inicio = o.inicio + i * o.intervalo;
      const k = prog(t, inicio, inicio + o.duracao);
      if (k <= 0) return;
      const e = Ease.outBack(k, 2.2);
      const cx = p.x + p.w / 2;
      const dy = (1 - Ease.outCubic(k)) * 60;
      ctx.save();
      ctx.globalAlpha *= alpha * Ease.outCubic(Math.min(1, k * 1.8));
      ctx.translate(cx, p.y + dy);
      let escala = 0.55 + 0.45 * e;
      let brilho = 0;
      if (p.destaque) {
        // Destaque: brilho forte ao entrar e respiração no ritmo depois.
        const flash = Math.exp(-Math.max(0, t - inicio - 0.2) * 3);
        brilho = 0.55 + 0.35 * pulsoBatida(t) + flash * 0.6;
        escala *= 1 + 0.05 * flash;
      }
      ctx.scale(escala, escala);
      textoComBrilho(ctx, p.txt, 0, 0, p.destaque ? COR.verde : o.cor, brilho);
      ctx.restore();
    });
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// QR code real (abre o WhatsApp) que surge módulo a módulo

const QrCode = {
  atrasos: null,

  desenhar(ctx, x, y, tamanho, revelar, alpha = 1) {
    if (revelar <= 0 || alpha <= 0) return;
    const n = QR_WHATSAPP.length;
    const margem = 3;
    const m = tamanho / (n + margem * 2);
    if (!this.atrasos) {
      const r = aleatorio(99);
      this.atrasos = QR_WHATSAPP.map((linha) => [...linha].map(() => r()));
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x - tamanho / 2, y - tamanho / 2);
    const cartao = Ease.outBack(clamp(revelar * 2.5));
    ctx.translate(tamanho / 2, tamanho / 2);
    ctx.scale(cartao, cartao);
    ctx.translate(-tamanho / 2, -tamanho / 2);
    ctx.fillStyle = COR.branco;
    ctx.shadowColor = rgba(COR.verde, 0.7);
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.roundRect(0, 0, tamanho, tamanho, m * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = COR.preto;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (QR_WHATSAPP[i][j] !== '1') continue;
        if (this.atrasos[i][j] * 0.6 + 0.35 > revelar) continue;
        ctx.fillRect((j + margem) * m, (i + margem) * m, m + 0.6, m + 0.6);
      }
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------
// Peças menores

/** Faísca de partículas saindo de um ponto (preço, "grátis", clique). */
function explosao(ctx, t, t0, x, y, { quantidade = 26, raio = 360, semente = 1 } = {}) {
  const k = prog(t, t0, t0 + 0.9);
  if (k <= 0 || k >= 1) return;
  const r = aleatorio(semente);
  const base = ctx.globalAlpha;
  ctx.save();
  for (let i = 0; i < quantidade; i++) {
    const ang = r() * Math.PI * 2;
    const dist = raio * (0.4 + r() * 0.6) * Ease.outExpo(k);
    const tam = 3 + r() * 7;
    ctx.globalAlpha = base * (1 - k) * (0.5 + r() * 0.5);
    ctx.fillStyle = r() > 0.3 ? COR.verde : COR.branco;
    ctx.beginPath();
    ctx.arc(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, tam * (1 - k * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Onda de choque: anel verde que se expande e some. */
function ondaChoque(ctx, t, t0, x, y, raioFinal = 700) {
  const k = prog(t, t0, t0 + 0.7);
  if (k <= 0 || k >= 1) return;
  ctx.save();
  ctx.strokeStyle = rgba(COR.verde, (1 - k) * 0.8);
  ctx.lineWidth = 14 * (1 - k) + 2;
  ctx.shadowColor = COR.verde;
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(x, y, raioFinal * Ease.outCubic(k), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Pílula com borda verde, usada em etiquetas e no balão de mensagem. */
function pilula(ctx, x, y, w, h, { preenchimento = 0.12, borda = 4, raio = h / 2 } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, raio);
  ctx.fillStyle = rgba(COR.verde, preenchimento);
  ctx.fill();
  if (borda > 0) {
    ctx.strokeStyle = COR.verde;
    ctx.lineWidth = borda;
    ctx.shadowColor = rgba(COR.verde, 0.6);
    ctx.shadowBlur = 20;
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Transições: nenhuma troca de cena é seca

const Transicao = {
  /** Clarão de luz verde com um feixe diagonal atravessando a tela. */
  luz(ctx, t, t0, { duracao = 0.55, forca = 0.6 } = {}) {
    const k = prog(t, t0 - duracao / 2, t0 + duracao / 2);
    if (k <= 0 || k >= 1) return;
    const a = Math.sin(k * Math.PI) * forca;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.7);
    g.addColorStop(0, rgba(COR.verde, a));
    g.addColorStop(0.5, rgba(COR.verdeEscuro, a * 0.8));
    g.addColorStop(1, rgba(COR.verdeEscuro, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.5);
    const x = lerp(-1400, 1400, Ease.inOutCubic(k));
    const feixe = ctx.createLinearGradient(x - 260, 0, x + 260, 0);
    feixe.addColorStop(0, 'rgba(255,255,255,0)');
    feixe.addColorStop(0.5, `rgba(255,255,255,${a * 0.55})`);
    feixe.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = feixe;
    ctx.fillRect(x - 260, -1600, 520, 3200);
    ctx.restore();
  },

  /** Onda líquida verde que sobe, cobre a tela e sai por cima. */
  liquido(ctx, t, t0, duracao = 1.0) {
    const k1 = Ease.inOutCubic(prog(t, t0, t0 + duracao * 0.55));
    const k2 = Ease.inOutCubic(prog(t, t0 + duracao * 0.35, t0 + duracao));
    if (k1 <= 0 || k2 >= 1) return;
    const topo = lerp(H + 150, -250, k1);
    const base = lerp(H + 150, -250, k2);
    const onda = (y, fase) => (x) =>
      y + Math.sin(x / 140 + t * 9 + fase) * 45 + Math.sin(x / 63 + t * 5 + fase) * 18;
    const bordaTopo = onda(topo, 0);
    const bordaBase = onda(base, 2);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, bordaTopo(0));
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, bordaTopo(x));
    for (let x = W; x >= 0; x -= 20) ctx.lineTo(x, bordaBase(x));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, topo, 0, base);
    g.addColorStop(0, COR.verde);
    g.addColorStop(1, COR.verdeEscuro);
    ctx.fillStyle = g;
    ctx.shadowColor = COR.verde;
    ctx.shadowBlur = 60;
    ctx.fill();
    ctx.restore();
  },
};
