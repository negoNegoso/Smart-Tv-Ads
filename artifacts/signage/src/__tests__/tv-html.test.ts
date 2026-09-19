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
let statusDaLista = 200;
let gets: string[] = [];

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
  statusDaLista = 200;
  gets = [];
  window.localStorage.clear();

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
      gets.push(this.url);
      this.readyState = 4;
      this.status = statusDaLista;
      this.responseText = statusDaLista === 200 ? JSON.stringify(listaDeSlides) : "";
      this.onreadystatechange?.();
    }
  }
  vi.stubGlobal("XMLHttpRequest", XhrStub);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

describe("tv.html: tela cheia em TV box", () => {
  let noFullscreen: Element | null = null;
  let pedir: ReturnType<typeof vi.fn>;
  const aviso = () => document.getElementById("fs-hint")!;

  beforeEach(() => {
    noFullscreen = null;
    pedir = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => noFullscreen,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: pedir,
    });
    listaDeSlides = [slide(1, "https://blob/a.png")];
  });

  afterEach(() => {
    delete (document as { fullscreenElement?: unknown }).fullscreenElement;
    delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
  });

  it("mostra o aviso fora da tela cheia", () => {
    carregarTv();
    expect(aviso().style.display).toBe("block");
  });

  it("uma tecla do controle pede a tela cheia", () => {
    carregarTv();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(pedir).toHaveBeenCalled();
  });

  it("some em tela cheia e volta ao sair", () => {
    carregarTv();
    noFullscreen = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(aviso().style.display).toBe("none");

    noFullscreen = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(aviso().style.display).toBe("block");
  });

  it("sem suporte a tela cheia não mostra aviso", () => {
    delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
    carregarTv();
    expect(aviso().style.display).toBe("none");
  });
});

describe("tv.html: pareamento", () => {
  const pareando = () => document.getElementById("pair-screen")!.className === "visible";
  const semKeyNaUrl = () => window.history.replaceState({}, "", "/tv");

  it("sem key na URL gera uma, guarda e usa", () => {
    semKeyNaUrl();
    statusDaLista = 404;
    carregarTv();

    const key = window.localStorage.getItem("signage.deviceKey");
    expect(key).toMatch(/^[0-9A-F]{16}$/);
    expect(gets[0]).toContain(`/api/display/${key}/slides`);
  });

  it("reusa a key guardada", () => {
    semKeyNaUrl();
    window.localStorage.setItem("signage.deviceKey", "A1B2C3D4E5F6A7B8");
    statusDaLista = 404;
    carregarTv();

    expect(gets[0]).toContain("/api/display/A1B2C3D4E5F6A7B8/slides");
  });

  it("key da URL vence a guardada e não é gravada", () => {
    window.localStorage.setItem("signage.deviceKey", "A1B2C3D4E5F6A7B8");
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();

    expect(gets[0]).toContain("/api/display/CHAVE/slides");
    expect(window.localStorage.getItem("signage.deviceKey")).toBe("A1B2C3D4E5F6A7B8");
  });

  it("404 mostra QR, key em blocos e link", () => {
    semKeyNaUrl();
    window.localStorage.setItem("signage.deviceKey", "A1B2C3D4E5F6A7B8");
    statusDaLista = 404;
    carregarTv();

    expect(pareando()).toBe(true);
    expect((document.getElementById("pair-qr") as HTMLImageElement).src).toContain(
      "/api/qr/pair/A1B2C3D4E5F6A7B8.png",
    );
    expect(document.getElementById("pair-key")!.textContent).toBe("A1B2-C3D4-E5F6-A7B8");
    expect(document.getElementById("pair-url")!.textContent).toContain("/parear/A1B2C3D4E5F6A7B8");
    expect(document.getElementById("empty-screen")!.className).toBe("");
  });

  it("consulta a cada 5 s e sai do pareamento quando vinculada", () => {
    semKeyNaUrl();
    statusDaLista = 404;
    carregarTv();
    expect(pareando()).toBe(true);

    statusDaLista = 200;
    listaDeSlides = [slide(1, "https://blob/a.png")];
    vi.advanceTimersByTime(5000);
    responder("https://blob/a.png", true);

    expect(pareando()).toBe(false);
    expect(noAr()).toBe("https://blob/a.png");
  });

  it("device apagado: 404 no refresh volta ao pareamento", () => {
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    responder("https://blob/a.png", true);

    statusDaLista = 404;
    vi.advanceTimersByTime(60000);

    expect(pareando()).toBe(true);
    expect(noAr()).toBeNull();
  });

  it("rede caindo durante o pareamento mantém o QR", () => {
    semKeyNaUrl();
    statusDaLista = 404;
    carregarTv();
    expect(pareando()).toBe(true);

    statusDaLista = 0;
    vi.advanceTimersByTime(5000);

    expect(pareando()).toBe(true);
  });

  it("erro de rede não abre o pareamento", () => {
    semKeyNaUrl();
    statusDaLista = 0;
    carregarTv();

    expect(pareando()).toBe(false);
    expect(document.getElementById("empty-screen")!.className).toBe("visible");
  });

  it("localStorage que lança exceção não quebra a TV", () => {
    semKeyNaUrl();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    statusDaLista = 404;
    carregarTv();

    expect(pareando()).toBe(true);
    expect(gets[0]).toMatch(/\/api\/display\/[0-9A-F]{16}\/slides/);
  });
});
