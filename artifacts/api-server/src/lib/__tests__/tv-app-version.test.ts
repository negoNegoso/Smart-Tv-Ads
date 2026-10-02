import { describe, expect, it } from "vitest";
import { isOutdatedTvApp, tvAppVersionFromUserAgent } from "../tv-app-version";

// O app monta o User-Agent como `<UA do WebView> SignageApp/<versionName>`
// (artifacts/android-tv/.../TvWebViewConfig.kt).
const WEBVIEW =
  "Mozilla/5.0 (Linux; Android 11; TV BOX) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Safari/537.36";

describe("tvAppVersionFromUserAgent", () => {
  it("lê a versão que o app Android anexa", () => {
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} SignageApp/1.9.0`)).toBe("1.9.0");
  });

  it("aceita versão de teste com sufixo", () => {
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} SignageApp/1.0.1-rc1`)).toBe("1.0.1-rc1");
  });

  it("navegador sem o app não tem versão", () => {
    expect(tvAppVersionFromUserAgent(WEBVIEW)).toBeNull();
  });

  it("User-Agent ausente ou vazio não tem versão", () => {
    expect(tvAppVersionFromUserAgent(undefined)).toBeNull();
    expect(tvAppVersionFromUserAgent(null)).toBeNull();
    expect(tvAppVersionFromUserAgent("")).toBeNull();
  });

  // A rota do feed é pública (basta a key): o que vier aqui vai para o banco
  // e para a tela do admin. Só entra o que tem cara de versão.
  it("recusa versão com mais de 32 caracteres", () => {
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} SignageApp/${"1".repeat(33)}`)).toBeNull();
  });

  it("recusa versão com caracteres fora de letras, números, ponto e hífen", () => {
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} SignageApp/<script>`)).toBeNull();
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} SignageApp/1.9.0<x`)).toBeNull();
  });

  it("não confunde outro produto que termina com o mesmo nome", () => {
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} NotSignageApp/1.0.0`)).toBeNull();
  });
});

describe("isOutdatedTvApp", () => {
  it("versão menor que a última release é desatualizada", () => {
    expect(isOutdatedTvApp("1.8.2", "1.9.0")).toBe(true);
  });

  it("mesma versão não é desatualizada", () => {
    expect(isOutdatedTvApp("1.9.0", "1.9.0")).toBe(false);
  });

  // Comparação de texto diria que "1.10.0" < "1.9.0".
  it("compara número a número, não como texto", () => {
    expect(isOutdatedTvApp("1.9.0", "1.10.0")).toBe(true);
    expect(isOutdatedTvApp("1.10.0", "1.9.0")).toBe(false);
  });

  it("versão maior que a última release (release apagada) não é desatualizada", () => {
    expect(isOutdatedTvApp("2.0.0", "1.9.0")).toBe(false);
  });

  it("TV sem versão nunca é marcada", () => {
    expect(isOutdatedTvApp(null, "1.9.0")).toBe(false);
  });

  it("sem a última release (GitHub fora) ninguém é marcado", () => {
    expect(isOutdatedTvApp("1.0.0", null)).toBe(false);
  });

  it("versão fora do padrão X.Y.Z nunca é marcada", () => {
    expect(isOutdatedTvApp("1.0.1-rc1", "1.9.0")).toBe(false);
    expect(isOutdatedTvApp("1.9.0", "ultima")).toBe(false);
  });
});
