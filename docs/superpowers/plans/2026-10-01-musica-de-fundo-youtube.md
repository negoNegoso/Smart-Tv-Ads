# Música de fundo por YouTube na TV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin cola um link do YouTube na TV e o áudio toca em fundo no `tv.html`, pausando nas peças de vídeo com som e retomando depois, sem gerar nenhuma métrica.

**Architecture:** `devices.music_url` guarda o link. O feed da TV (`GET /display/:key/feed`) devolve `music: { kind, youtubeId } | null`, fora de `slides`. O `tv.html` cria um segundo player do YouTube, fora da tela, que vive entre os slides; os dois pontos que hoje ligam/desligam `somNoAr` passam a pausar/retomar esse player.

**Tech Stack:** pnpm monorepo, Drizzle + Postgres (`lib/db`), Express + zod gerado por orval (`artifacts/api-server`, `lib/api-spec`), React + TanStack Query (`artifacts/signage`), `tv.html` em ES5 puro, vitest + jsdom + supertest.

**Spec:** `docs/superpowers/specs/2026-10-01-musica-de-fundo-youtube-design.md`

## Global Constraints

- Branch `feat/musica-de-fundo-youtube`. Nunca commitar na `main`.
- Commit: `tipo(escopo): descrição curta em português`, sem ponto final, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código e comentários em português, explicando o porquê. Acentos como caracteres UTF-8 reais, nunca `\uXXXX`.
- `artifacts/signage/public/tv.html` é ES5: só `var` e `function`. Nada de `let`, `const`, arrow function, template string, `Array.prototype.includes`, `Object.assign`.
- Não editar à mão `lib/api-zod/src/generated/**` nem `lib/api-client-react/src/generated/**`: mudar `lib/api-spec/openapi.yaml` e rodar o codegen.
- Não criar tag `vX.Y.Z`, não mexer em `versionName`/`versionCode`. Nenhuma mudança no APK Android.
- Textos exatos: erro da API `Link do YouTube inválido`; rótulo `Música de fundo (YouTube)`; toasts `Música de fundo salva.` e `Música de fundo removida.`.
- Volume da música fixo em 100. A música nunca é posta no mudo.
- A música nunca entra em `slides`, nunca gera POST de telemetria.
- Erro no player da música nunca interrompe o rodízio das peças.

## Review Focus

Entradas que a spec não nomeia mas que o admin ou a TV vão encontrar. Cada uma tem teste na tarefa dona do código.

1. **Link de mix automático** (`watch?v=X&list=RD…`, o que o YouTube dá ao clicar numa música): o player embutido não carrega listas `RD`. Esperado: toca o vídeo `X` em laço, não silêncio. → Task 1.
2. **Link do YouTube Music e de live** (`music.youtube.com/watch?v=…`, `youtube.com/live/<id>`): hoje `parseYouTubeUrl` recusa os dois. Esperado: aceitos. → Task 1.
3. **Música ligada ou trocada pelo admin enquanto uma peça com som está no ar**: o player novo fica pronto no meio da peça. Esperado: não toca por cima; começa quando a peça sair. → Task 5.
4. **Player da música que lança exceção** (construtor, `pauseVideo`, `playVideo`): Esperado: as peças seguem rodando. → Tasks 4 e 5.
5. **API do YouTube que não carrega com música configurada**: Esperado: peças seguem no fallback de imagem, e a ponte com o app Android (Spotify) volta a valer, já que não há música do painel tocando. → Tasks 4 e 5.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/youtube.ts` (modificar) | `parseYouTubeUrl` aceita `music.youtube.com` e `/live/<id>` |
| `artifacts/api-server/src/lib/youtube/music.ts` (criar) | `musicRefFromUrl`: link gravado → o que o player da TV carrega |
| `lib/db/src/schema/devices.ts` (modificar) | coluna `musicUrl` |
| `lib/db/drizzle/0016_*.sql` (gerado) | migration |
| `lib/api-spec/openapi.yaml` (modificar) | `Device.musicUrl`, `DeviceUpdate.musicUrl`, `DisplayFeed.music` |
| `artifacts/api-server/src/routes/devices.ts` (modificar) | PATCH valida e grava; respostas devolvem `musicUrl` |
| `artifacts/api-server/src/routes/display.ts` (modificar) | feed devolve `music` |
| `artifacts/signage/src/components/device-music-field.tsx` (criar) | campo do admin |
| `artifacts/signage/src/pages/device-detail.tsx` (modificar) | usa o campo |
| `artifacts/signage/src/lib/api-error.ts` (modificar) | deixa passar o erro do link |
| `artifacts/signage/public/tv.html` (modificar) | player da música, pausa/retomada, ponte |
| `artifacts/android-tv/README.md` (modificar) | nota: música do painel × Spotify |

Comandos de teste, da raiz do repo:

- API: `pnpm --filter @workspace/api-server test -- <arquivo>`
- Web: `pnpm --filter @workspace/signage test -- <arquivo>`
- Tipos: `pnpm run typecheck`

---

### Task 1: Link de música → referência do player

**Files:**
- Modify: `lib/db/src/youtube.ts`
- Create: `artifacts/api-server/src/lib/youtube/music.ts`
- Test: `artifacts/api-server/src/lib/__tests__/youtube-parse.test.ts` (acrescentar)
- Test: `artifacts/api-server/src/lib/youtube/__tests__/music.test.ts` (criar)

**Interfaces:**
- Consumes: `parseYouTubeUrl(input: string): YouTubeRef | null` de `@workspace/db/youtube`.
- Produces: `musicRefFromUrl(url: string | null | undefined): MusicRef | null` e `type MusicRef = { kind: "youtube_video" | "youtube_playlist"; youtubeId: string }`, exportados de `artifacts/api-server/src/lib/youtube/music.ts`.

- [ ] **Step 1: Testes do parser que falham**

Acrescentar dentro do `describe("parseYouTubeUrl", …)` de `artifacts/api-server/src/lib/__tests__/youtube-parse.test.ts`:

```ts
  it("reconhece link do YouTube Music", () => {
    expect(parseYouTubeUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube_video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("reconhece link de live", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/live/jfKfPfyJRdk?si=abc")).toEqual({
      kind: "youtube_video",
      id: "jfKfPfyJRdk",
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- youtube-parse`
Expected: FAIL nos dois testes novos (recebe `null`).

- [ ] **Step 3: Estender o parser**

Em `lib/db/src/youtube.ts`, trocar a linha do `isYouTube` e a regex do caminho:

```ts
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTube =
    host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtu.be";
  if (!isYouTube) return null;
```

```ts
  // /live/<id> é o link que o botão "Compartilhar" dá numa transmissão ao vivo.
  const m = url.pathname.match(/^\/(embed|shorts|live)\/([^/?]+)/);
  if (m) return { kind: "youtube_video", id: m[2] };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server test -- youtube-parse`
Expected: PASS, todos.

- [ ] **Step 5: Teste do `musicRefFromUrl` que falha**

Criar `artifacts/api-server/src/lib/youtube/__tests__/music.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { musicRefFromUrl } from "../music";

describe("musicRefFromUrl", () => {
  it("vídeo vira youtube_video", () => {
    expect(musicRefFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube_video",
      youtubeId: "dQw4w9WgXcQ",
    });
  });

  it("playlist vira youtube_playlist", () => {
    expect(musicRefFromUrl("https://www.youtube.com/playlist?list=PL1234567890abc")).toEqual({
      kind: "youtube_playlist",
      youtubeId: "PL1234567890abc",
    });
  });

  it("vídeo dentro de playlist vira a playlist", () => {
    expect(musicRefFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abc")).toEqual({
      kind: "youtube_playlist",
      youtubeId: "PL1234567890abc",
    });
  });

  // Review Focus 1: clicar numa música no YouTube dá um link com list=RD…
  // (mix automático). O player embutido não carrega essa lista.
  it("mix automático (list=RD…) toca o vídeo do link, não a lista", () => {
    expect(musicRefFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1")).toEqual({
      kind: "youtube_video",
      youtubeId: "dQw4w9WgXcQ",
    });
  });

  it("mix automático sem vídeo no link não serve", () => {
    expect(musicRefFromUrl("https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ")).toBeNull();
  });

  it("nulo, vazio e link de outro site dão null", () => {
    expect(musicRefFromUrl(null)).toBeNull();
    expect(musicRefFromUrl(undefined)).toBeNull();
    expect(musicRefFromUrl("   ")).toBeNull();
    expect(musicRefFromUrl("https://open.spotify.com/playlist/abc")).toBeNull();
    expect(musicRefFromUrl("lofi para estudar")).toBeNull();
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- youtube/__tests__/music`
Expected: FAIL, módulo `../music` não existe.

- [ ] **Step 7: Implementar**

Criar `artifacts/api-server/src/lib/youtube/music.ts`:

```ts
import { parseYouTubeUrl } from "@workspace/db/youtube";

/** O que o player de música do tv.html carrega. */
export type MusicRef = { kind: "youtube_video" | "youtube_playlist"; youtubeId: string };

/**
 * Link de música de fundo gravado na TV → referência para o player.
 *
 * Quase sempre é o que `parseYouTubeUrl` diz. A exceção é o mix automático:
 * clicar numa música no YouTube leva a `watch?v=X&list=RD…`, uma lista gerada
 * na hora para quem está logado. O player embutido não a carrega e a loja
 * ficaria em silêncio; nesse caso vale o vídeo do link, em laço.
 */
export function musicRefFromUrl(url: string | null | undefined): MusicRef | null {
  if (!url || !url.trim()) return null;
  const ref = parseYouTubeUrl(url);
  if (!ref) return null;
  if (ref.kind === "youtube_playlist" && ref.id.startsWith("RD")) {
    const video = videoDoLink(url);
    return video ? { kind: "youtube_video", youtubeId: video } : null;
  }
  return { kind: ref.kind, youtubeId: ref.id };
}

function videoDoLink(url: string): string | null {
  try {
    return new URL(url.trim()).searchParams.get("v");
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server test -- youtube`
Expected: PASS em `youtube-parse`, `music` e nos demais testes de YouTube.

- [ ] **Step 9: Commit**

```bash
git add lib/db/src/youtube.ts artifacts/api-server/src/lib/youtube/music.ts artifacts/api-server/src/lib/youtube/__tests__/music.test.ts artifacts/api-server/src/lib/__tests__/youtube-parse.test.ts
git commit -m "feat(api): link de música de fundo vira referência do player

Aceita YouTube Music e link de live. Mix automático (list=RD…) não
carrega no player embutido: vale o vídeo do link.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Coluna, contrato, PATCH e feed

**Files:**
- Modify: `lib/db/src/schema/devices.ts`
- Create (gerado): `lib/db/drizzle/0016_*.sql`, `lib/db/drizzle/meta/0016_snapshot.json`, `lib/db/drizzle/meta/_journal.json`
- Modify: `lib/api-spec/openapi.yaml`
- Regenerado: `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`
- Modify: `artifacts/api-server/src/routes/devices.ts`
- Modify: `artifacts/api-server/src/routes/display.ts`
- Test: `artifacts/api-server/src/routes/__tests__/device-update.test.ts`
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `musicRefFromUrl(url: string | null | undefined): { kind: "youtube_video" | "youtube_playlist"; youtubeId: string } | null` de `../lib/youtube/music` (Task 1).
- Produces:
  - `devicesTable.musicUrl` (`text`, nulo).
  - `PATCH /devices/:id` aceita `{ musicUrl: string | null }`; responde 400 `{ error: "Link do YouTube inválido" }`.
  - `Device.musicUrl?: string | null` nas respostas de device e no cliente gerado (`useGetDevice`, `useUpdateDevice`).
  - `GET /display/:deviceKey/feed` devolve `music: { kind, youtubeId } | null`.

- [ ] **Step 1: Coluna no schema**

Em `lib/db/src/schema/devices.ts`, logo depois de `showcase`:

```ts
    // Link do YouTube (vídeo ou playlist) que toca em fundo na TV, só o áudio.
    // Guardado como o admin colou; tipo e ID saem do parser na hora do feed.
    // Nulo = TV sem música.
    musicUrl: text("music_url"),
```

- [ ] **Step 2: Gerar a migration**

O `drizzle.config.ts` exige `DATABASE_URL` mesmo para gerar, mas `generate` não conecta: qualquer valor serve.

Run: `DATABASE_URL=postgres://local/gerar pnpm --filter @workspace/db run generate`
Expected: cria `lib/db/drizzle/0016_<nome>.sql` com exatamente:

```sql
ALTER TABLE "devices" ADD COLUMN "music_url" text;
```

Se o arquivo trouxer qualquer outra instrução, parar: o snapshot `0015` está fora de sincronia com o schema e isso precisa ser resolvido antes.

- [ ] **Step 3: Contrato no openapi**

Em `lib/api-spec/openapi.yaml`:

No schema `Device`, depois de `showcase: { type: boolean }` (não entra em `required`, como `location`):

```yaml
        # Link do YouTube que toca em fundo na TV. Nulo = sem música.
        musicUrl: { type: ["string", "null"] }
```

No schema `DeviceUpdate`, depois de `showcase: { type: boolean }`:

```yaml
        # Link de vídeo ou playlist do YouTube. null ou vazio tira a música.
        musicUrl: { type: ["string", "null"] }
```

No schema `DisplayFeed`, depois do bloco `screen` e antes de `slides` (fora de `required`: a rota pública da vitrine usa o mesmo schema e não manda música):

```yaml
        # Música de fundo da TV. Fora de `slides` de propósito: não é peça,
        # não conta exibição.
        music:
          type: ["object", "null"]
          required: [kind, youtubeId]
          properties:
            kind: { type: string, enum: [youtube_video, youtube_playlist] }
            youtubeId: { type: string }
```

- [ ] **Step 4: Regenerar os clientes**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: termina sem erro (roda o orval e o `typecheck:libs`).

Conferir: `grep -n "musicUrl\|\"music\"" lib/api-zod/src/generated/api.ts | head`
Expected: `musicUrl` aparece nos schemas de device e em `UpdateDeviceBody`; `"music"` aparece em `GetDisplayFeedResponse` como objeto anulável e opcional (`zod.object({ … }).nullish()` ou `.nullable().optional()`).

Se o orval gerar `music` sem aceitar `null`, trocar o bloco do openapi por esta forma equivalente e rodar o codegen de novo:

```yaml
        music:
          oneOf:
            - type: object
              required: [kind, youtubeId]
              properties:
                kind: { type: string, enum: [youtube_video, youtube_playlist] }
                youtubeId: { type: string }
            - type: "null"
```

- [ ] **Step 5: Testes do PATCH que falham**

Acrescentar no fim de `artifacts/api-server/src/routes/__tests__/device-update.test.ts`:

```ts
describe("PATCH /devices/:id — música de fundo", () => {
  it("grava link de vídeo e devolve musicUrl", async () => {
    const link = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [{ ...DEVICE, musicUrl: link }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ musicUrl: link });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ musicUrl: link });
    expect(res.body.musicUrl).toBe(link);
  });

  it("grava link de playlist sem os espaços das pontas", async () => {
    const link = "https://www.youtube.com/playlist?list=PL1234567890abc";
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [{ ...DEVICE, musicUrl: link }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ musicUrl: `  ${link}  ` });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ musicUrl: link });
  });

  it("link inválido é 400 e não toca no banco", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ musicUrl: "https://open.spotify.com/playlist/abc" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Link do YouTube inválido" });
    expect(setMock).not.toHaveBeenCalled();
  });

  it("null tira a música", async () => {
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [{ ...DEVICE, musicUrl: null }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ musicUrl: null });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ musicUrl: null });
    expect(res.body.musicUrl).toBeNull();
  });

  it("string vazia também tira a música", async () => {
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [{ ...DEVICE, musicUrl: null }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ musicUrl: "   " });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ musicUrl: null });
  });

  it("PATCH de outro campo não mexe na música", async () => {
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [DEVICE]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app).patch("/devices/1").send({ name: "TV nova" });

    expect(setMock).toHaveBeenCalledWith({ name: "TV nova" });
  });
});
```

No `vi.mock("@workspace/db", …)` do mesmo arquivo, acrescentar `musicUrl: "musicUrl"` ao objeto `devicesTable`.

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- device-update`
Expected: FAIL em "link inválido é 400" (recebe 404 ou 200), "sem os espaços das pontas" e "string vazia".

- [ ] **Step 7: Implementar o PATCH e devolver `musicUrl`**

Em `artifacts/api-server/src/routes/devices.ts`:

Import, junto dos outros de `../lib`:

```ts
import { musicRefFromUrl } from "../lib/youtube/music";
```

Em `getDeviceWithClient` **e** no `select` de `GET /devices`, depois de `showcase: devicesTable.showcase,`:

```ts
      musicUrl: devicesTable.musicUrl,
```

No `PATCH /devices/:id`, logo depois do bloco `if (!parsed.success) { … }` e antes do `select` da TV atual:

```ts
  // Música de fundo: vazio tira a música; link que o player da TV não
  // consegue tocar é recusado aqui, senão a loja ficaria em silêncio sem
  // ninguém saber por quê.
  const data = { ...parsed.data };
  if (data.musicUrl !== undefined) {
    const link = (data.musicUrl ?? "").trim();
    if (!link) {
      data.musicUrl = null;
    } else if (!musicRefFromUrl(link)) {
      res.status(400).json({ error: "Link do YouTube inválido" });
      return;
    } else {
      data.musicUrl = link;
    }
  }
```

E trocar `.set(parsed.data)` por `.set(data)`. As outras leituras de `parsed.data` (`showcase`, `orientation`) ficam como estão.

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server test -- device-update`
Expected: PASS, todos (os de orientação e vitrine também).

- [ ] **Step 9: Testes do feed que falham**

Em `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`, acrescentar `musicUrl: "musicUrl"` ao `devicesTable` do `vi.mock`, e acrescentar no fim do arquivo:

```ts
describe("GET /display/:deviceKey/feed — música de fundo", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    selectResults = [];
    selectCallIndex = 0;
    panelSlidesForClientMock.mockResolvedValue([]);
  });

  it("TV com link de vídeo recebe music com tipo e ID", async () => {
    selectResults = [
      [{ ...DEVICE_ROW, musicUrl: "https://youtu.be/dQw4w9WgXcQ" }],
      [PLAYLIST_ROW],
      [],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.status).toBe(200);
    expect(res.body.music).toEqual({ kind: "youtube_video", youtubeId: "dQw4w9WgXcQ" });
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
  });

  it("TV com link de playlist recebe a playlist sem resolver os vídeos", async () => {
    selectResults = [
      [{ ...DEVICE_ROW, musicUrl: "https://www.youtube.com/playlist?list=PL1234567890abc" }],
      [PLAYLIST_ROW],
      [],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.body.music).toEqual({ kind: "youtube_playlist", youtubeId: "PL1234567890abc" });
  });

  it("TV sem link recebe music null", async () => {
    selectResults = [[{ ...DEVICE_ROW, musicUrl: null }], [PLAYLIST_ROW], []];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.body.music).toBeNull();
  });

  it("link gravado que deixou de ser reconhecido vira music null, sem derrubar o feed", async () => {
    selectResults = [[{ ...DEVICE_ROW, musicUrl: "isto não é link" }], [PLAYLIST_ROW], []];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.status).toBe(200);
    expect(res.body.music).toBeNull();
    expect(res.body.slides).toHaveLength(1);
  });

  it("a música não vira slide", async () => {
    selectResults = [
      [{ ...DEVICE_ROW, musicUrl: "https://youtu.be/dQw4w9WgXcQ" }],
      [PLAYLIST_ROW],
      [],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).toEqual([101]);
  });

  it("/slides (tv.html antigo) segue sendo só a lista", async () => {
    selectResults = [
      [{ ...DEVICE_ROW, musicUrl: "https://youtu.be/dQw4w9WgXcQ" }],
      [PLAYLIST_ROW],
      [],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/slides");

    expect(Array.isArray(res.body)).toBe(true);
  });
});
```

- [ ] **Step 10: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- display-slides`
Expected: FAIL nos testes de `music` (campo `undefined`).

- [ ] **Step 11: Implementar o feed**

Em `artifacts/api-server/src/routes/display.ts`:

Import:

```ts
import { musicRefFromUrl } from "../lib/youtube/music";
```

No `select` de `loadForTv`, depois de `showcase: devicesTable.showcase,`:

```ts
      musicUrl: devicesTable.musicUrl,
```

Na rota `/display/:deviceKey/feed`, o objeto passado a `GetDisplayFeedResponse.parse` fica:

```ts
    GetDisplayFeedResponse.parse({
      screen: { orientation: deviceOrientationOf(tv.device.orientation) },
      // Fora de `slides`: música não é peça e não conta exibição. Link que o
      // parser não reconhece vira null, e a TV segue só com as peças.
      music: musicRefFromUrl(tv.device.musicUrl),
      slides: tv.slides,
    }),
```

- [ ] **Step 12: Rodar tudo da API e os tipos**

Run: `pnpm --filter @workspace/api-server test`
Expected: PASS, suíte inteira.

Run: `pnpm run typecheck`
Expected: sem erros.

- [ ] **Step 13: Commit**

```bash
git add lib/db/src/schema/devices.ts lib/db/drizzle lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes
git commit -m "feat(api): música de fundo por TV no PATCH e no feed

devices.music_url guarda o link do YouTube. O PATCH recusa link que o
player não toca; o feed da TV devolve music fora de slides, então a
música nunca conta exibição.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Campo no admin

**Files:**
- Create: `artifacts/signage/src/components/device-music-field.tsx`
- Modify: `artifacts/signage/src/pages/device-detail.tsx`
- Modify: `artifacts/signage/src/lib/api-error.ts`
- Test: `artifacts/signage/src/pages/__tests__/device-detail.test.tsx`
- Test: `artifacts/signage/src/lib/__tests__/api-error.test.ts`

**Interfaces:**
- Consumes: `useUpdateDevice`, `getGetDeviceQueryKey` de `@workspace/api-client-react`; `device.musicUrl?: string | null` (Task 2); `mensagemDeErro(err, fallback)` de `@/lib/api-error`.
- Produces: `<DeviceMusicField deviceId={number} musicUrl={string | null} />`.

- [ ] **Step 1: Testes que falham**

Em `artifacts/signage/src/lib/__tests__/api-error.test.ts`, acrescentar dentro do `describe` principal (seguindo o formato dos casos que já estão lá, que passam `{ data: { error: … } }`):

```ts
  it("deixa passar o erro do link de música, que já vem em português", () => {
    expect(mensagemDeErro({ data: { error: "Link do YouTube inválido" } }, "fallback")).toBe(
      "Link do YouTube inválido",
    );
  });
```

Em `artifacts/signage/src/pages/__tests__/device-detail.test.tsx`, acrescentar no fim:

```tsx
describe('música de fundo', () => {
  const LINK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  it('salvar manda o link no PATCH e confirma', async () => {
    const patches: unknown[] = [];
    stubTv(DEVICE, [ANUNCIO], patches);
    renderPagina();

    await userEvent.type(await screen.findByLabelText('Música de fundo (YouTube)'), LINK);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(patches).toEqual([{ musicUrl: LINK }]));
    await waitFor(() => expect(textoNaTela()).toContain('Música de fundo salva.'));
  });

  it('mostra o link gravado e remover manda null', async () => {
    const patches: unknown[] = [];
    stubTv({ ...DEVICE, musicUrl: LINK } as typeof DEVICE, [ANUNCIO], patches);
    renderPagina();

    const campo = (await screen.findByLabelText('Música de fundo (YouTube)')) as HTMLInputElement;
    await waitFor(() => expect(campo.value).toBe(LINK));
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(patches).toEqual([{ musicUrl: null }]));
    await waitFor(() => expect(textoNaTela()).toContain('Música de fundo removida.'));
  });

  it('TV sem música não oferece remover, e salvar fica desligado com o campo vazio', async () => {
    stubTv(DEVICE, [ANUNCIO]);
    renderPagina();

    await screen.findByLabelText('Música de fundo (YouTube)');
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('link recusado pelo servidor aparece no toast e o campo mantém o digitado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
        if (init?.method === 'PATCH') return json({ error: 'Link do YouTube inválido' }, 400);
        if (url.includes('/playlist')) return json([]);
        if (url.includes('/preview')) return json([]);
        if (url.includes('/announcements')) return json([ANUNCIO]);
        if (url.includes('/devices/1')) return json(DEVICE);
        return json([]);
      }),
    );
    renderPagina();

    const campo = (await screen.findByLabelText('Música de fundo (YouTube)')) as HTMLInputElement;
    await userEvent.type(campo, 'https://exemplo.com/musica');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(textoNaTela()).toContain('Link do YouTube inválido'));
    expect(campo.value).toBe('https://exemplo.com/musica');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- device-detail api-error`
Expected: FAIL: não acha o rótulo `Música de fundo (YouTube)`; `mensagemDeErro` devolve `fallback`.

- [ ] **Step 3: Deixar passar o erro do link**

Em `artifacts/signage/src/lib/api-error.ts`, antes do `return fallback;`:

```ts
  // O 400 da música de fundo também já sai do servidor em português.
  if (mensagem === "Link do YouTube inválido") return mensagem;
```

- [ ] **Step 4: Componente**

Criar `artifacts/signage/src/components/device-music-field.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateDevice, getGetDeviceQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { mensagemDeErro } from '@/lib/api-error';

/**
 * Música de fundo da TV: um link do YouTube que o player toca só em áudio,
 * por baixo das peças. Não é peça — não entra na playlist nem conta exibição.
 */
export function DeviceMusicField({ deviceId, musicUrl }: { deviceId: number; musicUrl: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [link, setLink] = useState(musicUrl ?? '');

  // O valor gravado chega depois do primeiro render e muda a cada salvar.
  useEffect(() => setLink(musicUrl ?? ''), [musicUrl]);

  const update = useUpdateDevice({
    mutation: {
      onSuccess: (d) => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(deviceId) });
        toast({ title: d.musicUrl ? 'Música de fundo salva.' : 'Música de fundo removida.' });
      },
      // Sem mexer no campo: quem errou o link quer corrigir o que digitou.
      onError: (err) =>
        toast({
          title: mensagemDeErro(err, 'Não foi possível salvar a música de fundo'),
          variant: 'destructive',
        }),
    },
  });

  const digitado = link.trim();
  const mudou = digitado !== (musicUrl ?? '');

  return (
    <div className="mb-6 rounded-lg border px-3 py-2.5 text-sm">
      <label htmlFor="device-music" className="font-medium">Música de fundo (YouTube)</label>
      <p className="text-muted-foreground mb-2">
        Link de um vídeo ou de uma playlist. A TV toca só o áudio, em laço, e pausa nas peças com som.
      </p>
      <div className="flex items-center gap-2">
        <Input
          id="device-music"
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={link}
          disabled={update.isPending}
          onChange={(e) => setLink(e.target.value)}
        />
        <Button
          size="sm"
          disabled={update.isPending || !digitado || !mudou}
          onClick={() => update.mutate({ id: deviceId, data: { musicUrl: digitado } })}
        >
          Salvar
        </Button>
        {musicUrl && (
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: deviceId, data: { musicUrl: null } })}
          >
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Usar na página**

Em `artifacts/signage/src/pages/device-detail.tsx`:

Import, junto dos outros de `@/components`:

```tsx
import { DeviceMusicField } from '@/components/device-music-field';
```

Logo depois do `</div>` que fecha o bloco do switch "Vitrine da landing" e antes do comentário `{/* Playlist e análises à esquerda…`:

```tsx
      <DeviceMusicField deviceId={deviceId} musicUrl={device.musicUrl ?? null} />
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage test -- device-detail api-error`
Expected: PASS, todos (os de orientação, vitrine e playlist também).

Run: `pnpm run typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src/components/device-music-field.tsx artifacts/signage/src/pages/device-detail.tsx artifacts/signage/src/pages/__tests__/device-detail.test.tsx artifacts/signage/src/lib/api-error.ts artifacts/signage/src/lib/__tests__/api-error.test.ts
git commit -m "feat(portal): campo de música de fundo na página da TV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Player da música no `tv.html`

Cria, troca e destrói o player conforme o feed. Pausa e retomada ficam na Task 5.

**Files:**
- Modify: `artifacts/signage/public/tv.html`
- Test: `artifacts/signage/src/__tests__/tv-html.test.ts`

**Interfaces:**
- Consumes: `data.music` do feed, `{ kind: 'youtube_video' | 'youtube_playlist', youtubeId: string } | null` (Task 2); `loadYtApi(cb, onFail)` que já existe no arquivo.
- Produces (dentro do IIFE do `tv.html`, usados pela Task 5):
  - variáveis `musicaRef` (string ou `null`), `musicaPlayer`, `musicaPronta` (boolean), `musicaPausada` (boolean), `musicaVigia`;
  - funções `aplicarMusica(music)`, `desligarMusica()`;
  - elemento `<div id="musica-slot">`.
- Produces (no teste, usados pela Task 5): variável de módulo `musica`, e no `describe("tv.html: música de fundo do painel")` os helpers `instalarYt()`, `daMusica()`, `dasPecas()`, `musicaTocando()` e o tipo `PlayerDeTeste`.

- [ ] **Step 1: Feed de teste com música**

Em `artifacts/signage/src/__tests__/tv-html.test.ts`:

Junto das outras variáveis de módulo (perto de `let orientacao = "landscape";`):

```ts
// Música de fundo que o /feed devolve (null = TV sem música).
let musica: unknown = null;
```

No `beforeEach` de topo, junto dos outros resets: `musica = null;`

No `XhrStub`, trocar a linha que monta a resposta do `/feed`:

```ts
          ? JSON.stringify({ screen: { orientation: orientacao }, music: musica, slides: listaDeSlides })
```

- [ ] **Step 2: Testes que falham**

Acrescentar no fim do arquivo:

```ts
describe("tv.html: música de fundo do painel", () => {
  /**
   * Player fake do YouTube que serve às peças e à música. `slot` diz em qual
   * contêiner o player foi criado: "yt-slot" é peça, "musica-slot" é música.
   */
  interface PlayerDeTeste {
    slot: string;
    videoId?: string;
    vars: Record<string, unknown>;
    estado: number;
    mudo: boolean;
    volume: number;
    destruido: boolean;
    playCalls: number;
    pauseCalls: number;
    nextCalls: number;
    lanca: boolean;
    eventos: {
      onReady: (e: { target: PlayerDeTeste }) => void;
      onStateChange?: (e: { data: number; target: PlayerDeTeste }) => void;
      onError?: (e: { data: number; target: PlayerDeTeste }) => void;
    };
  }
  let players: PlayerDeTeste[] = [];
  // Construtor do player da música lança (Review Focus 4).
  let construtorDaMusicaLanca = false;

  const VIDEO = { kind: "youtube_video", youtubeId: "MMMMMMMMMMM" };
  const PLAYLIST = { kind: "youtube_playlist", youtubeId: "PLmusica123" };

  const video = (announcementId: number, youtubeId: string, audioMode = "muted") => ({
    ...slide(announcementId, ""),
    imageUrl: null,
    mediaKind: "youtube_video",
    youtubeId,
    playbackMode: "natural",
    audioMode,
  });

  function instalarYt() {
    class PlayerStub {
      slot: string;
      videoId?: string;
      vars: Record<string, unknown>;
      estado = -1;
      mudo = true;
      volume = 0;
      destruido = false;
      playCalls = 0;
      pauseCalls = 0;
      nextCalls = 0;
      lanca = false;
      eventos: PlayerDeTeste["eventos"];
      constructor(
        holder: HTMLElement,
        opts: { videoId?: string; playerVars?: Record<string, unknown>; events: PlayerDeTeste["eventos"] },
      ) {
        this.slot = holder.parentElement?.id ?? "";
        if (this.slot === "musica-slot" && construtorDaMusicaLanca) throw new Error("player quebrado");
        this.videoId = opts.videoId;
        this.vars = opts.playerVars ?? {};
        this.eventos = opts.events;
        players.push(this as unknown as PlayerDeTeste);
      }
      private falha() { if (this.lanca) throw new Error("player quebrado"); }
      playVideo() { this.falha(); this.playCalls += 1; this.estado = 1; }
      pauseVideo() { this.falha(); this.pauseCalls += 1; this.estado = 2; }
      nextVideo() { this.nextCalls += 1; }
      mute() { this.mudo = true; }
      unMute() { this.mudo = false; }
      setVolume(v: number) { this.volume = v; }
      getPlayerState() { this.falha(); return this.estado; }
      seekTo() {}
      getCurrentTime() { return 0; }
      getDuration() { return 0; }
      destroy() { this.destruido = true; }
    }
    vi.stubGlobal("YT", {
      Player: PlayerStub,
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 },
    });
  }

  beforeEach(() => {
    players = [];
    construtorDaMusicaLanca = false;
    instalarYt();
  });

  const daMusica = () => players.filter((p) => p.slot === "musica-slot");
  const dasPecas = () => players.filter((p) => p.slot === "yt-slot");
  /** Player da música em uso, já pronto (como o iframe avisaria). */
  function musicaTocando(): PlayerDeTeste {
    const m = daMusica().filter((p) => !p.destruido).pop()!;
    m.eventos.onReady({ target: m });
    return m;
  }

  describe("criação", () => {
    it("vídeo: player fora do palco, em laço, com som e tocando", () => {
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();

      expect(daMusica()).toHaveLength(1);
      const m = daMusica()[0];
      expect(m.videoId).toBe("MMMMMMMMMMM");
      // O laço de vídeo único só funciona com o próprio ID em `playlist`.
      expect(m.vars).toMatchObject({ loop: 1, playlist: "MMMMMMMMMMM", controls: 0 });
      expect(document.getElementById("musica-slot")!.closest("#stage")).toBeNull();

      m.eventos.onReady({ target: m });
      expect(m.mudo).toBe(false);
      expect(m.volume).toBe(100);
      expect(m.playCalls).toBe(1);
    });

    it("playlist: o player carrega a lista pelo ID e recomeça no fim", () => {
      musica = PLAYLIST;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();

      const m = daMusica()[0];
      expect(m.videoId).toBeUndefined();
      expect(m.vars).toMatchObject({ listType: "playlist", list: "PLmusica123", loop: 1 });
    });

    it("TV sem música não cria player", () => {
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      expect(daMusica()).toHaveLength(0);
    });

    it("feed de servidor antigo (sem o campo music) não cria player", () => {
      musica = undefined;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      expect(daMusica()).toHaveLength(0);
    });

    it("lista de slides vazia toca a música mesmo assim", () => {
      musica = VIDEO;
      listaDeSlides = [];
      carregarTv();

      expect(daMusica()).toHaveLength(1);
      expect(musicaTocando().playCalls).toBe(1);
    });

    it("erro num vídeo da playlist pula para o próximo", () => {
      musica = PLAYLIST;
      carregarTv();
      const m = musicaTocando();

      m.eventos.onError!({ data: 150, target: m });

      expect(m.nextCalls).toBe(1);
    });
  });

  describe("refresh do feed", () => {
    it("mesma música: o player continua o mesmo", () => {
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      const m = musicaTocando();

      vi.advanceTimersByTime(60000);

      expect(daMusica()).toHaveLength(1);
      expect(m.destruido).toBe(false);
    });

    it("outro link: destrói o player e cria o novo", () => {
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      const antigo = musicaTocando();

      musica = PLAYLIST;
      vi.advanceTimersByTime(60000);

      expect(antigo.destruido).toBe(true);
      expect(daMusica()).toHaveLength(2);
      expect(daMusica()[1].vars).toMatchObject({ list: "PLmusica123" });
    });

    it("música removida: destrói o player", () => {
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      const m = musicaTocando();

      musica = null;
      vi.advanceTimersByTime(60000);

      expect(m.destruido).toBe(true);
      expect(document.getElementById("musica-slot")!.innerHTML).toBe("");
    });

    it("feed que falha mantém a música", () => {
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      const m = musicaTocando();

      statusDaLista = 0;
      vi.advanceTimersByTime(60000);

      expect(m.destruido).toBe(false);
      expect(daMusica()).toHaveLength(1);
    });

    it("TV apagada no servidor (pareamento) desliga a música", () => {
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      const m = musicaTocando();

      statusDaLista = 404;
      vi.advanceTimersByTime(60000);

      expect(m.destruido).toBe(true);
    });
  });

  describe("fora das métricas", () => {
    it("a música não gera exibição", () => {
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      musicaTocando();
      responder("https://blob/a.png", true);

      vi.advanceTimersByTime(5080);

      expect(exibicoes().map((e) => e.announcementId)).toEqual([1]);
    });
  });

  describe("vigia", () => {
    it("música que parou sozinha volta a tocar", () => {
      musica = VIDEO;
      carregarTv();
      const m = musicaTocando();
      m.estado = 2; // parou sem ninguém pedir

      vi.advanceTimersByTime(30000);

      expect(m.playCalls).toBe(2);
      expect(m.mudo).toBe(false);
    });

    it("música tocando ou carregando não leva play de novo", () => {
      musica = VIDEO;
      carregarTv();
      const m = musicaTocando();

      vi.advanceTimersByTime(30000);
      m.estado = 3;
      vi.advanceTimersByTime(30000);

      expect(m.playCalls).toBe(1);
    });

    it("player que ainda não ficou pronto não leva play", () => {
      musica = VIDEO;
      carregarTv();

      vi.advanceTimersByTime(30000);

      expect(daMusica()[0].playCalls).toBe(0);
    });
  });

  describe("falhas da música não param as peças", () => {
    // Review Focus 4.
    it("construtor do player que lança", () => {
      construtorDaMusicaLanca = true;
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png"), slide(2, "https://blob/b.png")];
      carregarTv();
      responder("https://blob/a.png", true);
      expect(noAr()).toBe("https://blob/a.png");

      vi.advanceTimersByTime(5080);
      responder("https://blob/b.png", true);

      expect(noAr()).toBe("https://blob/b.png");
    });

    it("player que lança na vigia", () => {
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      const m = musicaTocando();
      m.lanca = true;
      responder("https://blob/a.png", true);

      expect(() => vi.advanceTimersByTime(35080)).not.toThrow();
      expect(exibicoes().length).toBeGreaterThan(0);
    });

    // Review Focus 5.
    it("API do YouTube que não carrega: peças de imagem seguem", () => {
      vi.stubGlobal("YT", undefined);
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      responder("https://blob/a.png", true);

      vi.advanceTimersByTime(7000);

      expect(daMusica()).toHaveLength(0);
      expect(exibicoes().map((e) => e.announcementId)).toEqual([1]);
    });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- tv-html`
Expected: FAIL nos testes de "criação", "refresh do feed" e "vigia" (nenhum player em `musica-slot`). Os testes antigos do arquivo seguem passando.

- [ ] **Step 4: Contêiner da música**

Em `artifacts/signage/public/tv.html`, logo depois do `</div>` que fecha `<div id="stage">` e antes de `<div id="fs-hint">`:

```html
  <!-- Player da música de fundo. Fora do palco (não gira com a TV) e fora da
       área visível, mas com tamanho de verdade: player com display:none pode
       não iniciar. -->
  <div id="musica-slot" aria-hidden="true" style="position:fixed;left:-400px;top:0;width:200px;height:200px;overflow:hidden;"></div>
```

- [ ] **Step 5: Estado**

No bloco `// ─── State ───`, depois de `var ytSlot = document.getElementById('yt-slot');`:

```js
      // Música de fundo do painel: um segundo player do YouTube, só áudio,
      // que vive entre os slides. Não é peça: não conta exibição.
      var musicaSlot    = document.getElementById('musica-slot');
      var musicaRef     = null;    // kind + ':' + youtubeId do que está carregado
      var musicaPlayer  = null;
      var musicaPronta  = false;   // o player já avisou onReady
      var musicaPausada = false;   // há peça com som no ar
      var musicaVigia   = null;
      var MUSICA_VIGIA_MS = 30000;
```

- [ ] **Step 6: Funções da música**

Logo antes da função `avisarApp` (depois de `loadYtApi`), acrescentar:

```js
      // ─── Música de fundo ───────────────────────────────────────────────────
      // Tudo aqui em try/catch: música com defeito nunca para as peças.
      function desligarMusica() {
        musicaRef = null;
        musicaPronta = false;
        if (musicaVigia) { clearInterval(musicaVigia); musicaVigia = null; }
        if (musicaPlayer) {
          try { musicaPlayer.destroy(); } catch (e) {}
          musicaPlayer = null;
        }
        musicaSlot.innerHTML = '';
      }

      // A música para sozinha por vários motivos: erro passageiro, vídeo que
      // o YouTube travou, autoplay negado. De tempos em tempos, dá o play de
      // novo. Nunca põe no mudo: música muda não serve para nada.
      function vigiarMusica() {
        if (!musicaPlayer || !musicaPronta || musicaPausada) { return; }
        try {
          var estado = musicaPlayer.getPlayerState();
          var S = window.YT.PlayerState;
          if (estado === S.PLAYING || estado === S.BUFFERING) { return; }
          musicaPlayer.playVideo();
        } catch (e) {}
      }

      function criarPlayerDaMusica(music) {
        var holder = document.createElement('div');
        musicaSlot.innerHTML = '';
        musicaSlot.appendChild(holder);

        // autoplay 0: quem dá o play é o onReady, que sabe se há peça com
        // som no ar.
        var vars = {
          autoplay: 0, loop: 1, controls: 0, rel: 0,
          playsinline: 1, disablekb: 1, fs: 0
        };
        var opts = { width: '200', height: '200', playerVars: vars };
        if (music.kind === 'youtube_playlist') {
          // O player carrega a playlist pelo ID: não depende da API key do
          // servidor nem gasta cota.
          vars.listType = 'playlist';
          vars.list = music.youtubeId;
        } else {
          opts.videoId = music.youtubeId;
          // O laço de vídeo único só vale com o próprio ID em `playlist`.
          vars.playlist = music.youtubeId;
        }
        opts.events = {
          onReady: function (e) {
            musicaPronta = true;
            try {
              e.target.unMute();
              e.target.setVolume(100);
              if (!musicaPausada) { e.target.playVideo(); }
            } catch (err) {}
          },
          onError: function (e) {
            // Vídeo da playlist que não toca (embed bloqueado, removido):
            // segue para o próximo. Vídeo único fica para a vigia.
            if (music.kind === 'youtube_playlist') {
              try { e.target.nextVideo(); } catch (err) {}
            }
          }
        };
        musicaPlayer = new window.YT.Player(holder, opts);
        musicaVigia = setInterval(vigiarMusica, MUSICA_VIGIA_MS);
      }

      // Chamada a cada feed lido com sucesso. `music` é o que o servidor
      // mandou: { kind, youtubeId }, null (TV sem música) ou undefined
      // (servidor antigo).
      function aplicarMusica(music) {
        var valida = music && music.youtubeId &&
          (music.kind === 'youtube_video' || music.kind === 'youtube_playlist');
        var ref = valida ? music.kind + ':' + music.youtubeId : null;
        if (ref === musicaRef) { return; }
        desligarMusica();
        if (!ref) { return; }
        musicaRef = ref;
        loadYtApi(function () {
          // O feed pode ter trocado a música enquanto a API carregava.
          if (musicaRef !== ref || musicaPlayer) { return; }
          try { criarPlayerDaMusica(music); } catch (e) { desligarMusica(); }
        }, function () {
          // Sem a API do YouTube não há música. Zera a referência para o
          // próximo feed tentar de novo e para a ponte com o app Android
          // (Spotify) voltar a valer.
          if (musicaRef === ref) { musicaRef = null; }
        });
      }
```

- [ ] **Step 7: Ligar ao feed e ao pareamento**

Em `fetchAndStart`, logo depois de `hidePairing();` e antes de `var girou = applyOrientation(…)`:

```js
          // Antes do teste de lista vazia: a música vale mesmo sem peças.
          aplicarMusica(data.music);
```

Em `showPairing`, logo depois de `showEmpty();`:

```js
        // TV que o servidor não conhece não toca nada, nem música.
        desligarMusica();
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage test -- tv-html`
Expected: PASS, arquivo inteiro.

- [ ] **Step 9: Conferir que o arquivo segue ES5 e sem escape unicode**

Run: `git diff -U0 artifacts/signage/public/tv.html | grep -E '^\+.*(=>|\blet |\bconst |\\u[0-9a-fA-F]{4})'`
Expected: sem saída.

- [ ] **Step 10: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts
git commit -m "feat(tv): player de música de fundo do YouTube

Segundo player, fora da tela, criado a partir de music no feed. Segue o
feed: troca quando o link muda, some quando a música é removida. Fora
de slides, então não conta exibição.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pausa na peça com som, retomada e ponte com o app

**Files:**
- Modify: `artifacts/signage/public/tv.html`
- Modify: `artifacts/android-tv/README.md`
- Test: `artifacts/signage/src/__tests__/tv-html.test.ts`

**Interfaces:**
- Consumes (Task 4): `musicaRef`, `musicaPlayer`, `musicaPronta`, `musicaPausada`; no teste, `musica`, `VIDEO`, `video()`, `daMusica()`, `dasPecas()`, `musicaTocando()`, `PlayerDeTeste`.
- Produces: `pausarMusica()`, `retomarMusica()`, variáveis `musicaRetomada`, `appAvisado`, constante `MUSICA_RETOMAR_MS = 500`; no teste, `pecaNoAr()` e `terminarPeca()`.

- [ ] **Step 1: Testes que falham**

Dentro do `describe("tv.html: música de fundo do painel", …)`, depois do bloco `describe("falhas da música não param as peças", …)`:

```ts
  /**
   * Peça de vídeo no ar, pronta e tocando. Sem isto o player da peça nunca
   * avisa onReady e, em 5 s, a TV desiste dele e cai no fallback de imagem —
   * o que derruba a peça no meio de um teste que avança o relógio.
   */
  function pecaNoAr(): PlayerDeTeste {
    const p = dasPecas().filter((x) => !x.destruido).pop()!;
    p.eventos.onReady({ target: p });
    p.estado = 1;
    return p;
  }

  /** Leva a peça de vídeo no ar até o fim natural. */
  function terminarPeca() {
    const p = pecaNoAr();
    p.eventos.onStateChange!({ data: 0, target: p });
  }

  describe("peça com som", () => {

    it("pausa a música quando entra e retoma quando sai", () => {
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png"), video(2, "BBBBBBBBBBB", "sound")];
      carregarTv();
      const m = musicaTocando();
      responder("https://blob/a.png", true);
      expect(m.pauseCalls).toBe(0);

      vi.advanceTimersByTime(5080); // entra a peça com som
      expect(m.pauseCalls).toBe(1);

      terminarPeca(); // volta para a imagem
      expect(m.playCalls).toBe(1); // ainda não: a retomada tem atraso
      vi.advanceTimersByTime(500);
      expect(m.playCalls).toBe(2);
    });

    it("peça de vídeo muda não pausa a música", () => {
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png"), video(2, "BBBBBBBBBBB")];
      carregarTv();
      const m = musicaTocando();
      responder("https://blob/a.png", true);

      vi.advanceTimersByTime(5080);
      terminarPeca();
      vi.advanceTimersByTime(500);

      expect(m.pauseCalls).toBe(0);
      expect(m.playCalls).toBe(1);
    });

    it("duas peças com som seguidas: a música não toca entre elas", () => {
      musica = VIDEO;
      listaDeSlides = [video(1, "AAAAAAAAAAA", "sound"), video(2, "BBBBBBBBBBB", "sound")];
      carregarTv();
      const m = musicaTocando();
      expect(m.playCalls).toBe(0);

      terminarPeca(); // sai a 1, entra a 2
      vi.advanceTimersByTime(600);

      expect(m.playCalls).toBe(0);
    });

    // Review Focus 3.
    it("música que fica pronta no meio de uma peça com som espera a peça sair", () => {
      musica = VIDEO;
      listaDeSlides = [video(1, "AAAAAAAAAAA", "sound"), slide(2, "https://blob/b.png")];
      carregarTv();

      const m = musicaTocando(); // onReady com a peça com som no ar
      expect(m.playCalls).toBe(0);
      expect(m.mudo).toBe(false);

      terminarPeca();
      vi.advanceTimersByTime(500);
      expect(m.playCalls).toBe(1);
    });

    // Review Focus 3.
    it("música trocada pelo admin durante uma peça com som não toca por cima", () => {
      musica = VIDEO;
      listaDeSlides = [video(1, "AAAAAAAAAAA", "sound")];
      carregarTv();
      musicaTocando();
      pecaNoAr();

      musica = { kind: "youtube_video", youtubeId: "NNNNNNNNNNN" };
      vi.advanceTimersByTime(60000);
      const nova = musicaTocando();

      expect(nova.videoId).toBe("NNNNNNNNNNN");
      expect(nova.playCalls).toBe(0);
    });

    it("peça com som que cai no fallback de imagem devolve a música", () => {
      musica = VIDEO;
      listaDeSlides = [{ ...video(1, "AAAAAAAAAAA", "sound"), playbackMode: "capped" }, slide(2, "https://blob/b.png")];
      carregarTv();
      const m = musicaTocando();
      expect(m.playCalls).toBe(0);

      // O player da peça nunca fica pronto: em 5 s a TV desiste e mostra a miniatura.
      vi.advanceTimersByTime(5500);

      expect(m.playCalls).toBe(1);
    });

    it("vigia não dá play com peça com som no ar", () => {
      musica = VIDEO;
      listaDeSlides = [video(1, "AAAAAAAAAAA", "sound")];
      carregarTv();
      const m = musicaTocando();
      pecaNoAr();

      vi.advanceTimersByTime(30000);

      expect(m.playCalls).toBe(0);
    });

    // Review Focus 4.
    it("player da música que lança ao pausar e ao tocar não trava as peças", () => {
      musica = VIDEO;
      listaDeSlides = [video(1, "AAAAAAAAAAA", "sound"), video(2, "BBBBBBBBBBB", "sound")];
      carregarTv();
      const m = musicaTocando();
      m.lanca = true;

      terminarPeca();
      vi.advanceTimersByTime(600);

      expect(dasPecas().filter((x) => !x.destruido).pop()!.videoId).toBe("BBBBBBBBBBB");
    });
  });

  describe("ponte com o app Android", () => {
    let avisos: string[] = [];

    beforeEach(() => {
      avisos = [];
      vi.stubGlobal("SignageNative", {
        somIniciou: () => avisos.push("somIniciou"),
        somTerminou: () => avisos.push("somTerminou"),
      });
    });

    it("com música do painel, o app não é avisado: senão ele ligaria o Spotify por cima", () => {
      musica = VIDEO;
      listaDeSlides = [video(1, "AAAAAAAAAAA", "sound"), video(2, "BBBBBBBBBBB")];
      carregarTv();
      musicaTocando();

      terminarPeca();

      expect(avisos).toEqual([]);
    });

    it("sem música do painel, a ponte segue como antes", () => {
      listaDeSlides = [video(1, "AAAAAAAAAAA", "sound"), video(2, "BBBBBBBBBBB")];
      carregarTv();

      terminarPeca();

      expect(avisos).toEqual(["somIniciou", "somTerminou"]);
    });

    it("música ligada no meio da peça: o app que ouviu o início ouve o fim", () => {
      listaDeSlides = [video(1, "AAAAAAAAAAA", "sound"), video(2, "BBBBBBBBBBB")];
      carregarTv();
      pecaNoAr();
      expect(avisos).toEqual(["somIniciou"]);

      musica = VIDEO;
      vi.advanceTimersByTime(60000);
      terminarPeca();

      expect(avisos).toEqual(["somIniciou", "somTerminou"]);
    });

    it("música removida no meio da peça: o app que não ouviu o início não ouve o fim", () => {
      musica = VIDEO;
      listaDeSlides = [video(1, "AAAAAAAAAAA", "sound"), video(2, "BBBBBBBBBBB")];
      carregarTv();
      musicaTocando();
      pecaNoAr();

      musica = null;
      vi.advanceTimersByTime(60000);
      terminarPeca();

      expect(avisos).toEqual([]);
    });

    // Review Focus 5: sem a API do YouTube não há música do painel tocando,
    // então o Spotify de fundo volta a ser assunto do app.
    it("música configurada mas API do YouTube fora: a ponte volta a valer", () => {
      vi.stubGlobal("YT", undefined);
      musica = VIDEO;
      listaDeSlides = [slide(1, "https://blob/a.png")];
      carregarTv();
      vi.advanceTimersByTime(7000); // a API desiste de carregar

      listaDeSlides = [video(9, "AAAAAAAAAAA", "sound"), slide(1, "https://blob/a.png")];
      vi.advanceTimersByTime(60000); // lista nova: recomeça pela peça com som

      expect(avisos[0]).toBe("somIniciou");
    });
  });
```

Nota sobre o último teste: `loadYtApi` marca `ytApiUnavailable` para sempre depois de desistir. No refresh, `aplicarMusica` tenta de novo, a API falha na hora e `musicaRef` volta a `null`; a peça de vídeo cai no fallback de imagem. `playYouTube` avisa o app **antes** de chamar `loadYtApi`, e é isso que o teste verifica: com `musicaRef` nulo, o aviso sai.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- tv-html`
Expected: FAIL nos blocos "peça com som" e "ponte com o app Android" (`pauseCalls` 0; `avisos` com `somIniciou` quando há música).

- [ ] **Step 3: Estado**

Em `tv.html`, junto das variáveis da música criadas na Task 4:

```js
      var musicaRetomada = null;   // timer da retomada depois da peça com som
      var MUSICA_RETOMAR_MS = 500;
      var appAvisado    = false;   // somIniciou foi mandado para esta peça
```

- [ ] **Step 4: Pausar e retomar**

Logo depois de `aplicarMusica`:

```js
      // Peça com som entrou: a música cede a vez. Vale mesmo sem música
      // configurada, para a que for ligada no meio da peça não tocar por cima.
      function pausarMusica() {
        if (musicaRetomada) { clearTimeout(musicaRetomada); musicaRetomada = null; }
        musicaPausada = true;
        if (musicaPlayer && musicaPronta) {
          try { musicaPlayer.pauseVideo(); } catch (e) {}
        }
      }

      // Peça com som saiu. Com atraso: showSlide derruba um player e logo
      // cria o seguinte; duas peças com som em sequência dariam um estalo de
      // música entre elas. A segunda cancela esta retomada antes de ela valer.
      function retomarMusica() {
        if (musicaRetomada) { clearTimeout(musicaRetomada); }
        musicaRetomada = setTimeout(function () {
          musicaRetomada = null;
          musicaPausada = false;
          if (musicaPlayer && musicaPronta) {
            try { musicaPlayer.playVideo(); } catch (e) {}
          }
        }, MUSICA_RETOMAR_MS);
      }
```

- [ ] **Step 5: Ganchos na peça**

Em `teardownYt`, trocar a linha

```js
        if (somNoAr) { somNoAr = false; avisarApp('somTerminou'); }
```

por

```js
        if (somNoAr) {
          somNoAr = false;
          retomarMusica();
          // Só fecha o que foi aberto: o app que não ouviu o começo guardaria
          // um "havia música" velho e ligaria o Spotify sem motivo.
          if (appAvisado) { appAvisado = false; avisarApp('somTerminou'); }
        }
```

Em `playYouTube`, trocar o comentário e a linha

```js
        // Avisa antes de criar o player: é o momento em que nada nosso toca,
        // então o app consegue ver se havia música de fundo.
        if (slide.audioMode === 'sound') { somNoAr = true; avisarApp('somIniciou'); }
```

por

```js
        if (slide.audioMode === 'sound') {
          somNoAr = true;
          // Com música do painel, o app fica de fora: ele veria a nossa
          // música como "havia música antes" e, no fim da peça, mandaria
          // play ao Spotify por cima dela.
          // Sem música do painel, avisa antes de criar o player: é o momento
          // em que nada nosso toca, então o app consegue ver se havia música
          // de fundo (Spotify).
          if (!musicaRef) { appAvisado = true; avisarApp('somIniciou'); }
          pausarMusica();
        }
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage test -- tv-html`
Expected: PASS, arquivo inteiro, inclusive o bloco antigo `música de fundo no app Android` (linha ~825), que roda sem música do painel.

- [ ] **Step 7: Conferir ES5 e escapes no que foi acrescentado**

Run: `git diff -U0 artifacts/signage/public/tv.html | grep -E '^\+.*(=>|\blet |\bconst |\\u[0-9a-fA-F]{4})'`
Expected: sem saída.

- [ ] **Step 8: Nota no README do app Android**

Em `artifacts/android-tv/README.md`, logo depois do item que começa em `- Música de fundo (ex.: Spotify aberto na box, tocando em segundo plano): a` (linha ~207, até o fim desse item), acrescentar um item novo:

```markdown
- Música de fundo do painel (link do YouTube configurado na TV, no admin): toca
  dentro do próprio `tv.html` e não depende do app. Com ela ligada, o `tv.html`
  não chama `somIniciou`/`somTerminou`, então o app não mexe no Spotify. É uma
  ou outra: Spotify e música do painel na mesma TV disputam o áudio.
```

- [ ] **Step 9: Suítes inteiras e tipos**

Run: `pnpm --filter @workspace/signage test && pnpm --filter @workspace/api-server test && pnpm run typecheck`
Expected: PASS em tudo, sem erro de tipo.

- [ ] **Step 10: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts artifacts/android-tv/README.md
git commit -m "feat(tv): música de fundo pausa na peça com som e retoma depois

A retomada espera 500 ms para duas peças com som seguidas não deixarem
a música estalar entre elas. Com música do painel, o tv.html não avisa
o app Android: ele ligaria o Spotify por cima.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Depois das tarefas

- **Teste na box real** (não automatizável, e é onde estão os riscos da spec): configurar um link de live no admin, abrir a TV pelo app Android e conferir (1) a música começa sozinha, (2) pausa numa peça com som e volta, (3) peça de vídeo muda toca junto com a música sem engasgar, (4) vídeo com embed bloqueado fica em silêncio e as peças seguem.
- **PR:** título `feat(tv): música de fundo por YouTube` (sobe minor). Merge com `gh pr merge --merge`. Não escrever `BREAKING CHANGE:` no início de linha da descrição.
- **Deploy:** a migration `0016` roda no build da Vercel (`scripts/build-vercel.mjs`). A coluna é nula e sem default: servidor antigo e novo convivem durante o deploy.
