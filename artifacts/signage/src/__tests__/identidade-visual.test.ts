import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O logo mestre (brand/logo.svg) é copiado para lugares que não importam
 * TypeScript: os vector drawables do app Android. Este teste garante que as
 * cópias continuam iguais ao mestre.
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
