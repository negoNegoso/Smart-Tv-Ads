import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Testa o `public/tv.html` de verdade: o arquivo é o renderizador que roda nas
 * TVs (ES5, sem build), então o teste carrega o HTML, executa o `<script>` que
 * ele carrega e controla as fronteiras — XHR (lista de slides e telemetria) e
 * `Image` (carregamento das artes).
 *
 * O que isto protege: uma arte que não carrega — URL que morreu quando o
 * painel foi republicado, rede ruim, cache podre — deixava o slot com
 * `background-image` quebrado, ou seja, uma tela preta muda, com o slide ainda
 * contando exibição como se tivesse ido ao ar.
 */
const HTML = readFileSync(resolve(import.meta.dirname, "../../public/tv.html"), "utf8");

interface FakeImage {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  respondida?: boolean;
}

let imagens: FakeImage[] = [];
let posts: Array<{ url: string; payload: Record<string, unknown> }> = [];
let listaDeSlides: unknown[] = [];

const slide = (announcementId: number, imageUrl: string) => ({
  announcementId,
  campaignId: null,
  title: `Slide ${announcementId}`,
  displayText: null,
  imageUrl,
  duration: 5,
  qrImageUrl: null,
  mediaKind: "image",
  youtubeId: null,
  videoIds: null,
  playbackMode: "capped",
  audioMode: "muted",
});

/**
 * Resolve as artes pendentes de `url`: sucesso ou falha, como o navegador da TV
 * faria. Uma falha faz a página pedir a mesma arte de novo furando cache, então
 * o helper responde também esse novo pedido — daí o laço.
 */
function responder(url: string, ok: boolean) {
  const pendentes = () => imagens.filter((i) => !i.respondida && i.src.indexOf(url) === 0);
  if (pendentes().length === 0) {
    throw new Error(`nenhuma imagem pediu ${url}; pediram: ${imagens.map((i) => i.src)}`);
  }
  for (let volta = 0; volta < 5; volta += 1) {
    const alvo = pendentes();
    if (alvo.length === 0) return;
    for (const img of alvo) {
      img.respondida = true;
      if (ok) img.onload?.();
      else img.onerror?.();
    }
  }
}

/** Qual arte está de fato na tela (slot visível com background). */
function noAr(): string | null {
  for (const id of ["slot-a", "slot-b"]) {
    const el = document.getElementById(id)!;
    if (el.style.opacity === "1" && el.style.backgroundImage) {
      return el.style.backgroundImage.replace(/^url\(["']?|["']?\)$/g, "");
    }
  }
  return null;
}

function carregarTv() {
  document.documentElement.innerHTML = HTML.replace(/<!DOCTYPE html>/i, "");
  for (const script of Array.from(document.querySelectorAll("script"))) {
    if (script.textContent) new Function(script.textContent)();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  imagens = [];
  posts = [];
  listaDeSlides = [];

  window.history.replaceState({}, "", "/tv.html?key=CHAVE");

  class ImageStub {
    src = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      imagens.push(this as unknown as FakeImage);
    }
  }
  vi.stubGlobal("Image", ImageStub);

  class XhrStub {
    private method = "";
    private url = "";
    status = 200;
    readyState = 0;
    responseText = "";
    onreadystatechange: (() => void) | null = null;
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader() {}
    send(body?: string) {
      if (this.method === "POST") {
        posts.push({ url: this.url, payload: JSON.parse(body ?? "{}") });
        return;
      }
      this.readyState = 4;
      this.status = 200;
      this.responseText = JSON.stringify(listaDeSlides);
      this.onreadystatechange?.();
    }
  }
  vi.stubGlobal("XMLHttpRequest", XhrStub);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("tv.html: arte que não carrega", () => {
  it("mostra a arte quando ela carrega", () => {
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    responder("https://blob/a.png", true);
    expect(noAr()).toBe("https://blob/a.png");
  });

  it("pula o slide cuja arte falhou em vez de deixar a tela preta", () => {
    listaDeSlides = [slide(1, "https://blob/morta.png"), slide(2, "https://blob/viva.png")];
    carregarTv();

    responder("https://blob/morta.png", false);

    // Não pode ter ficado nem preto nem com a arte morta: a TV passa adiante.
    responder("https://blob/viva.png", true);
    expect(noAr()).toBe("https://blob/viva.png");
  });

  it("não conta exibição de slide que nunca apareceu", () => {
    listaDeSlides = [slide(1, "https://blob/morta.png"), slide(2, "https://blob/viva.png")];
    carregarTv();

    responder("https://blob/morta.png", false);
    responder("https://blob/viva.png", true);
    vi.advanceTimersByTime(5000);

    const exibidos = posts
      .filter((p) => p.url.indexOf("/api/telemetry/play") !== -1)
      .map((p) => p.payload.announcementId);
    expect(exibidos).not.toContain(1);
  });

  it("todas as artes quebradas não viram laço infinito", () => {
    listaDeSlides = [slide(1, "https://blob/m1.png"), slide(2, "https://blob/m2.png")];
    carregarTv();

    responder("https://blob/m1.png", false);
    responder("https://blob/m2.png", false);

    // Deu a volta inteira sem nenhuma arte: para de tentar e avisa na tela, em
    // vez de girar a lista para sempre queimando rede da loja.
    expect(document.getElementById("empty-screen")!.className).toContain("visible");
    expect(imagens.length).toBeLessThanOrEqual(4);
  });
});
