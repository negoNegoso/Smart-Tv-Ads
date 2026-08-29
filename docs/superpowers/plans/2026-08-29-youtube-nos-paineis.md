# YouTube nos painéis — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir intercalar vídeos e playlists do YouTube na exibição dos painéis, nos modos anunciante (campanha) e dispositivo (playlist), com fallback automático em dispositivos que não conseguem tocar embed.

**Architecture:** Uma peça (`announcements`) ganha `mediaKind`/`youtubeId`/`playbackMode`/`audioMode`; como os dois modos reusam `announcements`, ambos funcionam de graça. O endpoint de slides enriquece cada slide com esses campos e, para playlists, resolve os `videoId`s no servidor (YouTube Data API + cache). Os dois players (React `/display` e ES5 `tv.html`) tocam via IFrame Player API, com detecção de capacidade e fallback para a thumbnail.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL), Express, React + Vite, Vitest, orval (OpenAPI codegen), YouTube IFrame Player API + YouTube Data API v3.

---

## Referência da spec

`docs/superpowers/specs/2026-08-29-youtube-nos-paineis-design.md`

## Estrutura de arquivos (o que cada tarefa cria/altera)

- `lib/db/src/youtube.ts` — **novo**. Parser puro de URL do YouTube + helper de thumbnail. Exportado como `@workspace/db/youtube` (espelha o padrão `@workspace/db/scan-code`).
- `lib/db/package.json` — adicionar subpath export `./youtube`.
- `lib/db/src/schema/announcements.ts` — novas colunas.
- `lib/api-spec/openapi.yaml` — novos campos em `DisplaySlide`, `Announcement`, `AnnouncementInput`, `AnnouncementUpdate`.
- `artifacts/api-server/src/lib/youtube/playlist-resolver.ts` — **novo**. Resolve playlist → `videoId[]` com cache.
- `artifacts/api-server/src/lib/youtube/__tests__/playlist-resolver.test.ts` — **novo**.
- `lib/db/src/__tests__/youtube.test.ts` — **novo** (parser). *(ver Task 1 para localização do runner)*
- `artifacts/api-server/src/routes/announcements.ts` — aceitar campos de YouTube; imagem opcional; guardas de remoção.
- `artifacts/api-server/src/routes/display.ts` — enriquecer slides + resolver playlists.
- `artifacts/signage/src/components/youtube-slide.tsx` — **novo**. Player React.
- `artifacts/signage/src/pages/display.tsx` — integrar `YouTubeSlide`.
- `artifacts/signage/public/tv.html` — player ES5 + fallback.
- `artifacts/signage/src/pages/admin.tsx` — seletor de tipo + campos de YouTube + badge.
- `artifacts/signage/package.json` — depender de `@workspace/db` (só o subpath puro).
- `README.md` — documentar `YOUTUBE_API_KEY`.

## Valores canônicos (usar exatamente estes em todas as tarefas)

- `mediaKind`: `"image"` | `"youtube_video"` | `"youtube_playlist"`
- `playbackMode`: `"natural"` | `"capped"`
- `audioMode`: `"muted"` | `"sound"`
- Thumbnail: `https://img.youtube.com/vi/<videoId>/hqdefault.jpg`

---

## Task 1: Parser de URL do YouTube (shared, TDD)

**Files:**
- Create: `lib/db/src/youtube.ts`
- Create: `lib/db/src/__tests__/youtube.test.ts`
- Modify: `lib/db/package.json`

> Nota de runner: hoje os testes de `@workspace/db/scan-code` vivem em `artifacts/api-server/src/lib/__tests__/scan-code.test.ts` e rodam pelo Vitest da API. Para manter um só runner, o teste do parser também fica na API. Crie o arquivo em `artifacts/api-server/src/lib/__tests__/youtube-parse.test.ts` (não em `lib/db`). O caminho `lib/db/src/__tests__/youtube.test.ts` acima fica **cancelado** — use o da API abaixo.

- [ ] **Step 1: Escrever o teste que falha**

Create `artifacts/api-server/src/lib/__tests__/youtube-parse.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseYouTubeUrl, youtubeThumbnailUrl } from "@workspace/db/youtube";

describe("parseYouTubeUrl", () => {
  it("reconhece watch?v=", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube_video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("reconhece youtu.be", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "youtube_video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("reconhece playlist?list=", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/playlist?list=PL1234567890abc")).toEqual({
      kind: "youtube_playlist",
      id: "PL1234567890abc",
    });
  });

  it("prioriza playlist quando há v= e list= juntos", () => {
    expect(
      parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abc"),
    ).toEqual({ kind: "youtube_playlist", id: "PL1234567890abc" });
  });

  it("retorna null para URL inválida", () => {
    expect(parseYouTubeUrl("https://example.com/video")).toBeNull();
    expect(parseYouTubeUrl("não é url")).toBeNull();
  });
});

describe("youtubeThumbnailUrl", () => {
  it("monta a URL da thumbnail hqdefault", () => {
    expect(youtubeThumbnailUrl("dQw4w9WgXcQ")).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/youtube-parse.test.ts`
Expected: FAIL — `Cannot find module '@workspace/db/youtube'`.

- [ ] **Step 3: Implementar o parser**

Create `lib/db/src/youtube.ts`:

```typescript
export type YouTubeRef =
  | { kind: "youtube_video"; id: string }
  | { kind: "youtube_playlist"; id: string };

/**
 * Extrai o ID de vídeo ou de playlist de uma URL do YouTube.
 * Playlist tem prioridade: um link "watch?v=...&list=..." é tratado como playlist.
 * Retorna null quando a URL não é reconhecida.
 */
export function parseYouTubeUrl(input: string): YouTubeRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTube = host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  if (!isYouTube) return null;

  const list = url.searchParams.get("list");
  if (list) return { kind: "youtube_playlist", id: list };

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? { kind: "youtube_video", id } : null;
  }

  const v = url.searchParams.get("v");
  if (v) return { kind: "youtube_video", id: v };

  // /embed/<id> ou /shorts/<id>
  const m = url.pathname.match(/^\/(embed|shorts)\/([^/?]+)/);
  if (m) return { kind: "youtube_video", id: m[2] };

  return null;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
```

Modify `lib/db/package.json` — adicionar o subpath no bloco `exports` (depois de `./scan-code`):

```json
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./scan-code": "./src/scan-code.ts",
    "./youtube": "./src/youtube.ts"
  },
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/youtube-parse.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/youtube.ts lib/db/package.json artifacts/api-server/src/lib/__tests__/youtube-parse.test.ts
git commit -m "feat(youtube): parser de URL e helper de thumbnail compartilhados

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Colunas de YouTube no schema

**Files:**
- Modify: `lib/db/src/schema/announcements.ts`

- [ ] **Step 1: Adicionar as colunas**

Substituir o corpo de `announcementsTable` em `lib/db/src/schema/announcements.ts` por (mudanças: `imageUrl` vira nullable + 4 colunas novas):

```typescript
export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  // Texto que vai ao ar na TV. Separado do `title`, que é só rótulo interno do painel.
  displayText: text("display_text"),
  showText: boolean("show_text").notNull().default(false),
  // Imagem da peça. Para peças de YouTube é opcional (fallback custom); quando
  // ausente, o poster é derivado da thumbnail do YouTube.
  imageUrl: text("image_url"),
  // "image" | "youtube_video" | "youtube_playlist"
  mediaKind: text("media_kind").notNull().default("image"),
  // ID do vídeo ou da playlist do YouTube (null para imagem).
  youtubeId: text("youtube_id"),
  // "natural" (toca até o fim) | "capped" (limita a `duration` segundos).
  playbackMode: text("playback_mode").notNull().default("capped"),
  // "muted" | "sound" (tenta com som; se autoplay com som falhar, segue mudo).
  audioMode: text("audio_mode").notNull().default("muted"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  duration: integer("duration").notNull().default(10),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
```

- [ ] **Step 2: Compilar a lib de db**

Run: `cd lib/db && npx tsc --build && cd ../..`
Expected: sem erros.

- [ ] **Step 3: Aplicar o schema no banco de desenvolvimento**

Run (com `DATABASE_URL` do dev definida no `.env`): `pnpm --filter @workspace/db run push`
Expected: drizzle-kit reporta as colunas novas adicionadas em `announcements` (defaults preenchem as linhas existentes; `image_url` passa a permitir NULL). Nenhuma perda de dados.

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/announcements.ts
git commit -m "feat(db): colunas mediaKind/youtubeId/playbackMode/audioMode e imageUrl opcional

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Contrato OpenAPI + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

- [ ] **Step 1: Atualizar o schema `Announcement`**

Em `lib/api-spec/openapi.yaml`, substituir o schema `Announcement` (remove `imageUrl` de `required`, torna nullable, adiciona campos):

```yaml
    Announcement:
      type: object
      required: [id, title, isActive, displayOrder, duration, showText, mediaKind, playbackMode, audioMode, createdAt]
      properties:
        id: { type: integer }
        title: { type: string }
        # Texto exibido na TV; `title` é apenas o rótulo interno do painel.
        displayText: { type: string, nullable: true }
        showText: { type: boolean }
        imageUrl: { type: string, nullable: true }
        mediaKind: { type: string }
        youtubeId: { type: string, nullable: true }
        playbackMode: { type: string }
        audioMode: { type: string }
        isActive: { type: boolean }
        displayOrder: { type: integer }
        duration: { type: integer }
        createdAt: { type: string, format: date-time }
```

- [ ] **Step 2: Atualizar `AnnouncementInput` e `AnnouncementUpdate`**

Substituir os dois schemas por:

```yaml
    AnnouncementInput:
      type: object
      required: [title]
      properties:
        title: { type: string, minLength: 1 }
        displayText: { type: string, nullable: true }
        showText: { type: boolean }
        duration: { type: integer, minimum: 1 }
        mediaKind: { type: string }
        youtubeUrl: { type: string }
        playbackMode: { type: string }
        audioMode: { type: string }

    AnnouncementUpdate:
      type: object
      properties:
        title: { type: string, minLength: 1 }
        displayText: { type: string, nullable: true }
        showText: { type: boolean }
        isActive: { type: boolean }
        displayOrder: { type: integer }
        duration: { type: integer, minimum: 1 }
        mediaKind: { type: string }
        youtubeUrl: { type: string }
        playbackMode: { type: string }
        audioMode: { type: string }
```

- [ ] **Step 3: Atualizar `DisplaySlide`**

Substituir o schema `DisplaySlide` por (remove `imageUrl` de required, adiciona campos de vídeo):

```yaml
    DisplaySlide:
      type: object
      required: [announcementId, title, duration, mediaKind]
      properties:
        announcementId: { type: integer }
        campaignId: { type: integer, nullable: true }
        # `title` segue no payload só para não quebrar TVs com tv.html em cache
        # antigo. Quem vai ao ar é `displayText`, já resolvido pelo servidor:
        # null significa slide sem texto.
        title: { type: string }
        displayText: { type: string, nullable: true }
        imageUrl: { type: string, nullable: true }
        duration: { type: integer }
        qrImageUrl: { type: string, nullable: true }
        mediaKind: { type: string }
        youtubeId: { type: string, nullable: true }
        playbackMode: { type: string, nullable: true }
        audioMode: { type: string, nullable: true }
        videoIds:
          type: array
          nullable: true
          items: { type: string }
```

- [ ] **Step 4: Rodar o codegen**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: regenera `lib/api-zod/src/generated/**` e `lib/api-client-react/src/generated/**`, depois roda `typecheck:libs` sem erro.

- [ ] **Step 5: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(api-spec): campos de YouTube em Announcement e DisplaySlide

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Serviço de resolução de playlist (TDD)

**Files:**
- Create: `artifacts/api-server/src/lib/youtube/playlist-resolver.ts`
- Create: `artifacts/api-server/src/lib/youtube/__tests__/playlist-resolver.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `artifacts/api-server/src/lib/youtube/__tests__/playlist-resolver.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePlaylistVideoIds, __clearPlaylistCache } from "../playlist-resolver";

function mockPlaylistPage(videoIds: string[], nextPageToken?: string) {
  return {
    ok: true,
    json: async () => ({
      items: videoIds.map((id) => ({ contentDetails: { videoId: id } })),
      nextPageToken,
    }),
  } as Response;
}

describe("resolvePlaylistVideoIds", () => {
  beforeEach(() => {
    __clearPlaylistCache();
    process.env.YOUTUBE_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.YOUTUBE_API_KEY;
  });

  it("retorna [] e não chama a API quando falta YOUTUBE_API_KEY", async () => {
    delete process.env.YOUTUBE_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const ids = await resolvePlaylistVideoIds("PLabc");
    expect(ids).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolve os videoIds de uma página", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockPlaylistPage(["a", "b", "c"]));
    const ids = await resolvePlaylistVideoIds("PLabc");
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("pagina com nextPageToken", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockPlaylistPage(["a", "b"], "TOKEN2"))
      .mockResolvedValueOnce(mockPlaylistPage(["c"]));
    const ids = await resolvePlaylistVideoIds("PLabc");
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("usa cache: a segunda chamada não refaz fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockPlaylistPage(["a"]));
    await resolvePlaylistVideoIds("PLabc");
    await resolvePlaylistVideoIds("PLabc");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retorna [] quando a API responde erro", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: false, status: 403 } as Response);
    const ids = await resolvePlaylistVideoIds("PLabc");
    expect(ids).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/youtube/__tests__/playlist-resolver.test.ts`
Expected: FAIL — módulo `../playlist-resolver` não existe.

- [ ] **Step 3: Implementar o resolver**

Create `artifacts/api-server/src/lib/youtube/playlist-resolver.ts`:

```typescript
type CacheEntry = { ids: string[]; expiresAt: number };

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_ITEMS = 200; // teto defensivo p/ playlists gigantes
const cache = new Map<string, CacheEntry>();

/** Apenas para testes: limpa o cache em memória. */
export function __clearPlaylistCache(): void {
  cache.clear();
}

interface PlaylistItemsResponse {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
  nextPageToken?: string;
}

/**
 * Resolve o ID de uma playlist do YouTube para a lista ordenada de videoIds.
 * Sem YOUTUBE_API_KEY, retorna [] (o chamador degrada para o fallback da peça).
 * Erros de rede/API também retornam [] — o display nunca deve travar por isso.
 * Resultado é cacheado em memória por CACHE_TTL_MS.
 */
export async function resolvePlaylistVideoIds(playlistId: string): Promise<string[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const cached = cache.get(playlistId);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  try {
    const ids: string[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      url.searchParams.set("part", "contentDetails");
      url.searchParams.set("maxResults", "50");
      url.searchParams.set("playlistId", playlistId);
      url.searchParams.set("key", key);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString());
      if (!res.ok) return [];

      const data = (await res.json()) as PlaylistItemsResponse;
      for (const item of data.items ?? []) {
        const id = item.contentDetails?.videoId;
        if (id) ids.push(id);
      }
      pageToken = data.nextPageToken;
    } while (pageToken && ids.length < MAX_ITEMS);

    cache.set(playlistId, { ids, expiresAt: Date.now() + CACHE_TTL_MS });
    return ids;
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/youtube/__tests__/playlist-resolver.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/youtube/
git commit -m "feat(api): resolver de playlist do YouTube com cache

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: API de announcements aceita YouTube

**Files:**
- Modify: `artifacts/api-server/src/routes/announcements.ts`

Contexto: hoje `POST`/`PATCH /announcements` usam `multer` e exigem imagem. Agora, quando `mediaKind` for de YouTube, a imagem é opcional e vem `youtubeUrl` (obrigatório nesse caso). Reusa o parser da Task 1.

- [ ] **Step 1: Importar o parser e helpers**

No topo de `artifacts/api-server/src/routes/announcements.ts`, adicionar aos imports existentes:

```typescript
import { parseYouTubeUrl } from "@workspace/db/youtube";
```

- [ ] **Step 2: Helper de normalização dos campos de YouTube**

Adicionar, logo antes de `router.get("/announcements", ...)`, esta função:

```typescript
type YouTubeFields = {
  mediaKind: "image" | "youtube_video" | "youtube_playlist";
  youtubeId: string | null;
  playbackMode: "natural" | "capped";
  audioMode: "muted" | "sound";
};

/**
 * Deriva os campos de YouTube a partir do corpo (multipart => strings).
 * Retorna { error } quando o link é obrigatório mas inválido/ausente.
 */
function readYouTubeFields(body: Record<string, unknown>): YouTubeFields | { error: string } {
  const rawKind = body.mediaKind != null ? String(body.mediaKind) : "image";
  const mediaKind =
    rawKind === "youtube_video" || rawKind === "youtube_playlist" ? rawKind : "image";

  const playbackMode = String(body.playbackMode) === "natural" ? "natural" : "capped";
  const audioMode = String(body.audioMode) === "sound" ? "sound" : "muted";

  if (mediaKind === "image") {
    return { mediaKind: "image", youtubeId: null, playbackMode, audioMode };
  }

  const url = body.youtubeUrl != null ? String(body.youtubeUrl) : "";
  const ref = parseYouTubeUrl(url);
  if (!ref) return { error: "Link do YouTube inválido" };
  if (ref.kind !== mediaKind) {
    return { error: `O link não corresponde ao tipo selecionado (${mediaKind})` };
  }
  return { mediaKind: ref.kind, youtubeId: ref.id, playbackMode, audioMode };
}
```

- [ ] **Step 3: Ajustar o `POST /announcements`**

Substituir o handler de `router.post("/announcements", uploadImage, async (req, res) => { ... })` por:

```typescript
router.post(
  "/announcements",
  uploadImage,
  async (req, res): Promise<void> => {
    const body = {
      title: req.body.title,
      displayText: req.body.displayText != null ? String(req.body.displayText) : undefined,
      showText: parseFormBoolean(req.body.showText),
      duration: req.body.duration != null ? Number(req.body.duration) : undefined,
    };
    const parsed = CreateAnnouncementBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const yt = readYouTubeFields(req.body);
    if ("error" in yt) {
      res.status(400).json({ error: yt.error });
      return;
    }

    let imageUrl: string | null = null;
    if (req.file) {
      try {
        imageUrl = await persistImage(req.file);
      } catch (error) {
        res.status(502).json({ error: "Could not persist image in object storage" });
        return;
      }
    } else if (yt.mediaKind === "image") {
      res.status(400).json({ error: "Image file is required" });
      return;
    }

    const maxOrderRow = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${announcementsTable.displayOrder}), -1)` })
      .from(announcementsTable);
    const nextOrder = (maxOrderRow[0]?.maxOrder ?? -1) + 1;
    const [row] = await db
      .insert(announcementsTable)
      .values({
        title: parsed.data.title,
        displayText: normalizeDisplayText(parsed.data.displayText),
        showText: parsed.data.showText ?? false,
        imageUrl,
        mediaKind: yt.mediaKind,
        youtubeId: yt.youtubeId,
        playbackMode: yt.playbackMode,
        audioMode: yt.audioMode,
        duration: parsed.data.duration ?? 10,
        displayOrder: nextOrder,
      })
      .returning();
    res.status(201).json(CreateAnnouncementResponse.parse(row));
  }
);
```

- [ ] **Step 4: Ajustar o `PATCH /announcements/:id`**

No handler `router.patch("/announcements/:id", uploadImage, ...)`, depois do bloco que monta `body` e antes de `const parsed = UpdateAnnouncementBody.safeParse(body);`, o `body` já cobre título/displayText/showText/duration. Após obter `existing` e montar `updates`, inserir a lógica de YouTube. Substituir o trecho que vai de `const updates: Record<string, unknown> = { ...parsed.data };` até o final do `if (req.file) { ... updates.imageUrl = imageUrl; }` por:

```typescript
    const updates: Record<string, unknown> = { ...parsed.data };

    // Campos de YouTube só são reprocessados se o cliente enviou mediaKind.
    if (req.body.mediaKind !== undefined) {
      const yt = readYouTubeFields(req.body);
      if ("error" in yt) {
        res.status(400).json({ error: yt.error });
        return;
      }
      updates.mediaKind = yt.mediaKind;
      updates.youtubeId = yt.youtubeId;
      updates.playbackMode = yt.playbackMode;
      updates.audioMode = yt.audioMode;
      if (yt.mediaKind !== "image" && !req.file) {
        // Trocou para YouTube sem enviar nova imagem: limpa o poster antigo.
        updates.imageUrl = null;
      }
    }

    if (req.file) {
      let imageUrl: string;
      try {
        imageUrl = await persistImage(req.file);
      } catch (error) {
        res.status(502).json({ error: "Could not persist image in object storage" });
        return;
      }
      updates.imageUrl = imageUrl;
    }
```

Em seguida, o bloco final que remove a imagem antiga precisa de guarda (imageUrl agora pode ser null). Substituir:

```typescript
    if (req.file) {
      try {
        await mediaStore().remove(existing.imageUrl);
      } catch (error) {
        req.log.error({ err: error }, "Could not remove replaced announcement image");
      }
    }
```

por:

```typescript
    if (req.file && existing.imageUrl) {
      try {
        await mediaStore().remove(existing.imageUrl);
      } catch (error) {
        req.log.error({ err: error }, "Could not remove replaced announcement image");
      }
    }
```

- [ ] **Step 5: Guardar a remoção no `DELETE /announcements/:id`**

Substituir, no handler `router.delete("/announcements/:id", ...)`:

```typescript
  try {
    await mediaStore().remove(row.imageUrl);
  } catch (error) {
    req.log.error({ err: error }, "Could not remove deleted announcement image");
  }
```

por:

```typescript
  if (row.imageUrl) {
    try {
      await mediaStore().remove(row.imageUrl);
    } catch (error) {
      req.log.error({ err: error }, "Could not remove deleted announcement image");
    }
  }
```

- [ ] **Step 6: Também guardar `migrateLegacyImages` contra imageUrl null**

Em `migrateLegacyImages`, a linha `if (!row.imageUrl.startsWith("/api/uploads/")) continue;` quebra com null. Substituir por:

```typescript
    if (!row.imageUrl || !row.imageUrl.startsWith("/api/uploads/")) continue;
```

- [ ] **Step 7: Typecheck da API**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/routes/announcements.ts
git commit -m "feat(api): announcements aceitam vídeo/playlist do YouTube

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Endpoint de slides enriquecido

**Files:**
- Modify: `artifacts/api-server/src/routes/display.ts`

- [ ] **Step 1: Importar o resolver**

Adicionar aos imports de `artifacts/api-server/src/routes/display.ts`:

```typescript
import { resolvePlaylistVideoIds } from "../lib/youtube/playlist-resolver";
```

- [ ] **Step 2: Selecionar os campos de vídeo nas duas queries**

Na query `playlistSlides` (device_playlist), adicionar ao objeto `.select({ ... })`, junto aos campos existentes:

```typescript
      mediaKind: announcementsTable.mediaKind,
      youtubeId: announcementsTable.youtubeId,
      playbackMode: announcementsTable.playbackMode,
      audioMode: announcementsTable.audioMode,
```

Fazer a mesma adição no `.select({ ... })` da query `campaignSlides`.

- [ ] **Step 3: Enriquecer o mapeamento final (agora assíncrono p/ resolver playlists)**

Substituir o bloco `const slides = [...campaignSlides, ...playlistSlides].filter(...).map(...);` e o `res.json(...)` por:

```typescript
  const seen = new Set<number>();
  const deduped = [...campaignSlides, ...playlistSlides].filter((slide) => {
    if (seen.has(slide.announcementId)) return false;
    seen.add(slide.announcementId);
    return true;
  });

  const slides = await Promise.all(
    deduped.map(async ({ scanCode, showText, displayText, ...slide }) => {
      const videoIds =
        slide.mediaKind === "youtube_playlist" && slide.youtubeId
          ? await resolvePlaylistVideoIds(slide.youtubeId)
          : null;
      return {
        ...slide,
        // O servidor decide o texto: null significa slide sem legenda, para os
        // dois renderizadores (display.tsx e tv.html) não divergirem na regra.
        displayText: resolveSlideCaption({ showText, displayText }),
        qrImageUrl: scanCode ? `/api/qr/${scanCode}.png` : null,
        videoIds,
      };
    }),
  );

  res.json(GetDeviceSlidesResponse.parse(slides));
```

- [ ] **Step 4: Typecheck da API**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erros. (Se `GetDeviceSlidesResponse` reclamar de campos, confirme que a Task 3 rodou o codegen.)

- [ ] **Step 5: Verificação manual do payload**

Suba o ambiente (`./dev.sh`), crie uma peça de vídeo pelo admin e adicione a um dispositivo/campanha. Então:

Run: `curl -s http://localhost:8080/api/display/DEVICE_KEY/slides | head -c 800`
Expected: cada slide inclui `mediaKind`, `youtubeId`, `playbackMode`, `audioMode` e (para playlist) `videoIds` populado se `YOUTUBE_API_KEY` estiver definida.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/display.ts
git commit -m "feat(api): slides expõem campos de YouTube e resolvem playlists

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Player React (`YouTubeSlide` + display.tsx)

**Files:**
- Create: `artifacts/signage/src/components/youtube-slide.tsx`
- Modify: `artifacts/signage/src/pages/display.tsx`

Nota: sem testes automatizados (o frontend não tem runner de componentes; segue a convenção do repo). Verificação é manual.

- [ ] **Step 1: Criar o componente `YouTubeSlide`**

Create `artifacts/signage/src/components/youtube-slide.tsx`:

```tsx
import { useEffect, useRef } from 'react';

// Carrega a IFrame Player API do YouTube uma única vez.
let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiPromise;
}

interface YouTubeSlideProps {
  slideKey: string | number;
  videoId: string;
  audioMode: 'muted' | 'sound';
  playbackMode: 'natural' | 'capped';
  /** Chamado quando o vídeo termina (natural) — o pai avança o slide. */
  onEnded: () => void;
  /** Chamado se o player não inicializa/erra — o pai mostra o fallback. */
  onUnplayable: () => void;
}

const INIT_TIMEOUT_MS = 4000;

export function YouTubeSlide({
  slideKey,
  videoId,
  audioMode,
  playbackMode,
  onEnded,
  onUnplayable,
}: YouTubeSlideProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(onEnded);
  const unplayableRef = useRef(onUnplayable);
  endedRef.current = onEnded;
  unplayableRef.current = onUnplayable;

  useEffect(() => {
    let player: any = null;
    let cancelled = false;
    let started = false;
    const timeout = setTimeout(() => {
      if (!started) unplayableRef.current();
    }, INIT_TIMEOUT_MS);

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      const YT = (window as any).YT;
      player = new YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          disablekb: 1,
          fs: 0,
        },
        events: {
          onReady: (e: any) => {
            started = true;
            clearTimeout(timeout);
            if (audioMode === 'sound') {
              e.target.unMute();
              e.target.setVolume(100);
            }
            e.target.playVideo();
          },
          onStateChange: (e: any) => {
            if (e.data === YT.PlayerState.ENDED && playbackMode === 'natural') {
              endedRef.current();
            }
          },
          onError: () => {
            clearTimeout(timeout);
            unplayableRef.current();
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      try {
        player?.destroy();
      } catch {
        /* noop */
      }
    };
    // Recria o player a cada troca de slide/vídeo.
  }, [slideKey, videoId, audioMode, playbackMode]);

  return (
    <div className="absolute inset-0 z-0 bg-black">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
```

- [ ] **Step 2: Integrar no `display.tsx`**

Em `artifacts/signage/src/pages/display.tsx`:

(a) Adicionar o import no topo:

```tsx
import { YouTubeSlide } from '@/components/youtube-slide';
```

(b) Adicionar um cursor de playlist em memória e estado de fallback. Logo após `const playSent = useRef(false);` inserir:

```tsx
  const playlistCursor = useRef<Record<number, number>>({});
  const [fallbackIds, setFallbackIds] = useState<Set<number>>(new Set());
```

(c) O timer de auto-advance atual deve pausar para vídeo `natural` que consegue tocar. Substituir a condição de início do efeito de auto-advance. Localizar, dentro do `useEffect` de auto-advance, logo após `const slide = slides[currentIndex];` e o guard `if (!slide) {...}`, inserir:

```tsx
    const isYouTube = slide.mediaKind !== 'image' && !fallbackIds.has(slide.announcementId);
    const naturalVideo = isYouTube && slide.playbackMode === 'natural';
    // Vídeo "natural" que toca: o componente avança via onEnded, não o timer.
    if (naturalVideo) {
      playSent.current = false;
      return;
    }
```

(d) Computar o vídeo a exibir e renderizar. Substituir o bloco final de `render` (de `const imgUrl = mediaUrl(slide.imageUrl);` até o fechamento do componente `return (...)`) por:

```tsx
  const useFallback = fallbackIds.has(slide.announcementId);
  const isYouTube = slide.mediaKind !== 'image' && !useFallback;

  let videoId: string | null = null;
  if (isYouTube) {
    if (slide.mediaKind === 'youtube_playlist' && slide.videoIds && slide.videoIds.length > 0) {
      const cursor = playlistCursor.current[slide.announcementId] ?? 0;
      videoId = slide.videoIds[cursor % slide.videoIds.length];
    } else if (slide.mediaKind === 'youtube_video') {
      videoId = slide.youtubeId ?? null;
    }
  }
  if (isYouTube && !videoId) {
    // Playlist sem videoIds resolvidos (sem API key etc.) → fallback.
    if (!useFallback) setFallbackIds((prev) => new Set(prev).add(slide.announcementId));
  }

  const posterUrl =
    slide.imageUrl != null
      ? mediaUrl(slide.imageUrl)
      : slide.youtubeId
        ? `https://img.youtube.com/vi/${slide.youtubeId}/hqdefault.jpg`
        : '';

  const advance = () => {
    if (slide.mediaKind === 'youtube_playlist' && slide.videoIds && slide.videoIds.length > 0) {
      const cur = playlistCursor.current[slide.announcementId] ?? 0;
      playlistCursor.current[slide.announcementId] = (cur + 1) % slide.videoIds.length;
    }
    if (!playSent.current && deviceKey) {
      playSent.current = true;
      fetch(`${import.meta.env.BASE_URL}api/telemetry/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceKey,
          announcementId: slide.announcementId,
          campaignId: slide.campaignId ?? null,
          durationSeconds: slide.duration,
        }),
      }).catch(() => {});
    }
    setCurrentIndex((prev) => (prev + 1) % slides.length);
    setProgress(0);
  };

  return (
    <div className="relative flex h-[100dvh] w-screen items-center justify-center bg-black overflow-hidden select-none">
      {isYouTube && videoId ? (
        <YouTubeSlide
          slideKey={`${slide.announcementId}-${videoId}`}
          videoId={videoId}
          audioMode={slide.audioMode === 'sound' ? 'sound' : 'muted'}
          playbackMode={slide.playbackMode === 'natural' ? 'natural' : 'capped'}
          onEnded={advance}
          onUnplayable={() =>
            setFallbackIds((prev) => new Set(prev).add(slide.announcementId))
          }
        />
      ) : (
        <AnimatePresence initial={false}>
          <motion.div
            key={slide.announcementId}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
            className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${posterUrl})` }}
          />
        </AnimatePresence>
      )}

      <SlideCaption text={slide.displayText ?? null} slideKey={slide.announcementId} />

      {slide.qrImageUrl && (
        <div className="absolute bottom-[3vh] right-[3vh] z-30 rounded-[1vh] bg-white p-[1vh]">
          <img
            src={`${import.meta.env.BASE_URL}${slide.qrImageUrl.replace(/^\//, "")}`}
            alt=""
            className="block h-[12vh] w-[12vh]"
          />
        </div>
      )}

      <div className="absolute bottom-0 left-0 h-1 w-full bg-white/10 z-20">
        <div
          className="h-full bg-primary transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
```

Nota: o `advance()` do timer capped continua no efeito de auto-advance existente (ele já chama telemetria + `setCurrentIndex`). O `advance()` acima é usado só pelo `onEnded` do vídeo natural. Para não duplicar o pulo de playlist quando `capped`, mover o incremento do cursor: no ramo `capped` do efeito de auto-advance, antes de `setCurrentIndex`, inserir:

```tsx
        if (slide.mediaKind === 'youtube_playlist' && slide.videoIds && slide.videoIds.length > 0) {
          const cur = playlistCursor.current[slide.announcementId] ?? 0;
          playlistCursor.current[slide.announcementId] = (cur + 1) % slide.videoIds.length;
        }
```

- [ ] **Step 3: Typecheck do frontend**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erros.

- [ ] **Step 4: Verificação manual**

Abrir `http://localhost:21153/display/DEVICE_KEY` com uma peça de vídeo único e uma de playlist. Esperado: o vídeo toca mudo/autoplay; `natural` avança ao terminar; `capped` corta na duração; playlist avança 1 vídeo por ciclo; se o vídeo não puder tocar, aparece a thumbnail e a rotação segue.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/youtube-slide.tsx artifacts/signage/src/pages/display.tsx
git commit -m "feat(signage): player de YouTube no display React com fallback

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Player `tv.html` (ES5) com fallback

**Files:**
- Modify: `artifacts/signage/public/tv.html`

- [ ] **Step 1: Adicionar o slot do iframe e carregar a API**

No HTML, logo após `<div id="slot-b"></div>`, inserir:

```html
  <div id="yt-slot" style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:2;display:none;background:#000;"></div>
```

Dentro do `<script>`, logo após `var activeSlot = 'a';`, adicionar estado:

```javascript
      var ytPlayer      = null;
      var ytApiReady    = false;
      var ytApiLoading  = false;
      var ytInitTimer   = null;
      var ytActive      = false;
      var playlistCursor = {};   // announcementId -> índice atual
      var ytSlot        = document.getElementById('yt-slot');
```

- [ ] **Step 2: Carregar a IFrame API (ES5)**

Adicionar estas funções logo após `function preload(url) { ... }`:

```javascript
      function loadYtApi(cb) {
        if (window.YT && window.YT.Player) { cb(); return; }
        if (ytApiLoading) {
          var t = setInterval(function () {
            if (window.YT && window.YT.Player) { clearInterval(t); cb(); }
          }, 100);
          return;
        }
        ytApiLoading = true;
        window.onYouTubeIframeAPIReady = function () { ytApiReady = true; cb(); };
        var tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }

      function teardownYt() {
        ytActive = false;
        if (ytInitTimer) { clearTimeout(ytInitTimer); ytInitTimer = null; }
        if (ytPlayer) {
          try { ytPlayer.destroy(); } catch (e) {}
          ytPlayer = null;
        }
        ytSlot.style.display = 'none';
        ytSlot.innerHTML = '';
      }

      function videoIdForSlide(slide) {
        if (slide.mediaKind === 'youtube_playlist') {
          var ids = slide.videoIds || [];
          if (!ids.length) { return null; }
          var cur = playlistCursor[slide.announcementId] || 0;
          return ids[cur % ids.length];
        }
        if (slide.mediaKind === 'youtube_video') {
          return slide.youtubeId || null;
        }
        return null;
      }

      function advancePlaylistCursor(slide) {
        if (slide.mediaKind === 'youtube_playlist') {
          var ids = slide.videoIds || [];
          if (ids.length) {
            var cur = playlistCursor[slide.announcementId] || 0;
            playlistCursor[slide.announcementId] = (cur + 1) % ids.length;
          }
        }
      }
```

- [ ] **Step 3: Função que toca o vídeo com fallback**

Adicionar após `teardownYt`:

```javascript
      // Toca um vídeo do YouTube; se não inicializar em 5s ou der erro, chama
      // onFail() para o chamador cair no fallback de imagem.
      function playYouTube(slide, videoId, onEnded, onFail) {
        loadYtApi(function () {
          var holder = document.createElement('div');
          ytSlot.innerHTML = '';
          ytSlot.appendChild(holder);
          ytSlot.style.display = 'block';
          ytActive = true;

          var started = false;
          ytInitTimer = setTimeout(function () {
            if (!started) { teardownYt(); onFail(); }
          }, 5000);

          ytPlayer = new window.YT.Player(holder, {
            width: '100%',
            height: '100%',
            videoId: videoId,
            playerVars: {
              autoplay: 1, mute: 1, controls: 0, rel: 0,
              modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0
            },
            events: {
              onReady: function (e) {
                started = true;
                if (ytInitTimer) { clearTimeout(ytInitTimer); ytInitTimer = null; }
                if (slide.audioMode === 'sound') {
                  try { e.target.unMute(); e.target.setVolume(100); } catch (err) {}
                }
                e.target.playVideo();
              },
              onStateChange: function (e) {
                if (e.data === window.YT.PlayerState.ENDED && slide.playbackMode === 'natural') {
                  onEnded();
                }
              },
              onError: function () {
                if (ytInitTimer) { clearTimeout(ytInitTimer); ytInitTimer = null; }
                teardownYt();
                onFail();
              }
            }
          });
        });
      }
```

- [ ] **Step 4: Integrar no fluxo de slides**

O fluxo atual: `showSlide(slide)` troca a imagem e `startTimer()` roda o cronômetro. Precisamos: ao entrar num slide de YouTube tocável, esconder os slots de imagem, tocar o vídeo, e — se `natural` — avançar via `onEnded` em vez do timer.

(a) No início de `showSlide(slide)`, antes de `var url = imgUrl(slide.imageUrl);`, inserir o teardown do player anterior:

```javascript
        teardownYt();
```

(b) Substituir o corpo de `startTimer()` para tratar YouTube. Substituir a função `startTimer` inteira por:

```javascript
      function goNext() {
        if (timer) { clearInterval(timer); timer = null; }
        recordImpression(slides[currentIndex]);
        advancePlaylistCursor(slides[currentIndex]);
        currentIndex = (currentIndex + 1) % slides.length;
        showSlide(slides[currentIndex]);
        startTimer();
      }

      function startTimer() {
        if (timer) { clearInterval(timer); timer = null; }
        elapsed = 0;
        playSent = false;
        fillEl.style.width = '0';

        var slide = slides[currentIndex];
        var vid = (slide.mediaKind && slide.mediaKind !== 'image') ? videoIdForSlide(slide) : null;

        if (vid) {
          var naturalDone = false;
          playYouTube(
            slide, vid,
            function onEnded() { if (!naturalDone) { naturalDone = true; goNext(); } },
            function onFail() {
              // Fallback: mostra a thumbnail nos slots de imagem e usa o timer.
              slide.imageUrl = slide.imageUrl ||
                ('https://img.youtube.com/vi/' + (slide.youtubeId || vid) + '/hqdefault.jpg');
              showImageSlide(slide);
              runTimer(slide);
            }
          );
          if (slide.playbackMode === 'natural') {
            return; // avança no onEnded; sem cronômetro
          }
          // capped: roda o cronômetro em paralelo ao vídeo
          runTimer(slide);
          return;
        }

        showImageSlide(slide);
        runTimer(slide);
      }

      function runTimer(slide) {
        var durationMs = slide.duration * 1000;
        if (timer) { clearInterval(timer); }
        timer = setInterval(function () {
          elapsed += tickMs;
          var pct = Math.min((elapsed / durationMs) * 100, 100);
          fillEl.style.width = pct + '%';
          if (elapsed >= durationMs) {
            goNext();
          }
        }, tickMs);
      }
```

(c) `showSlide` hoje faz a troca de imagem sempre. Extrair a parte visual de imagem numa função `showImageSlide` para o YouTube não mexer nos slots quando estiver ativo. Renomear: manter `showSlide` como orquestrador que chama `showImageSlide` para conteúdo de imagem. Substituir a definição atual de `showSlide` para que o corpo que manipula `slot-a/slot-b`, `caption`, `qr` vire `showImageSlide(slide)`, e `showSlide` fique:

```javascript
      function showSlide(slide) {
        teardownYt();
        // Slides de YouTube só desenham imagem quando caírem em fallback (feito
        // pelo onFail em startTimer). Aqui, para imagem, desenha normalmente.
        if (!slide.mediaKind || slide.mediaKind === 'image') {
          showImageSlide(slide);
        } else {
          // Mantém legenda/QR visíveis por cima do vídeo.
          applyCaptionAndQr(slide);
        }
      }
```

E extrair de `showImageSlide` a parte de legenda/QR para `applyCaptionAndQr(slide)` (reuso), deixando `showImageSlide` responsável pelos slots + preload e chamando `applyCaptionAndQr(slide)`. Ou seja:

```javascript
      function applyCaptionAndQr(slide) {
        var caption = slide.displayText;
        if (caption) {
          captionEl.textContent = caption;
          overlayEl.style.display = 'block';
        } else {
          captionEl.textContent = '';
          overlayEl.style.display = 'none';
        }
        if (slide.qrImageUrl) {
          qrImg.src = apiBase() + slide.qrImageUrl;
          qrBox.style.display = 'block';
        } else {
          qrBox.style.display = 'none';
          qrImg.removeAttribute('src');
        }
      }

      function showImageSlide(slide) {
        var url  = imgUrl(slide.imageUrl);
        var prev = activeSlot === 'a' ? slotA : slotB;
        var next = activeSlot === 'a' ? slotB : slotA;

        next.style.backgroundImage = 'url(' + url + ')';
        next.style.zIndex = '2';
        next.style.opacity = '1';
        next.className = 'slot-enter';

        prev.style.zIndex = '1';
        prev.style.opacity = '0';

        applyCaptionAndQr(slide);

        activeSlot = activeSlot === 'a' ? 'b' : 'a';

        var nextIdx = (currentIndex + 1) % slides.length;
        if (slides[nextIdx] && (!slides[nextIdx].mediaKind || slides[nextIdx].mediaKind === 'image') && slides[nextIdx].imageUrl) {
          preload(imgUrl(slides[nextIdx].imageUrl));
        }
      }
```

Remover a função `recordImpression`? Não — ela é chamada por `goNext`. Mantê-la. Remover o antigo corpo inline do timer (agora em `runTimer`/`goNext`).

- [ ] **Step 5: Ajustar `imgUrl` para tolerar imageUrl ausente**

Em `imgUrl(imageUrl)`, primeira linha, tolerar null:

```javascript
      function imgUrl(imageUrl) {
        if (!imageUrl) { return ''; }
        if (/^https?:\/\//i.test(imageUrl)) {
          return imageUrl;
        }
```

(resto igual).

- [ ] **Step 6: Verificação manual em navegador desktop (proxy do TV)**

Abrir `http://localhost:21153/tv.html?key=DEVICE_KEY`. Esperado: vídeo toca; `natural` avança no fim; `capped` corta na duração; playlist gira 1 por ciclo; legenda/QR aparecem sobre o vídeo; ao forçar falha (ex.: bloquear youtube.com no devtools), cai na thumbnail e segue.

- [ ] **Step 7: Copiar o tv.html para o dist se necessário / build**

Run: `pnpm --filter @workspace/signage run build`
Expected: build ok (o `public/tv.html` é copiado para `dist/public/tv.html` pelo Vite).

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/public/tv.html
git commit -m "feat(signage): player de YouTube no tv.html (ES5) com fallback

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Admin — seletor de tipo e campos de YouTube

**Files:**
- Modify: `artifacts/signage/src/pages/admin.tsx`
- Modify: `artifacts/signage/package.json`

- [ ] **Step 1: Permitir importar o parser compartilhado**

Em `artifacts/signage/package.json`, adicionar em `dependencies` (junto de `@workspace/api-client-react`):

```json
    "@workspace/db": "workspace:*",
```

Run: `pnpm install`
Expected: linka o workspace sem baixar nada novo.

- [ ] **Step 2: Estender os schemas de formulário**

Em `artifacts/signage/src/pages/admin.tsx`, no topo adicionar:

```tsx
import { parseYouTubeUrl } from '@workspace/db/youtube';
```

Substituir `uploadSchema` e `editSchema` (os dois blocos `z.object({...})`) por versões com os campos de YouTube. Para `uploadSchema`:

```tsx
const uploadSchema = z
  .object({
    title: z.string().min(1, 'Título é obrigatório'),
    displayText: z.string().default(''),
    showText: z.boolean().default(false),
    duration: z.coerce.number().min(1, 'Deve ser no mínimo 1 segundo').default(10),
    mediaKind: z.enum(['image', 'youtube_video', 'youtube_playlist']).default('image'),
    youtubeUrl: z.string().default(''),
    playbackMode: z.enum(['natural', 'capped']).default('capped'),
    audioMode: z.enum(['muted', 'sound']).default('muted'),
    image: z.any().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mediaKind === 'image') {
      if (!(v.image instanceof FileList) || v.image.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['image'], message: 'Selecione uma imagem' });
      }
    } else {
      const ref = parseYouTubeUrl(v.youtubeUrl);
      if (!ref || ref.kind !== v.mediaKind) {
        ctx.addIssue({ code: 'custom', path: ['youtubeUrl'], message: 'Link do YouTube inválido para o tipo' });
      }
    }
  });
```

Para `editSchema` (imagem sempre opcional na edição):

```tsx
const editSchema = z
  .object({
    title: z.string().min(1, 'Título é obrigatório'),
    displayText: z.string().default(''),
    showText: z.boolean().default(false),
    duration: z.coerce.number().min(1, 'Deve ser no mínimo 1 segundo').default(10),
    mediaKind: z.enum(['image', 'youtube_video', 'youtube_playlist']).default('image'),
    youtubeUrl: z.string().default(''),
    playbackMode: z.enum(['natural', 'capped']).default('capped'),
    audioMode: z.enum(['muted', 'sound']).default('muted'),
    image: z.any().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mediaKind !== 'image') {
      const ref = parseYouTubeUrl(v.youtubeUrl);
      if (!ref || ref.kind !== v.mediaKind) {
        ctx.addIssue({ code: 'custom', path: ['youtubeUrl'], message: 'Link do YouTube inválido para o tipo' });
      }
    }
  });
```

> Se `uploadSchema` já declarava `image` (ex.: `z.instanceof(FileList)`), remova a antiga declaração de `image` para não duplicar — a nova acima cobre os dois casos.

- [ ] **Step 3: Enviar os campos de YouTube nos submits**

Em `onUpload`, dentro do `try`, substituir a montagem do `FormData` por:

```tsx
      const formData = new FormData();
      formData.append('title', values.title);
      formData.append('displayText', values.displayText);
      formData.append('showText', String(values.showText));
      formData.append('duration', String(values.duration));
      formData.append('mediaKind', values.mediaKind);
      formData.append('playbackMode', values.playbackMode);
      formData.append('audioMode', values.audioMode);
      if (values.mediaKind === 'image') {
        formData.append('image', values.image[0]);
      } else {
        formData.append('youtubeUrl', values.youtubeUrl);
        if (values.image instanceof FileList && values.image.length > 0) {
          formData.append('image', values.image[0]); // fallback custom opcional
        }
      }
```

Em `onEditSubmit`, substituir a montagem do `FormData` por:

```tsx
      const formData = new FormData();
      formData.append('title', values.title);
      formData.append('displayText', values.displayText);
      formData.append('showText', String(values.showText));
      formData.append('duration', String(values.duration));
      formData.append('mediaKind', values.mediaKind);
      formData.append('playbackMode', values.playbackMode);
      formData.append('audioMode', values.audioMode);
      if (values.mediaKind !== 'image') {
        formData.append('youtubeUrl', values.youtubeUrl);
      }
      if (values.image instanceof FileList && values.image.length > 0) {
        formData.append('image', values.image[0]);
      }
```

Em `openEdit`, incluir os novos campos no `editForm.reset`:

```tsx
    editForm.reset({
      title: item.title,
      displayText: item.displayText ?? '',
      showText: item.showText,
      duration: item.duration,
      mediaKind: (item.mediaKind as 'image' | 'youtube_video' | 'youtube_playlist') ?? 'image',
      youtubeUrl: item.youtubeId
        ? item.mediaKind === 'youtube_playlist'
          ? `https://www.youtube.com/playlist?list=${item.youtubeId}`
          : `https://www.youtube.com/watch?v=${item.youtubeId}`
        : '',
      playbackMode: (item.playbackMode as 'natural' | 'capped') ?? 'capped',
      audioMode: (item.audioMode as 'muted' | 'sound') ?? 'muted',
    });
```

Também atualizar os `defaultValues` de `useForm<UploadFormValues>` e `useForm<EditFormValues>` para incluir `mediaKind: 'image', youtubeUrl: '', playbackMode: 'capped', audioMode: 'muted'`.

- [ ] **Step 4: Campos no formulário (dialog de upload e de edição)**

No JSX do dialog de criação, antes do campo de imagem, adicionar o seletor de tipo e os campos condicionais. Usando os componentes de form já importados (`FormField`, `Select` do projeto — se não houver `Select`, usar `<select>` nativo com `{...form.register(...)}`). Exemplo mínimo com `<select>` nativo dentro do `<Form>` (o projeto usa react-hook-form):

```tsx
            <FormField
              control={form.control}
              name="mediaKind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de mídia</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={field.value}
                      onChange={field.onChange}
                    >
                      <option value="image">Imagem</option>
                      <option value="youtube_video">Vídeo do YouTube</option>
                      <option value="youtube_playlist">Playlist do YouTube</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch('mediaKind') !== 'image' && (
              <>
                <FormField
                  control={form.control}
                  name="youtubeUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Link do YouTube</FormLabel>
                      <FormControl>
                        <Input placeholder="https://www.youtube.com/..." {...field} />
                      </FormControl>
                      <FormDescription>Cole o link do vídeo ou da playlist.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="playbackMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duração</FormLabel>
                      <FormControl>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={field.value}
                          onChange={field.onChange}
                        >
                          <option value="capped">Limitar aos segundos abaixo</option>
                          <option value="natural">Tocar até o fim</option>
                        </select>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="audioMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Áudio</FormLabel>
                      <FormControl>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={field.value}
                          onChange={field.onChange}
                        >
                          <option value="muted">Mudo</option>
                          <option value="sound">Com som (se permitido)</option>
                        </select>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </>
            )}
```

Tornar o campo de imagem condicional/opcional: envolver o `FormField` de imagem com rótulo dinâmico — quando `mediaKind !== 'image'`, mostrar "Imagem de fallback (opcional)" e não exigir. Replicar os mesmos campos no dialog de edição usando `editForm`.

- [ ] **Step 5: Badge de tipo no card da peça**

No componente do card (função que renderiza cada `item`, perto de `{item.duration}s de duração`), adicionar um badge quando for YouTube e usar a thumbnail como preview quando `imageUrl` estiver ausente. Onde hoje há:

```tsx
        {item.imageUrl ? (
          <img src={imageUrl} alt={item.title} className="h-full w-full object-cover" />
        ) : (
```

Substituir a expressão `const imageUrl = mediaUrl(item.imageUrl);` (linha ~100) por:

```tsx
  const posterSrc = item.imageUrl
    ? mediaUrl(item.imageUrl)
    : item.youtubeId
      ? `https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`
      : '';
```

e usar `posterSrc` no lugar de `imageUrl` no `<img src=...>`, ajustando a condição `{item.imageUrl ? (...)}` para `{posterSrc ? (...)}`. Perto do título, adicionar:

```tsx
        {item.mediaKind && item.mediaKind !== 'image' && (
          <span className="ml-2 rounded bg-red-600/10 px-1.5 py-0.5 text-xs font-medium text-red-600">
            ▶ YouTube
          </span>
        )}
```

- [ ] **Step 6: Typecheck do frontend**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erros.

- [ ] **Step 7: Verificação manual**

No `/admin`: criar peça "Vídeo do YouTube" colando só o link → salva. Criar "Playlist" → salva. Card mostra badge ▶ YouTube e thumbnail. Editar uma peça e trocar tipo funciona.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/pages/admin.tsx artifacts/signage/package.json pnpm-lock.yaml
git commit -m "feat(signage): admin cria peças de vídeo/playlist do YouTube

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Documentar `YOUTUBE_API_KEY`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Adicionar a variável nas duas tabelas de env**

Na tabela de "Variáveis de ambiente" (seção geral) adicionar a linha:

```markdown
| `YOUTUBE_API_KEY` | Opcional. Necessária apenas para resolver **playlists** do YouTube (YouTube Data API v3). Sem ela, vídeos únicos funcionam e playlists degradam para a thumbnail/fallback |
```

Na tabela "Variáveis de ambiente em produção" (Vercel) adicionar:

```markdown
| `YOUTUBE_API_KEY` | manual, opcional — só para playlists do YouTube |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: variável YOUTUBE_API_KEY para playlists

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Validação final

- [ ] **Step 1: Rodar os testes da API**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS, incluindo `youtube-parse` e `playlist-resolver`.

- [ ] **Step 2: Typecheck de tudo**

Run: `pnpm run typecheck`
Expected: sem erros nas libs e nos artifacts.

- [ ] **Step 3: Build completo**

Run: `PORT=8081 BASE_PATH=/ pnpm run build`
Expected: build de todos os pacotes sem erro.

- [ ] **Step 4: Smoke manual end-to-end**

Com `./dev.sh` e `YOUTUBE_API_KEY` definida: criar peça de vídeo e de playlist, associar a um dispositivo/campanha, abrir `/display/KEY` e `/tv.html?key=KEY`. Confirmar reprodução, avanço (natural/capped), interleave da playlist, QR/legenda sobrepostos, e fallback ao bloquear o YouTube.

- [ ] **Step 5: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore(youtube): ajustes finais de validação

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-review (cobertura da spec)

- Seção 1 (modelo de dados) → Tasks 2, 3.
- Seção 2 (API + resolução de playlist, parser, YOUTUBE_API_KEY) → Tasks 1, 4, 6, 10.
- Seção 3 (player React) → Task 7.
- Seção 4 (tv.html ES5 + detecção/fallback) → Task 8.
- Seção 5 (admin, contrato/codegen) → Tasks 3, 9.
- Seção 6 (testes, validação, riscos) → Tasks 1, 4, 11.
- Reuso em campanha/playlist do dispositivo → coberto de graça pelo modelo de `announcements` (nada a mudar em `campaign_announcements`/`device_playlist`), verificado no smoke da Task 11.
