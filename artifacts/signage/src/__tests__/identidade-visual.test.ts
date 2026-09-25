import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda da identidade visual. O logo mestre (brand/logo.svg) é copiado para
 * lugares que não importam TypeScript — os vector drawables do app Android —
 * e este teste confere as cópias. Também varre a plataforma atrás de restos
 * da identidade antiga (laranja, ultramarine, índigo, ícone MonitorPlay).
 */
const REPO = resolve(import.meta.dirname, '../../../..');
const ler = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const MESTRE = ler('brand/logo.svg');
// Ordem no mestre: smart, vale, tv, tela, play.
const CAMINHOS = Array.from(MESTRE.matchAll(/ d="([^"]+)"/g), (m) => m[1]);
const RES = 'artifacts/android-tv/app/src/main/res';

describe('app Android com a marca nova', () => {
  it('ícone tem os paths da tela e do play', () => {
    const icone = ler(`${RES}/drawable/ic_launcher.xml`);
    for (const d of CAMINHOS.slice(3)) expect(icone).toContain(`android:pathData="${d}"`);
    expect(icone).toContain('#FF28D8B3');
  });

  it('banner tem o logo completo', () => {
    const banner = ler(`${RES}/drawable/banner.xml`);
    expect(CAMINHOS).toHaveLength(5);
    for (const d of CAMINHOS) expect(banner).toContain(`android:pathData="${d}"`);
  });

  it('nome do app é Smart Vale TV', () => {
    expect(ler(`${RES}/values/strings.xml`)).toContain('<string name="app_name">Smart Vale TV</string>');
  });
});

/** Tudo que é da plataforma (não de cliente) e pode carregar cor de marca. */
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'node_modules' ? [] : arquivos(p);
    return /\.(tsx?|css|html)$/.test(n) ? [p] : [];
  });
}

// Conteúdo de cliente escolhe as próprias cores; não é marca da plataforma.
const CLIENTE = /components\/flyer\/|lib\/promo-visual\.ts$|lib\/flyer-status\.ts$/;

describe('sem resto da identidade antiga', () => {
  const alvos = [
    ...arquivos(resolve(REPO, 'artifacts/signage/src')),
    ...arquivos(resolve(REPO, 'artifacts/signage/public')),
    resolve(REPO, 'artifacts/signage/index.html'),
    resolve(REPO, 'marketing/estilo.css'),
  ].filter((f) => !CLIENTE.test(f));

  const ANTIGAS = [/#ff3c00/i, /#3d00ff/i, /#4f46e5/i, /indigo-\d/, /248 100%/, /MonitorPlay/];

  it.each(alvos.map((f) => [f.replace(REPO + '/', ''), f]))('%s', (_rel, f) => {
    const texto = readFileSync(f, 'utf8');
    expect(ANTIGAS.filter((re) => re.test(texto)).map(String)).toEqual([]);
  });
});
