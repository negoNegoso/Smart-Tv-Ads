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
let orientacao = "landscape";
let gets: string[] = [];
// Corpo devolvido quando statusDaLista é um erro HTTP (não 200, não 0/rede).
// O 404 "de verdade" da API vem com este corpo (ver routes/display.ts); um
// teste troca isto para simular um 404 de outra origem (proxy, misroute).
let corpoDeErro = '{"error":"Device not found"}';

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
 * `window.localStorage` de verdade (jsdom) some sob Node 25 com Web Storage
 * nativo habilitado: o global do Node vence o do jsdom e fica sem
 * getItem/setItem/clear. Um fake em memória tira o teste dessa dependência de
 * ambiente — instalado de novo a cada teste, então já nasce limpo.
 */
function criarStorageFake(): Storage {
  const dados = new Map<string, string>();
  return {
    getItem: (chave: string) => (dados.has(chave) ? dados.get(chave)! : null),
    setItem: (chave: string, valor: string) => {
      dados.set(chave, String(valor));
    },
    removeItem: (chave: string) => {
      dados.delete(chave);
    },
    clear: () => {
      dados.clear();
    },
    key: (indice: number) => Array.from(dados.keys())[indice] ?? null,
    get length() {
      return dados.size;
    },
  } as Storage;
}

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
  orientacao = "landscape";
  gets = [];
  corpoDeErro = '{"error":"Device not found"}';
  Object.defineProperty(window, "localStorage", {
    value: criarStorageFake(),
    configurable: true,
    writable: true,
  });

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
      if (statusDaLista === 200) {
        // /feed embrulha a lista com a orientação da TV; /slides é a lista pura.
        this.responseText = this.url.indexOf("/feed") >= 0
          ? JSON.stringify({ screen: { orientation: orientacao }, slides: listaDeSlides })
          : JSON.stringify(listaDeSlides);
      } else if (statusDaLista === 0) {
        this.responseText = ""; // rede caiu: sem corpo, como um XHR de verdade
      } else {
        this.responseText = corpoDeErro;
      }
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

  describe("dentro do app Android", () => {
    let adicionar: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      Object.defineProperty(window.navigator, "userAgent", {
        configurable: true,
        get: () =>
          "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/74.0 Safari/537.36 SignageApp/1.0.0",
      });
      adicionar = vi.spyOn(document, "addEventListener");
    });

    afterEach(() => {
      adicionar.mockRestore();
      delete (window.navigator as { userAgent?: unknown }).userAgent;
    });

    it("não mostra o aviso de tela cheia", () => {
      carregarTv();
      expect(aviso().style.display).toBe("none");
    });

    // Espia o registro em vez de disparar tecla: listeners de testes
    // anteriores continuam no `document` e pediriam a tela cheia.
    it("não registra o gatilho de tela cheia", () => {
      carregarTv();
      const tipos = adicionar.mock.calls.map((c) => c[0]);
      expect(tipos).not.toContain("keydown");
      expect(tipos).not.toContain("click");
    });
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
    expect(gets[0]).toContain(`/api/display/${key}/feed`);
  });

  it("reusa a key guardada", () => {
    semKeyNaUrl();
    window.localStorage.setItem("signage.deviceKey", "A1B2C3D4E5F6A7B8");
    statusDaLista = 404;
    carregarTv();

    expect(gets[0]).toContain("/api/display/A1B2C3D4E5F6A7B8/feed");
  });

  it("key da URL vence a guardada e não é gravada", () => {
    window.localStorage.setItem("signage.deviceKey", "A1B2C3D4E5F6A7B8");
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();

    expect(gets[0]).toContain("/api/display/CHAVE/feed");
    expect(window.localStorage.getItem("signage.deviceKey")).toBe("A1B2C3D4E5F6A7B8");
  });

  it("key da URL com minúsculas e traços é normalizada antes da consulta", () => {
    window.history.replaceState({}, "", "/tv.html?key=a1b2-c3d4-e5f6-a7b8");
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();

    expect(gets[0]).toContain("/api/display/A1B2C3D4E5F6A7B8/feed");
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

  it("404 com corpo diferente (proxy/misroute) não abre o pareamento", () => {
    semKeyNaUrl();
    statusDaLista = 404;
    corpoDeErro = "Not Found";
    carregarTv();

    expect(pareando()).toBe(false);
    expect(document.getElementById("empty-screen")!.className).toBe("visible");
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
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("bloqueado");
        },
        setItem: () => {
          throw new Error("bloqueado");
        },
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      } as Storage,
      configurable: true,
      writable: true,
    });
    statusDaLista = 404;
    carregarTv();

    expect(pareando()).toBe(true);
    expect(gets[0]).toMatch(/\/api\/display\/[0-9A-F]{16}\/feed/);
  });
});

describe("tv.html: TV em retrato", () => {
  const palco = () => document.getElementById("stage")!;

  it("TV deitada não gira", () => {
    listaDeSlides = [slide(1, "/api/uploads/a.png")];
    carregarTv();
    expect(palco().className).toBe("");
  });

  it("portrait_right gira o palco para a direita", () => {
    orientacao = "portrait_right";
    listaDeSlides = [slide(1, "/api/uploads/a.png")];
    carregarTv();
    expect(palco().className).toBe("portrait-right");
  });

  it("portrait_left gira para a esquerda", () => {
    orientacao = "portrait_left";
    listaDeSlides = [slide(1, "/api/uploads/a.png")];
    carregarTv();
    expect(palco().className).toBe("portrait-left");
  });

  it("slides, legenda, QR, progresso e tela vazia ficam dentro do palco; pareamento fica fora", () => {
    carregarTv();
    for (const id of ["slot-a", "slot-b", "yt-slot", "overlay", "progress-track", "qr-box", "empty-screen"]) {
      expect(palco().contains(document.getElementById(id))).toBe(true);
    }
    expect(palco().contains(document.getElementById("pair-screen"))).toBe(false);
  });

  it("troca de orientação no refresh gira o palco e recomeça do primeiro slide", () => {
    // URL absoluta (padrão dos testes vizinhos): o helper `responder` casa
    // pelo início de `img.src`, e uma URL relativa (/api/uploads/...) sai
    // resolvida com o apiBase() na frente, então não bateria mais no índice 0.
    listaDeSlides = [slide(1, "https://blob/a.png"), slide(2, "https://blob/b.png")];
    carregarTv();
    responder("https://blob/a.png", true);
    // Duração de 5 s com tick de 80 ms: 5000 não é múltiplo de 80, então
    // avançar exatos 5000 ms para antes do tick que cruza o limiar (a barra
    // fica em 99,2%). +80 garante o tick que dispara o goNext.
    vi.advanceTimersByTime(5080);
    responder("https://blob/b.png", true);
    expect(noAr()).toContain("b.png");

    orientacao = "portrait_right";
    // Completa os 60 s desde o início (relógio já em 5080ms) para cair
    // exatamente no refresh de 60 s sem deixar o timer do slide 2 disparar de
    // novo antes disso.
    vi.advanceTimersByTime(60000 - 5080);
    expect(palco().className).toBe("portrait-right");
    responder("https://blob/a.png", true);
    expect(noAr()).toContain("a.png");
  });

  it("o CSS gira com prefixo -webkit- para os WebViews antigos", () => {
    expect(HTML).toMatch(/#stage\.portrait-right\s*\{[^}]*-webkit-transform:\s*translate\(-50%,\s*-50%\)\s*rotate\(90deg\)/);
    expect(HTML).toMatch(/#stage\.portrait-left\s*\{[^}]*-webkit-transform:\s*translate\(-50%,\s*-50%\)\s*rotate\(-90deg\)/);
  });
});
