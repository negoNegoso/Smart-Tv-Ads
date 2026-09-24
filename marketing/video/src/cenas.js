'use strict';
/**
 * As cenas do roteiro. Cada cena sabe seu intervalo de tempo, desenha o
 * próprio conteúdo e declara os sons que dispara, para imagem e trilha
 * nunca saírem de sincronia.
 */

class Cena {
  /**
   * @param o {inicio, fim, entrada, saida, zoomEntrada, zoomSaida}
   *   Entrada e saída sempre com zoom e fade: nada de corte seco.
   */
  constructor(o) {
    this.inicio = o.inicio;
    this.fim = o.fim;
    this.entrada = o.entrada ?? 0.4;
    this.saida = o.saida ?? 0.35;
    this.zoomEntrada = o.zoomEntrada ?? 0.9;
    this.zoomSaida = o.zoomSaida ?? 1.12;
    this.textos = [];
    this.efeitos = [];
  }

  ativa(t) {
    return t >= this.inicio && t <= this.fim;
  }

  desenhar(ctx, t) {
    const ke = Ease.outCubic(prog(t, this.inicio, this.inicio + this.entrada));
    const ks = Ease.inCubic(prog(t, this.fim - this.saida, this.fim));
    const alpha = ke * (1 - ks);
    if (alpha <= 0) return;
    const escala = lerp(this.zoomEntrada, 1, ke) * lerp(1, this.zoomSaida, ks);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(W / 2, H / 2);
    ctx.scale(escala, escala);
    ctx.translate(-W / 2, -H / 2);
    this.conteudo(ctx, t);
    ctx.restore();
  }

  texto(o) {
    const tx = new TextoAnimado(o);
    this.textos.push(tx);
    return tx;
  }

  /** Sons da cena: um "tic" por palavra e os efeitos declarados. */
  sons() {
    const tics = this.textos.flatMap((tx) => tx.horarios().map((t) => ({ t, tipo: 'tic' })));
    return [...tics, ...this.efeitos];
  }
}

// ---------------------------------------------------------------------------
// Cenas 1 e 2 — a TV acende na loja e a frase fisga (0 a 4,3s)

class CenaAbertura extends Cena {
  constructor(loja) {
    super({ inicio: 0, fim: 4.35, entrada: 0.01 });
    this.loja = loja;
    this.frase = this.texto({
      texto: 'seu cliente está olhando pra uma tela agora.',
      x: 540,
      y: 1340,
      tamanho: 104,
      inicio: 1.75,
      intervalo: 0.22,
      destaque: ['tela'],
    });
    this.efeitos = [
      { t: 0, tipo: 'subida', duracao: 0.45 },
      { t: 0.33, tipo: 'ligar' },
      { t: 0.65, tipo: 'tic' },
      { t: 0.85, tipo: 'tic' },
      { t: 1.0, tipo: 'digital', duracao: 0.5 },
      { t: 3.85, tipo: 'whoosh', duracao: 0.5 },
    ];
  }

  tv(t) {
    return { x: 540, y: lerp(800, 640, Ease.inOutCubic(prog(t, 1.3, 2.1))), w: 880 };
  }

  /** Saída especial: a câmera mergulha na tela da TV. */
  desenhar(ctx, t) {
    const ks = Ease.inCubic(prog(t, 3.85, 4.35));
    if (ks >= 1) return;
    const tv = this.tv(t);
    const empurrar = lerp(1, 1.05, Ease.inOutSine(prog(t, 1.5, 3.9)));
    const escala = empurrar * (1 + ks * 3.5);
    ctx.save();
    ctx.globalAlpha *= 1 - ks;
    ctx.translate(tv.x, tv.y);
    ctx.scale(escala, escala);
    ctx.translate(-tv.x, -tv.y);
    this.conteudo(ctx, t);
    ctx.restore();
  }

  conteudo(ctx, t) {
    const ligada = prog(t, 0.35, 0.6);
    this.loja.desenhar(ctx, prog(t, 0.3, 0.9) * 0.9, lerp(1.06, 1, Ease.outCubic(prog(t, 0, 2))));

    const tv = this.tv(t);
    if (ligada > 0) {
      // Luz da tela espalhando na parede e refletindo no balcão.
      const a = 0.35 * ligada * (1 + 0.25 * pulsoBatida(t));
      const g = ctx.createRadialGradient(tv.x, tv.y, 0, tv.x, tv.y, 760);
      g.addColorStop(0, rgba(COR.verde, a));
      g.addColorStop(1, rgba(COR.verde, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    IconeTela.desenhar(ctx, {
      ...tv,
      proporcao: 0.66,
      espessura: 0.035,
      play: false,
      alpha: lerp(0.3, 1, prog(t, 0, 0.45)),
      brilho: 0.3 + ligada * (1 + pulsoBatida(t)),
      interior: (c, w, h) => this.telaDaTv(c, t, w, h),
    });

    this.frase.desenhar(ctx, t);
  }

  /** O que passa dentro da TV: "sua marca aqui" piscando e o QR code. */
  telaDaTv(ctx, t, w, h) {
    ctx.fillStyle = COR.preto;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    if (t < 0.3) return;

    // Liga como TV antiga: uma linha que abre na vertical.
    const abre = Ease.outExpo(prog(t, 0.3, 0.6));
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, (-h / 2) * abre - 3, w, h * abre + 6);
    ctx.clip();

    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, COR.verdeEscuro);
    g.addColorStop(1, COR.preto);
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Faixas de luz diagonais correndo pela tela.
    ctx.save();
    ctx.rotate(-0.6);
    for (let i = 0; i < 3; i++) {
      const x = ((t * 260 + i * 420) % 1260) - 630;
      ctx.fillStyle = rgba(COR.verde, 0.07);
      ctx.fillRect(x, -700, 120, 1400);
    }
    ctx.restore();

    const bloco = { x: -w * 0.17, y: 0 };
    const borda = prog(t, 0.7, 1.0);
    if (borda > 0) {
      ctx.save();
      ctx.globalAlpha *= borda;
      ctx.setLineDash([22, 14]);
      ctx.lineDashOffset = -t * 70;
      ctx.strokeStyle = rgba(COR.verde, 0.85);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(bloco.x - 200, bloco.y - 120, 400, 240, 26);
      ctx.stroke();
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pop = (inicio, tamanho, texto, cor, y, alpha = 1) => {
      const k = prog(t, inicio, inicio + 0.4);
      if (k <= 0) return;
      ctx.save();
      ctx.globalAlpha *= Ease.outCubic(k) * alpha;
      ctx.translate(bloco.x, y);
      const e = Ease.outBack(k, 2.4);
      ctx.scale(e, e);
      ctx.font = fonte(tamanho);
      textoComBrilho(ctx, texto, 0, 0, cor, cor === COR.verde ? 0.9 : 0);
      ctx.restore();
    };
    pop(0.62, 76, 'sua marca', COR.branco, -45);
    // "aqui" pisca no ritmo, pedindo para ser ocupado.
    const pisca = t < 1.2 ? 1 : 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(((t - 1.2) * Math.PI * 2) / BATIDA));
    pop(0.82, 116, 'aqui', COR.verde, 50, pisca);

    QrCode.desenhar(ctx, w * 0.25, 8, 210, prog(t, 1.0, 1.5));

    // Clarão branco-esverdeado do instante em que liga.
    const clarao = 1 - prog(t, 0.4, 0.75);
    if (clarao > 0) {
      ctx.fillStyle = `rgba(220,255,245,${clarao * 0.9})`;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Cena 3 — o que é: telas no comércio de 24 cidades (4 a 7s)

class CenaRede extends Cena {
  constructor() {
    super({ inicio: 3.95, fim: 7.2, entrada: 0.45, zoomEntrada: 0.7 });
    this.frase = this.texto({
      texto: 'anuncie nas telas do comércio da região.',
      x: 540,
      y: 690,
      tamanho: 100,
      inicio: 4.3,
      intervalo: 0.2,
      destaque: ['telas'],
    });
    this.pontos = CenaRede.gerarPontos();
    this.acende = 5.15;
    this.efeitos = [
      { t: 5.15, tipo: 'brilho' },
      ...this.pontos.map((_, i) => ({ t: this.acende + i * 0.05, tipo: 'tic', volume: 0.35 })),
      { t: 6.85, tipo: 'whoosh', duracao: 0.4 },
    ];
  }

  /** 24 pontos espalhados numa mancha orgânica, como cidades num mapa. */
  static gerarPontos() {
    const r = aleatorio(5);
    const pontos = [];
    let tentativas = 0;
    while (pontos.length < 24 && tentativas++ < 5000) {
      const ang = r() * Math.PI * 2;
      const dist = Math.sqrt(r());
      const deforma = 1 + 0.18 * Math.sin(ang * 3 + 1);
      const x = 540 + Math.cos(ang) * 390 * dist * deforma;
      const y = 1110 + Math.sin(ang) * 190 * dist * deforma;
      if (pontos.every((p) => Math.hypot(p.x - x, p.y - y) > 78)) pontos.push({ x, y });
    }
    pontos.sort((a, b) => a.x - b.x);
    // Cada ponto liga aos dois vizinhos mais próximos: vira uma rede.
    for (const p of pontos) {
      p.vizinhos = pontos
        .filter((q) => q !== p)
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
        .slice(0, 2);
    }
    return pontos;
  }

  conteudo(ctx, t) {
    this.frase.desenhar(ctx, t);

    const mapa = prog(t, 4.9, 5.3);
    if (mapa <= 0) return;
    ctx.save();
    ctx.globalAlpha *= mapa;
    const base = ctx.createRadialGradient(540, 1110, 0, 540, 1110, 480);
    base.addColorStop(0, rgba(COR.verdeEscuro, 0.9));
    base.addColorStop(1, rgba(COR.verdeEscuro, 0));
    ctx.fillStyle = base;
    ctx.fillRect(0, 800, W, 640);

    const aceso = (i) => prog(t, this.acende + i * 0.05, this.acende + i * 0.05 + 0.3);
    const indice = new Map(this.pontos.map((p, i) => [p, i]));
    ctx.lineWidth = 3;
    for (const [i, p] of this.pontos.entries()) {
      for (const q of p.vizinhos) {
        const k = Math.min(aceso(i), aceso(indice.get(q)));
        if (k <= 0) continue;
        ctx.strokeStyle = rgba(COR.verde, 0.35 * k);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(lerp(p.x, q.x, k), lerp(p.y, q.y, k));
        ctx.stroke();
      }
    }
    const pulso = pulsoBatida(t);
    for (const [i, p] of this.pontos.entries()) {
      const k = aceso(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + 5 * k + 2 * pulso * k, 0, Math.PI * 2);
      ctx.fillStyle = k > 0 ? COR.verde : 'rgba(255,255,255,0.18)';
      ctx.shadowColor = COR.verde;
      ctx.shadowBlur = 20 * k;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (k > 0 && k < 1) {
        ctx.strokeStyle = rgba(COR.verde, 1 - k);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10 + 40 * k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Contador "24 cidades" acompanha as luzes acendendo.
    const contador = prog(t, 5.05, 5.4);
    if (contador <= 0) return;
    const n = Math.round(24 * Ease.outCubic(prog(t, this.acende, this.acende + 1.2)));
    ctx.save();
    ctx.globalAlpha *= Ease.outCubic(contador);
    ctx.translate(540, 1440 + (1 - Ease.outCubic(contador)) * 40);
    ctx.textBaseline = 'middle';
    ctx.font = fonte(112);
    const numero = String(n).padStart(2, '0');
    const wNum = ctx.measureText('24').width;
    const wTxt = ctx.measureText(' cidades').width;
    const x0 = -(wNum + wTxt) / 2;
    ctx.textAlign = 'right';
    textoComBrilho(ctx, numero, x0 + wNum, 0, COR.verde, 0.7 + pulso * 0.3);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.branco;
    ctx.fillText(' cidades', x0 + wNum, 0);
    ctx.font = fonte(56);
    ctx.textAlign = 'center';
    ctx.globalAlpha *= 0.88 * prog(t, 5.5, 5.9);
    ctx.fillText('do vale do ribeira', 0, 100);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Cena 4 — o preço bate na tela (7 a 10,5s)

class CenaPreco extends Cena {
  constructor() {
    super({ inicio: 6.95, fim: 10.7 });
    this.batida = 7.2;
    this.linha = this.texto({
      texto: 'sua marca em todas as telas da rede',
      x: 540,
      y: 1080,
      tamanho: 66,
      larguraMax: 880,
      inicio: 7.75,
      intervalo: 0.13,
      destaque: ['todas'],
    });
    this.economia = this.texto({
      texto: 'economia de r$ 360 no ano',
      x: 540,
      y: 1440,
      tamanho: 44,
      inicio: 9.4,
      intervalo: 0.05,
      destaque: ['r$', '360'],
      som: false,
    });
    this.efeitos = [
      { t: this.batida, tipo: 'impacto' },
      { t: 9.1, tipo: 'pop' },
      { t: 10.4, tipo: 'whoosh', duracao: 0.4 },
    ];
  }

  conteudo(ctx, t) {
    const k = prog(t, this.batida, this.batida + 0.28);
    // Tremida da câmera logo depois da batida do preço.
    const dt = t - this.batida - 0.2;
    const tremor = dt > 0 ? Math.exp(-dt * 9) * 16 : 0;
    ctx.save();
    ctx.translate(Math.sin(t * 95) * tremor, Math.cos(t * 83) * tremor);

    ondaChoque(ctx, t, this.batida + 0.2, 540, 820, 760);
    explosao(ctx, t, this.batida + 0.2, 540, 820, { quantidade: 34, raio: 520, semente: 3 });

    if (k > 0) {
      ctx.save();
      ctx.globalAlpha *= Ease.outCubic(Math.min(1, k * 2));
      ctx.translate(540, 820);
      const escala = lerp(2.4, 1, Ease.outBack(k, 1.4));
      ctx.scale(escala, escala);
      this.desenharPreco(ctx, t);
      ctx.restore();
    }
    ctx.restore();

    this.linha.desenhar(ctx, t);

    const tag = prog(t, 9.1, 9.5);
    if (tag > 0) {
      const e = Ease.outBack(tag, 1.8);
      ctx.save();
      ctx.globalAlpha *= Ease.outCubic(tag);
      ctx.translate(540, 1310 + (1 - Ease.outCubic(tag)) * 80);
      ctx.scale(lerp(0.8, 1, e), lerp(0.8, 1, e));
      pilula(ctx, 0, 0, 920, 132, { preenchimento: 0.12 + 0.08 * pulsoBatida(t) });
      ctx.font = fonte(52);
      ctx.textBaseline = 'middle';
      const a = 'no plano anual sai por ';
      const b = 'r$ 120/mês';
      const wa = ctx.measureText(a).width;
      const wb = ctx.measureText(b).width;
      ctx.textAlign = 'left';
      ctx.fillStyle = COR.branco;
      ctx.fillText(a, -(wa + wb) / 2, 2);
      textoComBrilho(ctx, b, -(wa + wb) / 2 + wa, 2, COR.verde, 0.6);
      ctx.restore();
    }
    this.economia.desenhar(ctx, t, 0.85);
  }

  /** "r$ 150/mês": r$ pequeno em cima, 150 gigante, /mês na linha de base. */
  desenharPreco(ctx, t) {
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = fonte(110);
    const wr = ctx.measureText('r$').width;
    ctx.font = fonte(290);
    const wn = ctx.measureText('150').width;
    ctx.font = fonte(84);
    const wm = ctx.measureText('/mês').width;
    const total = wr + 16 + wn + 10 + wm;
    let x = -total / 2;
    const base = 100;
    const brilho = 0.8 + 0.4 * pulsoBatida(t);

    ctx.font = fonte(110);
    textoComBrilho(ctx, 'r$', x, base - 150, COR.verde, brilho * 0.7);
    x += wr + 16;
    ctx.font = fonte(290);
    textoComBrilho(ctx, '150', x, base, COR.verde, brilho);
    x += wn + 10;
    ctx.font = fonte(84);
    textoComBrilho(ctx, '/mês', x, base, COR.branco, 0);
  }
}

// ---------------------------------------------------------------------------
// Cena 5 — os 4 diferenciais, um a cada 1,6s (10,5 a 17s)

class CenaDiferenciais extends Cena {
  constructor() {
    super({ inicio: 10.45, fim: 17.3, saida: 0.2 });
    this.primeiro = 10.65;
    this.passo = 1.6;
    const itens = [
      ['qr code que prova o resultado', 'as leituras são contadas de verdade', 'qr'],
      ['concorrente não divide a tela', 'o mesmo ramo é bloqueado automaticamente', 'concorrente'],
      ['você escolhe o alvo', 'toda a rede, um ramo ou telas escolhidas', 'alvo'],
      ['relatório por anúncio', 'exibições e leituras, peça a peça', 'relatorio'],
    ];
    this.cards = itens.map(([titulo, sub, icone], i) => {
      const ini = this.primeiro + i * this.passo;
      return {
        ini,
        icone,
        // Cada card fica só 1,6 s: o texto precisa estar inteiro cedo para dar
        // tempo de ler, então as palavras entram mais rápido que no resto.
        titulo: this.texto({
          texto: titulo, x: 540, y: 1235, tamanho: 84, larguraMax: 860,
          inicio: ini + 0.08, intervalo: 0.05, duracao: 0.35,
        }),
        sub: this.texto({
          texto: sub, x: 540, y: 1420, tamanho: 44, larguraMax: 860,
          inicio: ini + 0.25, intervalo: 0.02, duracao: 0.3, som: false,
        }),
      };
    });
    this.efeitos = [
      ...this.cards.slice(1).map((c) => ({ t: c.ini - 0.1, tipo: 'whoosh', duracao: 0.3 })),
      { t: this.primeiro + 0.45, tipo: 'pop' },
      { t: this.cards[1].ini + 0.45, tipo: 'impactoLeve' },
      ...[0.35, 0.5, 0.65, 0.8].map((d) => ({ t: this.cards[2].ini + d, tipo: 'tic', volume: 0.6 })),
      { t: this.cards[3].ini + 0.2, tipo: 'brilho' },
    ];
  }

  conteudo(ctx, t) {
    const atual = clamp(Math.floor((t - this.primeiro) / this.passo), 0, 3);

    // Cabeçalho com a posição (1 de 4) em pílulas.
    const cab = Ease.outCubic(prog(t, 10.6, 10.95));
    ctx.save();
    ctx.globalAlpha *= cab;
    ctx.font = fonte(44);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    textoComBrilho(ctx, 'por que funciona', 540, 355, COR.verde, 0.4);
    for (let i = 0; i < 4; i++) {
      const ativo = i === atual;
      const w = ativo ? 60 : 16;
      ctx.fillStyle = ativo ? COR.verde : 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.roundRect(540 - 84 + i * 46 + (ativo ? -22 : 0), 418, w, 16, 8);
      ctx.fill();
    }
    ctx.restore();

    this.cards.forEach((card, i) => {
      const p = t - card.ini;
      if (p < 0 || (i < 3 && p > this.passo)) return;
      const entra = Ease.outCubic(prog(p, 0, 0.4));
      const sai = i < 3 ? Ease.inCubic(prog(p, this.passo - 0.3, this.passo)) : 0;
      const alpha = entra * (1 - sai);
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate((1 - entra) * 380 - sai * 380, 0);

      ctx.save();
      ctx.translate(540, 800);
      const escala = lerp(0.85, 1, Ease.outBack(prog(p, 0, 0.45)));
      ctx.scale(escala, escala);
      this[`icone_${card.icone}`](ctx, p, t);
      ctx.restore();

      ctx.font = fonte(54);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      textoComBrilho(ctx, `0${i + 1}`, 540, 1105, COR.verde, 0.5);
      card.titulo.desenhar(ctx, t);
      card.sub.desenhar(ctx, t, 0.8);
      ctx.restore();
    });

    const rodape = prog(t, 11.0, 11.5);
    if (rodape > 0) {
      ctx.save();
      ctx.globalAlpha *= 0.75 * Ease.outCubic(rodape);
      ctx.font = fonte(38);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COR.branco;
      ctx.fillText('até 3 artes  ·  troca livre  ·  a gente publica pra você', 540, 1590);
      ctx.restore();
    }
  }

  icone_qr(ctx, p) {
    QrCode.desenhar(ctx, -60, 0, 330, prog(p, 0, 0.45));
    const scan = prog(p, 0.3, 1.6);
    if (scan > 0) {
      const y = Math.sin(scan * Math.PI * 3) * 150;
      ctx.save();
      ctx.strokeStyle = COR.verde;
      ctx.lineWidth = 6;
      ctx.shadowColor = COR.verde;
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.moveTo(-250, y);
      ctx.lineTo(130, y);
      ctx.stroke();
      ctx.restore();
    }
    const selo = prog(p, 0.45, 0.8);
    if (selo > 0) {
      const n = Math.round(128 * Ease.outCubic(prog(p, 0.45, 1.3)));
      ctx.save();
      ctx.translate(170, -175);
      const e = Ease.outBack(selo, 2);
      ctx.scale(e, e);
      ctx.beginPath();
      ctx.roundRect(-150, -48, 300, 96, 48);
      ctx.fillStyle = COR.verde;
      ctx.shadowColor = COR.verde;
      ctx.shadowBlur = 30;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = COR.preto;
      ctx.font = fonte(40);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${n} leituras`, 0, 2);
      ctx.restore();
    }
  }

  icone_concorrente(ctx, p, t) {
    const telaTexto = (texto, alpha) => (c, w) => {
      c.fillStyle = rgba(COR.verde, 0.18 * alpha);
      c.fillRect(-w, -w, w * 2, w * 2);
      c.font = fonte(34);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = `rgba(255,255,255,${alpha})`;
      c.fillText(texto, 0, 0);
    };
    IconeTela.desenhar(ctx, {
      x: -170, y: 0, w: 280, play: false,
      brilho: 1 + pulsoBatida(t),
      interior: telaTexto('sua marca', 1),
    });

    const bloqueio = prog(p, 0.45, 0.75);
    const tremor = bloqueio > 0 && bloqueio < 1 ? Math.sin(p * 80) * 10 * (1 - bloqueio) : 0;
    const apaga = lerp(1, 0.35, bloqueio);
    IconeTela.desenhar(ctx, {
      x: 170 + tremor, y: 0, w: 280, play: false,
      cor: `rgba(255,255,255,${0.55 * apaga})`,
      interior: telaTexto('concorrente', 0.6 * apaga),
    });

    // O "x" verde riscado por cima do concorrente.
    if (bloqueio > 0) {
      ctx.save();
      ctx.translate(170, 0);
      ctx.strokeStyle = COR.verde;
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.shadowColor = COR.verde;
      ctx.shadowBlur = 30;
      const a = Ease.outCubic(clamp(bloqueio * 2));
      const b = Ease.outCubic(clamp(bloqueio * 2 - 1));
      ctx.beginPath();
      ctx.moveTo(-100, -100);
      ctx.lineTo(lerp(-100, 100, a), lerp(-100, 100, a));
      if (b > 0) {
        ctx.moveTo(100, -100);
        ctx.lineTo(lerp(100, -100, b), lerp(-100, 100, b));
      }
      ctx.stroke();
      ctx.restore();
    }
    const selo = prog(p, 0.75, 1.0);
    if (selo > 0) {
      ctx.save();
      ctx.globalAlpha *= selo;
      pilula(ctx, 170, 210, 250, 70, { borda: 3 });
      ctx.font = fonte(34);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COR.verde;
      ctx.fillText('bloqueado', 170, 212);
      ctx.restore();
    }
  }

  icone_alvo(ctx, p) {
    const escolhidas = [0, 5, 4, 7];
    const pos = (i) => ({ x: ((i % 3) - 1) * 175, y: (Math.floor(i / 3) - 1) * 150 });
    const quando = (j) => 0.35 + j * 0.15;
    for (let i = 0; i < 9; i++) {
      const j = escolhidas.indexOf(i);
      const k = j >= 0 ? prog(p, quando(j), quando(j) + 0.15) : 0;
      const { x, y } = pos(i);
      IconeTela.desenhar(ctx, {
        x, y, w: 130, play: k > 0,
        cor: k > 0 ? undefined : 'rgba(255,255,255,0.3)',
        brilho: k,
        interior: k > 0 ? (c, w) => {
          c.fillStyle = rgba(COR.verde, 0.3 * k);
          c.fillRect(-w, -w, w * 2, w * 2);
        } : undefined,
      });
    }
    // A mira passeia pelas telas escolhidas.
    const alvo = { t: 0, x: 0, y: 0 };
    const chaves = [alvo, ...escolhidas.map((i, j) => ({ t: quando(j), ...pos(i) }))];
    const m = interpolarChaves(chaves, p);
    ctx.save();
    ctx.globalAlpha *= prog(p, 0.1, 0.3);
    ctx.translate(m.x, m.y);
    ctx.strokeStyle = COR.verde;
    ctx.lineWidth = 6;
    ctx.shadowColor = COR.verde;
    ctx.shadowBlur = 25;
    ctx.beginPath();
    ctx.arc(0, 0, 92, 0, Math.PI * 2);
    ctx.stroke();
    for (let a = 0; a < 4; a++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(78, 0);
      ctx.lineTo(118, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  icone_relatorio(ctx, p) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-300, -230, 600, 460, 32);
    ctx.fillStyle = rgba(COR.verde, 0.07);
    ctx.fill();
    ctx.strokeStyle = rgba(COR.verde, 0.45);
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = fonte(28);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.branco;
    ctx.fillRect(-250, -185, 22, 22);
    ctx.fillText('exibições', -218, -173);
    ctx.fillStyle = COR.verde;
    ctx.fillRect(-40, -185, 22, 22);
    ctx.fillText('leituras', -8, -173);

    const alturas = [[0.85, 0.55], [0.7, 0.62], [0.95, 0.45]];
    const baseY = 150;
    ctx.textAlign = 'center';
    alturas.forEach(([exib, leit], g) => {
      const cx = -170 + g * 170;
      const k = Ease.outBack(prog(p, 0.15 + g * 0.12, 0.65 + g * 0.12), 1.3);
      ctx.fillStyle = COR.branco;
      ctx.fillRect(cx - 50, baseY - 250 * exib * k, 44, 250 * exib * k);
      ctx.fillStyle = COR.verde;
      ctx.shadowColor = COR.verde;
      ctx.shadowBlur = 20;
      ctx.fillRect(cx + 6, baseY - 250 * leit * k, 44, 250 * leit * k);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(`peça ${g + 1}`, cx, baseY + 40);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-250, baseY, 500, 3);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Cena 6 — ponto parceiro, grátis (17 a 20s)

class CenaParceiro extends Cena {
  constructor() {
    super({ inicio: 17.3, fim: 20.2, entrada: 0.35 });
    this.texto({ texto: 'tem um espaço?', x: 540, y: 900, tamanho: 92, inicio: 17.55, intervalo: 0.15 });
    this.texto({
      texto: 'vire ponto parceiro.',
      x: 540, y: 1010, tamanho: 92, inicio: 17.95, intervalo: 0.15,
      destaque: ['ponto', 'parceiro'],
    });
    this.gratis = this.texto({
      texto: 'é grátis.', x: 540, y: 1205, tamanho: 180, inicio: 18.4, intervalo: 0.18,
      destaque: ['grátis'],
    });
    this.sub = this.texto({
      texto: 'anuncie o seu negócio de graça na tela.',
      x: 540, y: 1380, tamanho: 50, larguraMax: 720, inicio: 18.8, intervalo: 0.05, som: false,
    });
    this.efeitos = [
      { t: 18.62, tipo: 'brilho' },
      { t: 18.62, tipo: 'impactoLeve' },
      { t: 19.85, tipo: 'whoosh', duracao: 0.4 },
    ];
  }

  conteudo(ctx, t) {
    explosao(ctx, t, 18.62, 640, 1205, { quantidade: 30, raio: 480, semente: 11 });
    for (const tx of this.textos) tx.desenhar(ctx, t, tx === this.sub ? 0.85 : 1);
  }
}

// ---------------------------------------------------------------------------
// Cena 7 — o botão "quero anunciar" é apertado (20 a 22,4s)

class CenaConvite extends Cena {
  constructor() {
    super({ inicio: 19.95, fim: 22.4, entrada: 0.35, saida: 0.01 });
    this.texto({
      texto: 'pronto pra aparecer?', x: 540, y: 770, tamanho: 104, inicio: 20.15, intervalo: 0.18,
      destaque: ['aparecer'],
    });
    this.clique = 21.3;
    this.efeitos = [
      { t: 20.45, tipo: 'pop' },
      { t: this.clique, tipo: 'clique' },
      { t: this.clique + 0.15, tipo: 'subida', duracao: 0.85 },
    ];
  }

  conteudo(ctx, t) {
    this.textos[0].desenhar(ctx, t);

    const botao = { x: 540, y: 1070, w: 740, h: 170 };
    const entra = prog(t, 20.45, 20.85);
    const aperto = t < this.clique ? prog(t, this.clique - 0.1, this.clique) : 1 - prog(t, this.clique + 0.05, this.clique + 0.2);
    if (entra > 0) {
      ctx.save();
      ctx.globalAlpha *= Ease.outCubic(entra);
      ctx.translate(botao.x, botao.y);
      const e = Ease.outBack(entra, 2) * (1 - 0.08 * aperto);
      ctx.scale(e, e);
      ctx.beginPath();
      ctx.roundRect(-botao.w / 2, -botao.h / 2, botao.w, botao.h, botao.h / 2);
      ctx.fillStyle = COR.verde;
      ctx.shadowColor = COR.verde;
      ctx.shadowBlur = 40 + 40 * pulsoBatida(t);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = COR.preto;
      ctx.font = fonte(76);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('quero anunciar', 0, 4);
      ctx.restore();
    }

    // Dedo/cursor que vem de baixo e aperta o botão.
    const vem = Ease.inOutCubic(prog(t, 20.75, 21.2));
    const some = prog(t, this.clique + 0.25, this.clique + 0.45);
    if (vem > 0 && some < 1) {
      const x = lerp(900, 690, vem);
      const y = lerp(1600, 1110, vem);
      ctx.save();
      ctx.globalAlpha *= (1 - some) * Ease.outCubic(prog(t, 20.75, 20.95));
      ctx.fillStyle = COR.branco;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(x, y, 30 * (1 - 0.25 * aperto), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 48 + 18 * aperto, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ondaChoque(ctx, t, this.clique + 0.05, botao.x, botao.y, 600);
    explosao(ctx, t, this.clique + 0.05, botao.x, botao.y, { quantidade: 24, raio: 420, semente: 17 });

    // O clique "inunda" a tela de verde: é a ponte de luz para o final.
    const enche = Ease.inCubic(prog(t, this.clique + 0.15, 22.35));
    if (enche > 0) {
      ctx.save();
      ctx.fillStyle = COR.verde;
      ctx.beginPath();
      ctx.arc(botao.x, botao.y, 2300 * enche, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Cena 8 — logo e chamada para o WhatsApp (22,4 a 25s)

class CenaFinal extends Cena {
  constructor(logo) {
    super({ inicio: 22.36, fim: DURACAO + 1, entrada: 0.01, saida: 0.01 });
    this.logo = logo;
    // Posição e tamanho da logo: o companheiro pousa exatamente no ícone dela.
    this.caixaLogo = { x: 540, y: 690, w: 900 };
    this.texto({ texto: 'chame no whatsapp', x: 540, y: 1075, tamanho: 64, inicio: 22.75, intervalo: 0.12 });
    this.efeitos = [
      { t: 22.35, tipo: 'impacto' },
      { t: 22.35, tipo: 'final' },
      { t: 23.05, tipo: 'pop' },
      { t: 23.4, tipo: 'brilho' },
    ];
  }

  conteudo(ctx, t) {
    const c = this.caixaLogo;
    const hLogo = (c.w * this.logo.height) / this.logo.width;

    const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 620);
    halo.addColorStop(0, rgba(COR.verdeEscuro, 0.95));
    halo.addColorStop(0.55, rgba(COR.verdeEscuro, 0.45));
    halo.addColorStop(1, rgba(COR.verdeEscuro, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // Logo original, sem redesenhar. O fundo preto do arquivo some com
    // "lighten": só pixels mais claros que o fundo aparecem, então as cores
    // da marca ficam exatamente as do arquivo.
    const k = prog(t, 22.45, 23.0);
    if (k > 0) {
      ctx.save();
      ctx.globalAlpha *= Ease.outCubic(k);
      ctx.globalCompositeOperation = 'lighten';
      ctx.translate(c.x, c.y);
      const e = lerp(0.9, 1, Ease.outBack(k, 1.6)) * (1 + 0.012 * Math.sin(t * 3));
      ctx.scale(e, e);
      ctx.drawImage(this.logo, -c.w / 2, -hLogo / 2, c.w, hLogo);
      ctx.restore();
    }

    this.textos[0].desenhar(ctx, t);

    const tel = prog(t, 23.05, 23.4);
    if (tel > 0) {
      ctx.save();
      ctx.globalAlpha *= Ease.outCubic(tel);
      ctx.translate(540, 1195);
      ctx.font = fonte(118);
      const largura = ctx.measureText(CONTATO.telefone).width;
      const e = Ease.outBack(tel, 2.2) * Math.min(1, 920 / largura);
      ctx.scale(e, e);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      textoComBrilho(ctx, CONTATO.telefone, 0, 0, COR.verde, 0.8 + 0.4 * pulsoBatida(t));
      ctx.restore();
    }

    const balao = prog(t, 23.4, 23.75);
    if (balao > 0) {
      ctx.save();
      ctx.globalAlpha *= Ease.outCubic(balao);
      ctx.translate(540, 1405 + (1 - Ease.outCubic(balao)) * 50);
      ctx.font = fonte(34);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('mande a mensagem:', 0, -115);

      // Balão de conversa com o rabinho à esquerda.
      ctx.beginPath();
      ctx.roundRect(-440, -62, 880, 124, 40);
      ctx.moveTo(-380, 60);
      ctx.lineTo(-400, 100);
      ctx.lineTo(-330, 60);
      ctx.fillStyle = rgba(COR.verde, 0.16);
      ctx.fill();
      ctx.strokeStyle = COR.verde;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = fonte(44);
      ctx.fillStyle = COR.branco;
      ctx.fillText(`“${CONTATO.frase}”`, 0, 2);
      ctx.restore();
    }
  }
}
