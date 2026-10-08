# TV toca sem internet — design

Data: 2026-10-08
Branch: `feat/tocar-sem-internet`

## Objetivo

A TV (app Android) continua tocando a programação quando a internet cai, e
também quando liga ou reinicia sem internet. Hoje, sem rede no boot, o app
não consegue abrir a `tv.html` (vem da Vercel) e fica na tela de "sem
conexão": tela preta de anúncio. Com a TV ligada, ela repete a lista em
memória, mas só mostra as artes que o cache já tinha e o QR some.

Junto: monitorar o espaço em disco do box/stick, para o cache nunca encher o
aparelho e para o admin ver quem está com pouco espaço.

Primeiro item da lista de lacunas de mercado fora de programação.

## Regras decididas

1. **Só o app Android.** TV em navegador segue como hoje.
2. **Sem internet, a TV respeita a agenda das campanhas**: início/fim, dias da
   semana e faixas de horário. Campanha vencida ou fora do horário não toca.
3. **Relógio inválido** (anterior ao momento em que a lista foi salva — box
   que reinicia sem RTC volta para 2000/1970): toca só o que não tem agenda
   (playlist e painéis). Anunciante não ganha exibição por relógio quebrado.
4. **Versão da mídia = endereço.** Todo `put` do armazenamento gera endereço
   novo (UUID) e nunca grava por cima, então arte trocada é endereço novo e a
   TV baixa de novo. Sem campo `versao` nem `?v=`. Um teste trava essa regra.
5. **YouTube e clima não tocam sem internet** (a TV pula). Música de fundo
   (YouTube) também para.
6. **Vitrine não ganha lista sem internet** (`offline: null`).
7. **O app nunca deixa o disco com menos de 500 MB livres** por causa do
   cache. Teto do cache: o menor entre 1 GB e
   (livre + ocupado pelo cache − 500 MB).
8. **Espaço monitorado no admin**: livre, total e ocupado pelo cache, por TV,
   com selo "pouco espaço" abaixo de 500 MB livres ou de 10% do total.
9. APK antigo e `tv.html` antiga continuam funcionando: campo novo do feed é
   ignorado; ponte ausente é pulada; cabeçalho ausente não mexe em nada.

## Feed (`artifacts/api-server`)

### Lista sem internet

`/display/:key/feed` ganha `offline`:

```jsonc
"offline": {
  "geradoEm": "2026-10-08T15:00:00.000Z", // hora do servidor
  "slides": [ /* DisplaySlide + agenda opcional */ ]
} // ou null (vitrine)
```

- `lib/device-feed.ts` ganha `loadOfflineSlides(device, log, now)`, irmã de
  `loadDeviceSlides`, reaproveitando as mesmas consultas e
  `composeDeviceLoop`:
  - campanhas ativas com `startsAt <= now + 7 dias` e `endsAt >= now`
    (`buildCampaignSlidesQuery` passa a aceitar o intervalo e a devolver
    `startsAt`/`endsAt`);
  - filtro de alvo e concorrência (`campaignReachesDevice` +
    `canPlayOnDevice`), **sem** o filtro de dia e de faixa de horário;
  - painéis e playlist como no feed normal; orientação filtrada igual;
  - fora: slides `mediaKind = "youtube"` e o slide de clima (sem `extras`);
  - aviso urgente ativo: a peça do aviso vai **na frente** da volta normal,
    com `agenda: { fim }` (não substitui a volta: quando o aviso vence sem
    internet, a TV volta à programação);
  - falha em qualquer parte → `offline: null` e log (nunca derruba o feed).
- `agenda` (só em campanha e aviso):
  `{ inicio: ISO, fim: ISO, dias: number[], faixas: {start,end}[] }`; o aviso
  manda só `fim`.
- Vitrine → `offline: null`.
- `/display/:key/slides` (antigo) e a prévia do admin não mudam.
- `openapi.yaml`: `DisplayFeed.offline` (nullable) com `OfflineSlide`
  (`DisplaySlide` + `agenda` opcional). Codegen.

### Espaço em disco

- Cabeçalho opcional no GET do feed:
  `X-Signage-Storage: livre=<bytes>;total=<bytes>;cache=<bytes>;arquivos=<n>`.
- `lib/device-storage.ts` (puro): `parseStorageHeader(value): Storage | null`
  — inteiros ≥ 0, `livre <= total`, todos presentes; qualquer coisa fora
  disso → `null`.
- `loadForTv` grava no mesmo `UPDATE` do `lastSeenAt`, só quando o cabeçalho
  é válido: `storageFreeBytes`, `storageTotalBytes`, `cacheBytes`,
  `cacheFiles`, `storageReportedAt = now`.
- `devices` ganha `storage_free_bytes bigint`, `storage_total_bytes bigint`,
  `cache_bytes bigint`, `cache_files integer`, `storage_reported_at
  timestamptz`, todos nulos por padrão (drizzle `bigint` em modo `number`).
  Migração gerada só com os `ADD COLUMN`.
- `lib/device-storage.ts` também: `lowStorage(free, total): boolean` —
  `free < 500 MB || free < total * 0.1`; nulo → `false`.
- `/fleet` e `GET /devices/:id` devolvem `storage: { freeBytes, totalBytes,
  cacheBytes, cacheFiles, reportedAt, low } | null`. `openapi.yaml` + codegen.

### Armazenamento

- Teste em `lib/storage/__tests__`: `put` do Vercel Blob (com `putBlob`
  mockado) chamado duas vezes com o mesmo `originalname` devolve dois
  endereços diferentes e passa `addRandomSuffix: false` com nome UUID.

## `tv.html` (ES5)

- Toda resposta boa do feed salva no `localStorage` (`signage-offline`):
  `{ screen, ticker, offline }`. Sem `offline` (servidor antigo) não salva
  nada. Erro de quota é engolido.
- Feed falhou (rede, 5xx, 404 que não é o do device) **e há lista salva**:
  modo sem internet.
  - A cada falha (a cada 60 s, o mesmo ciclo de hoje) recalcula
    `filtrarSemInternet(salvo, agora)` e, se a lista mudou, reinicia como no
    caminho online. Primeira carga sem rede com lista salva já começa a tocar.
  - Hora de São Paulo calculada por UTC − 3 h (sem `Intl`, que WebView antiga
    não tem com fuso; o Brasil está sem horário de verão desde 2019 — se
    voltar, essa conta e a do servidor precisam mudar juntas).
  - Campanha toca se `inicio <= agora <= fim` (igual ao servidor), o dia está
    em `dias` (vazio = todos) e o minuto do dia cai em alguma faixa
    `[start, end)` (vazio = dia todo).
  - Aviso toca se `agora <= fim`. Se algum aviso vale, a volta é só o(s)
    aviso(s); senão, o resto.
  - Relógio inválido (`agora < geradoEm`): só slides sem `agenda`.
  - Lista filtrada vazia → tela de vazio (não a de "sem conexão").
  - Aplica `screen` e `ticker` salvos; música de fundo para.
- Feed voltou: sai do modo sem internet e segue o caminho normal.
- A cada feed bom, se `window.SignageCache` existe, chama
  `SignageCache.baixar(JSON.stringify(urls))` com as imagens e os QR de
  `offline.slides`, endereços absolutos (`imgUrl`, `apiBase() + qrImageUrl`).
- A cada busca do feed, se `SignageCache.estado` existe, manda o retorno em
  `X-Signage-Storage` (mesmo formato). Erro na ponte → sem cabeçalho.
- Fora do app (sem ponte) nada disso é chamado; o modo sem internet ainda
  funciona se a página carregar.

## App Android (`artifacts/android-tv`)

### Página

- `PaginaCache(dir, baixar)`: no `shouldInterceptRequest` do main frame com
  URL igual a `BuildConfig.TV_URL`:
  - baixa com timeout de 10 s; 200 → grava `tv.html` (via `.part` + rename) e
    entrega; senão, ou erro de rede → entrega a cópia gravada, se existir;
  - sem cópia → `null` (WebView segue o caminho de hoje: erro, tela de "sem
    conexão", retentativas).
  - Resposta `text/html; charset=utf-8`.

### Mídia (`ArteCache` ampliado)

- Não há vídeo enviado no sistema (peça é imagem, `youtube_video` ou
  `youtube_playlist`), então o cache segue só de imagem — sem Range.
- Passa a aceitar também o QR das campanhas:
  `<origem do TV_URL>/api/qr/<código>.png` (resposta `immutable`; sem ele o
  QR some sem internet).
- Ponte nova `window.SignageCache` (`CachePelaPagina`):
  - `baixar(json)`: lista de URLs; ignora o que o cache não aceita; troca a fila
    pendente pela nova; um download por vez numa thread própria; pula o que
    já está em disco.
  - `estado()`: JSON `{livre,total,cache,arquivos}` — `StatFs(filesDir)` e a
    soma do diretório do cache.
  - Exposta a todo frame (como `SignageUpdate`): o pior caso de um iframe
    chamar `baixar` é baixar arte nossa do Blob ou QR nosso.
- Lista atual guardada (última passada a `baixar`): na limpeza, sai primeiro
  o que não está nela, depois o usado há mais tempo.
- Espaço: antes de cada download, se `livre − tamanho esperado
  (Content-Length, se houver) < 500 MB`, não baixa; teto =
  `min(1 GB, livre + cache − 500 MB)`, recalculado a cada download.

## Admin (`artifacts/signage`)

- `pages/fleet.tsx`: coluna "Espaço" com "1,2 GB livres de 8 GB · cache
  340 MB" (sem dado → "—"), selo "Pouco espaço"; métrica e opção de filtro
  "Pouco espaço" em `lib/fleet.ts` (`filterFleet`, `fleetCounts`).
- `pages/device-detail.tsx`: o mesmo texto e "lido há N min".
- Formatação em `lib/bytes.ts`: `formatBytes(n)` → "340 MB", "1,2 GB".

## Testes (TDD)

API:

- `device-feed` / `display-slides.test.ts`: `offline` traz campanha fora do
  horário de agora com `agenda`; campanha que começa em 3 dias entra, em 8
  não; campanha fora do alvo ou concorrente não entra; YouTube e clima não
  entram; aviso vai na frente com `agenda.fim` e a volta normal segue atrás;
  vitrine → `null`; falha na montagem → `offline: null` e o resto do feed
  igual.
- `device-storage.test.ts`: parse válido, campo faltando, negativo, texto,
  `livre > total`; `lowStorage` nos dois limites e com nulo.
- Feed com cabeçalho grava as colunas; sem cabeçalho ou inválido não mexe.
- `fleet` e `GET /devices/:id` devolvem `storage` com `low`.
- `vercel-blob` devolve endereços diferentes para o mesmo nome.

Web:

- `tv-html.test.ts`: salva a lista; feed falha → toca a lista salva;
  campanha fora da faixa/dia/data some; aviso vencido some e a volta normal
  toca; relógio antes de `geradoEm` → só playlist/painéis; lista filtrada
  vazia → tela de vazio; primeira carga sem rede com lista salva toca;
  feed volta → lista do servidor; chama `SignageCache.baixar` com as URLs e
  manda `X-Signage-Storage` quando a ponte existe; sem ponte não quebra.
- `fleet` / `device-detail`: texto de espaço, selo e filtro "Pouco espaço".
- `formatBytes`.

Android (JVM):

- `PaginaCacheTest`: 200 grava e entrega; falha entrega a cópia; sem cópia
  → null; 500 da Vercel entrega a cópia.
- `ArteCacheTest`: QR da origem da TV entra, outro caminho da origem não;
  limpeza tira primeiro o que está fora da lista; não baixa abaixo de
  500 MB livres; teto encolhe com pouco espaço.
- `CachePelaPaginaTest`: `baixar` ignora URL de fora, troca a fila, pula o
  que já tem; `estado` no formato certo.

## Fora do escopo

- TV em navegador sem o app; service worker.
- Aviso de pouco espaço por WhatsApp/e-mail (item 13 da lista).
- YouTube, clima e música sem internet.
- Lista sem internet para a vitrine.

## PR

Título: `feat(android-tv): TV toca sem internet e mostra o espaço em disco`
(minor).
