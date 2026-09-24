#!/usr/bin/env node
/**
 * Gera o vídeo de divulgação da Smart Vale TV.
 *
 *   node marketing/video/gerar-video.mjs          # só o HTML único (com botão "Baixar MP4")
 *   node marketing/video/gerar-video.mjs --mp4    # também o MP4, quadro a quadro
 *
 * O HTML sai com fonte, logo e scripts embutidos, para funcionar sozinho
 * quando baixado. O MP4 é exportado sem depender de tempo real: o Chromium
 * headless desenha cada quadro por render(t) e a trilha é renderizada num
 * OfflineAudioContext; o ffmpeg junta tudo em H.264 + AAC.
 *
 * Requisitos do --mp4: Playwright (resolvido também pelo NODE_PATH, para usar
 * a instalação global) e um ffmpeg com libx264 (variável FFMPEG ou no PATH).
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, 'dist');

/** Ordem importa: cada script usa o que os anteriores declararam. */
const SCRIPTS = ['qr-whatsapp.js', 'base.js', 'componentes.js', 'cenas.js', 'trilha.js', 'app.js'];

function dataUrl(arquivo, tipo) {
  return `data:${tipo};base64,${readFileSync(join(AQUI, 'assets', arquivo)).toString('base64')}`;
}

function montarHtml() {
  const valores = {
    FONTE: dataUrl('Outfit-Bold.ttf', 'font/ttf'),
    LOGO: dataUrl('logo.png', 'image/png'),
    SCRIPTS: SCRIPTS.map((s) => `// ---- ${s}\n${readFileSync(join(AQUI, 'src', s), 'utf8')}`).join('\n'),
  };
  // Substituição por função: o código tem "r$", que viraria padrão especial
  // do String.replace se fosse passado como texto.
  return readFileSync(join(AQUI, 'template.html'), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, chave) => valores[chave]);
}

function rodar(cmd, args, entrada) {
  return new Promise((ok, erro) => {
    const p = spawn(cmd, args, { stdio: [entrada ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('error', erro);
    p.on('close', (codigo) => (codigo === 0 ? ok() : erro(new Error(`${cmd} saiu com código ${codigo}`))));
    if (entrada) entrada(p.stdin);
  });
}

async function gerarMp4(html) {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';

  const navegador = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1920 } });
  pagina.on('pageerror', (e) => console.error('Erro na página:', e));
  await pagina.goto(`${pathToFileURL(html)}?exportar`);
  await pagina.waitForFunction(() => window.videoPronto === true);
  const { duracao, fps } = await pagina.evaluate(() => ({ duracao: exportar.duracao, fps: exportar.fps }));

  console.log('Renderizando a trilha…');
  const wav = join(SAIDA, 'trilha.wav');
  writeFileSync(wav, Buffer.from(await pagina.evaluate(() => exportar.audioWav()), 'base64'));

  const mp4 = join(SAIDA, 'smart-vale-tv.mp4');
  const total = Math.round(duracao * fps);
  const args = [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-i', wav,
    // Teto de ~12 Mbit/s: qualidade alta e arquivo que o WhatsApp e o
    // Instagram aceitam sem recomprimir demais.
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '12M', '-bufsize', '24M',
    '-profile:v', 'high',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '256k',
    '-movflags', '+faststart', '-shortest', mp4,
  ];
  await rodar(ffmpeg, args, async (stdin) => {
    for (let i = 0; i < total; i++) {
      const url = await pagina.evaluate((t) => exportar.quadro(t), i / fps);
      const jpeg = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      if (!stdin.write(jpeg)) await new Promise((ok) => stdin.once('drain', ok));
      if (i % fps === 0) process.stdout.write(`\rQuadros: ${i}/${total}`);
    }
    stdin.end();
    process.stdout.write(`\rQuadros: ${total}/${total}\n`);
  });
  await navegador.close();
  return mp4;
}

mkdirSync(SAIDA, { recursive: true });
const html = join(SAIDA, 'smart-vale-tv.html');
writeFileSync(html, montarHtml());
console.log(`HTML: ${html}`);
if (process.argv.includes('--mp4')) console.log(`MP4: ${await gerarMp4(html)}`);
