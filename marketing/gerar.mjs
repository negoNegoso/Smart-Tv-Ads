#!/usr/bin/env node
/**
 * Gera as peças de divulgação (Facebook e grupos de WhatsApp) em PNG.
 *
 *   node marketing/gerar.mjs
 *
 * O texto vive só aqui. As peças são HTML estático renderizado pelo Chrome em
 * modo headless, que recorta o viewport no tamanho exato pedido — por isso o
 * estilo trabalha em px absolutos e não em unidades responsivas.
 *
 * Este arquivo repete preço e telefone que também estão em
 * artifacts/signage/src/lib/landing-content.ts. É duplicação consciente: a
 * peça é HTML puro e não importa TypeScript do app. Ao mudar o preço, mude nos
 * dois lugares.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * As peças saem direto para dentro do estático da signage: a página
 * /divulgacao do painel serve os downloads como asset da CDN, sem rota de API
 * no meio. São arquivos de divulgação — a URL ser pública é o comportamento
 * desejado; o que fica atrás do login é a página que os organiza.
 */
const SAIDA = join(AQUI, '..', 'artifacts', 'signage', 'public', 'divulgacao');

/**
 * O HTML é só o passo intermediário do render e fica fora de `public/`: tudo
 * que estiver lá dentro o Vite copia para o build e publica.
 */
const TEMP = join(AQUI, '.tmp');

const CHROME =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MAGICK = process.env.MAGICK ?? 'magick';

/**
 * O Chrome renderiza no dobro do tamanho e o ImageMagick reduz com Lanczos.
 * Renderizar direto no tamanho final deixa a tipografia mole: o supersampling
 * é o que dá o traço firme. O arquivo em dobro fica salvo como `-2x`, porque o
 * Facebook aceita imagem maior e recomprime melhor a partir dela.
 */
const ESCALA = 2;

const WHATSAPP = '(13) 99747-8695';

const FORMATOS = {
  feed: { largura: 1080, altura: 1080 },
  story: { largura: 1080, altura: 1920 },
};

const ICONE_TV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10 7 5 3-5 3Z"/><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M12 17v4M8 21h8"/></svg>`;

const ICONE_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

const ICONE_WHATSAPP = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.07-.13-.27-.2-.57-.35ZM12.05 21.5h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.38 9.38 0 0 1-1.44-5.01c0-5.18 4.22-9.4 9.42-9.4a9.35 9.35 0 0 1 9.4 9.41c0 5.18-4.22 9.41-9.41 9.41ZM20.52 3.49A11.78 11.78 0 0 0 12.05 0C5.5 0 .18 5.32.17 11.86c0 2.09.55 4.13 1.59 5.93L.07 24l6.35-1.66a11.85 11.85 0 0 0 5.67 1.44h.01c6.54 0 11.86-5.32 11.87-11.86 0-3.17-1.24-6.15-3.48-8.4Z"/></svg>`;

const PECAS = [
  {
    id: 'anunciante',
    tema: 'tema-marca',
    titulo: 'Sua marca nas TVs do comércio da região',
    preco: 'R$ 150',
    periodo: '/mês',
    precoNota: 'Em todas as telas da rede.',
    itens: [
      'Até 3 artes, com troca livre no mês',
      'QR code próprio em cada peça',
      'Relatório de exibições e leituras, peça a peça',
      'Imagem ou vídeo — a gente publica pra você',
    ],
    ctaTitulo: 'Chame no WhatsApp',
  },
  {
    id: 'ponto',
    tema: 'tema-claro',
    titulo: 'Sua TV pode anunciar o seu negócio de graça',
    preco: 'Grátis',
    periodo: '',
    precoNota: 'Sem mensalidade e sem trabalho.',
    itens: [
      'Anuncie o seu próprio negócio na tela',
      'Concorrente do seu ramo fica bloqueado',
      'A programação roda sozinha o dia inteiro',
      'Serve a TV que você já tem',
    ],
    ctaTitulo: 'Chame no WhatsApp',
  },
];

function montarHtml(peca, formato, css) {
  const itens = peca.itens
    .map((item) => `        <li>${ICONE_CHECK}<span>${item}</span></li>`)
    .join('\n');

  const periodo = peca.periodo ? `<span>${peca.periodo}</span>` : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Smart Vale TV — ${peca.id} ${formato}</title>
<style>${css}</style>
</head>
<body class="${formato} ${peca.tema}">
  <div class="marca">${ICONE_TV}<span>Smart Vale TV</span></div>

  <div class="corpo">
    <h1 class="titulo">${peca.titulo}</h1>

    <p class="preco"><strong>${peca.preco}</strong>${periodo}</p>
    <p class="preco-nota">${peca.precoNota}</p>

    <ul class="itens">
${itens}
    </ul>
  </div>

  <div class="cta">
    ${ICONE_WHATSAPP}
    <div><small>${peca.ctaTitulo}</small>${WHATSAPP}</div>
  </div>
</body>
</html>
`;
}

mkdirSync(SAIDA, { recursive: true });
mkdirSync(TEMP, { recursive: true });
const css = readFileSync(join(AQUI, 'estilo.css'), 'utf8');

for (const peca of PECAS) {
  for (const [formato, { largura, altura }] of Object.entries(FORMATOS)) {
    const nome = `${peca.id}-${formato}`;
    const html = join(TEMP, `${nome}.html`);
    const png = join(SAIDA, `${nome}.png`);
    const png2x = join(SAIDA, `${nome}-2x.png`);

    writeFileSync(html, montarHtml(peca, formato, css));

    // --window-size fala em px de CSS; com o fator de escala em 2 a captura
    // sai no dobro dos pixels.
    execFileSync(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--force-device-scale-factor=${ESCALA}`,
      `--window-size=${largura},${altura}`,
      `--screenshot=${png2x}`,
      `file://${html}`,
    ], { stdio: 'ignore' });

    execFileSync(MAGICK, [
      png2x,
      '-filter', 'Lanczos',
      '-resize', `${largura}x${altura}`,
      '-strip',
      png,
    ], { stdio: 'ignore' });

    console.log(
      `gerado  ${nome}.png  ${largura}x${altura}` +
        `  (+ ${nome}-2x.png  ${largura * ESCALA}x${altura * ESCALA})`,
    );
  }
}
