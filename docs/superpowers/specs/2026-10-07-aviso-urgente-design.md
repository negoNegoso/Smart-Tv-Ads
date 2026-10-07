# Aviso urgente nas TVs — design

Data: 2026-10-07
Branch: `feat/aviso-urgente`

## Objetivo

Dar ao admin um jeito de tomar as TVs escolhidas na hora com um aviso de texto
("Hoje fechamos às 18h", "Sistema fora do ar", alerta de segurança), até o
aviso expirar ou ser encerrado.

Hoje só dá para fazer isso criando uma peça, uma campanha e esperando a
rotação. Não há como pausar o resto nem dizer "só isto, agora".

Terceiro de cinco sub-projetos de programação (faixas de horário ✓ →
frequência por volta ✓ → aviso urgente → conteúdo editorial → zonas na tela).

## Regras decididas

1. **Aviso operacional de texto.** Título (obrigatório) e texto (opcional). Não
   é venda: não é campanha, não entra em relatório de anunciante.
2. **Takeover total.** Enquanto o aviso vale para a TV, a volta dela é só o
   aviso. Campanhas, painéis e playlist ficam pausados nas TVs atingidas.
3. **Só o admin dispara.** O lojista não tem acesso neste sub-projeto.
4. **Alvo:** todas as TVs, por segmento (segmento da empresa dona da TV) ou
   por empresa (empresa dona da TV).
5. **Duração obrigatória, no máximo 24h.** O admin escolhe 30 min, 1h, 2h, 4h,
   8h ou 24h. Aviso esquecido nunca trava a rede para sempre. Começa na hora
   (sem agendamento).
6. **Encerrar a qualquer momento**, pelo admin.
7. **Mais de um aviso ativo para a mesma TV:** vale o mais recente.
8. **A TV vitrine ignora avisos**: ela é espelhada na landing pública.
9. **Chega em até ~1 min** (próxima busca do feed, que é a cada 60s); encerrar
   também. Sem push.
10. **Aviso não conta exibição**: a TV manda as exibições como de costume, o
    servidor aceita e descarta. Sem isso um aviso de horas na rede inteira
    inflaria o contador público de exibições da landing.
11. **A TV não muda.** A arte é imagem gerada no servidor; `tv.html` antigo em
    cache e o app Android mostram como qualquer peça.

## Dados

### Tabela nova `urgent_alerts` (`lib/db/src/schema/urgent_alerts.ts`)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | serial PK | |
| `title` | text NOT NULL | até 60 caracteres (validado na API) |
| `body` | text | até 140 caracteres; nulo = sem texto |
| `target_mode` | text NOT NULL | `"all"` \| `"segments"` \| `"companies"` |
| `segment_ids` | integer[] NOT NULL DEFAULT `{}` | usado só com `segments` |
| `company_ids` | integer[] NOT NULL DEFAULT `{}` | usado só com `companies` |
| `starts_at` | timestamptz NOT NULL DEFAULT now() | |
| `ends_at` | timestamptz NOT NULL | `starts_at` + duração |
| `ended_at` | timestamptz | encerrado à mão; nulo = não encerrado |
| `landscape_announcement_id` | integer FK announcements, ON DELETE SET NULL | arte 1920×1080 |
| `portrait_announcement_id` | integer FK announcements, ON DELETE SET NULL | arte 1080×1920 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Índice em `ends_at` (o feed filtra por ele a cada busca de toda TV).

IDs em arrays na própria tabela, e não em tabelas de ligação como nas
campanhas: o aviso vive horas, não é editado depois de criado, e o feed lê
tudo numa linha.

### Peças do aviso

As duas artes viram linhas em `announcements` com `source = "alert"`,
`mediaKind = "image"`, `orientation` `landscape`/`portrait`, `duration = 15`,
`isActive = true`, `title` = título do aviso. Existem como peças para a TV
poder registrar a exibição sem quebrar a FK de `plays`.

`GET /announcements` passa a excluir `source = "alert"`: a biblioteca de peças
e o seletor de peças da campanha não mostram avisos.

Migração versionada gerada com `pnpm --filter @workspace/db run generate`.
Esperado: `CREATE TABLE "urgent_alerts"`, as duas FKs e o índice; nada mais.

## Arte

- Template novo `alertNode(input, orientation)` em
  `artifacts/api-server/src/lib/alerts/alert-template.ts`, no mesmo estilo de
  árvore satori de `lib/panels/templates.ts` (`noticeNode`), com visual de
  alerta (faixa de cor de alerta, título grande, texto menor).
- `renderAlert(input, orientation): Promise<Buffer>` em
  `lib/alerts/render.ts`: 1920×1080 (`landscape`) ou 1080×1920 (`portrait`),
  reaproveitando o `rasterize` de `lib/panels/render.ts` (exportá-lo).
- Título e texto são truncados nos limites (60/140) antes do render.
- Imagens gravadas pelo mesmo `MediaStore` que os painéis usam
  (`store.put(png, "image/png", name)`).

## Regras puras (`lib/alerts/alert-eligibility.ts`)

```ts
export type AlertTarget = { targetMode: "all" | "segments" | "companies"; segmentIds: number[]; companyIds: number[] };
export type AlertWindow = { startsAt: Date; endsAt: Date; endedAt: Date | null; createdAt: Date };

// TV sem segmento fica fora do modo por segmento (mesma regra das campanhas).
export function alertReachesDevice(alert: AlertTarget, device: { companyId: number; segmentId: number | null }): boolean;

// Ativo: startsAt ≤ now < endsAt e endedAt nulo.
export function alertIsActive(alert: AlertWindow, now: Date): boolean;

// O ativo mais recente (createdAt, depois id) que atinge a TV; null se nenhum.
export function activeAlertFor<T extends AlertTarget & AlertWindow & { id: number }>(
  alerts: T[], device: { companyId: number; segmentId: number | null }, now: Date,
): T | null;
```

## Feed (`artifacts/api-server/src/lib/device-feed.ts`)

No começo de `loadDeviceSlides`, para TV que **não** é vitrine:

1. Busca os avisos não encerrados com `ends_at > now` (consulta pequena,
   índice em `ends_at`), junto com as duas peças.
2. `activeAlertFor(...)`. Se houver aviso: devolve uma lista com **uma** peça —
   a da orientação da tela (`screenOrientationOf(device.orientation)`), no
   formato normal de slide (`source: "alert"`, sem QR, sem legenda). Se a peça
   daquela orientação não existir (apagada), cai para a volta normal.
3. Sem aviso: segue exatamente como hoje.

Falha na consulta de avisos é logada e cai para a volta normal: aviso nunca
pode tirar as campanhas do ar por erro.

`DeviceSlideSource` ganha `"alert"`.

## Telemetria (`artifacts/api-server/src/routes/telemetry.ts` / `lib/telemetry/record-plays.ts`)

Exibição de peça com `source = "alert"` é aceita (resposta igual à de hoje,
para a fila da TV esvaziar) e não é gravada em `plays`. Vale para
`/telemetry/plays` e para o endpoint antigo `/telemetry/play`.

## API (`artifacts/api-server/src/routes/urgent-alerts.ts`, só admin)

Registrado em `routes/index.ts` depois de `router.use(requireAdmin)`.

- `POST /urgent-alerts`
  - corpo: `{ title, body?, targetMode, segmentIds?, companyIds?, durationMinutes }`
  - zod: `title` trim 1–60; `body` trim até 140 (vazio vira nulo);
    `targetMode` enum; `durationMinutes` ∈ {30, 60, 120, 240, 480, 1440};
    `segmentIds` não vazio quando `segments`; `companyIds` não vazio quando
    `companies`.
  - renderiza as duas artes, grava, cria as duas peças e o aviso. Falha no
    render → 500 e nada criado.
  - 201 com o aviso no formato do GET.
- `GET /urgent-alerts` → ativos primeiro (mais recente antes), depois os 20
  mais recentes não ativos. Cada item: `id, title, body, targetMode,
  segmentIds, companyIds, startsAt, endsAt, endedAt, status ("active" |
  "expired" | "ended"), reachedDevices` (TVs atingidas, vitrine fora) e
  `landscapeImageUrl`, `portraitImageUrl`.
- `POST /urgent-alerts/:id/end` → grava `ended_at = now` se ainda nulo
  (idempotente); 404 se não existe; 200 com o aviso.

## Interface (`artifacts/signage`)

- Página nova `/avisos` (`pages/urgent-alerts.tsx`), item "Avisos urgentes"
  no grupo "Operação" de `components/nav-config.ts` (ícone `Siren` do
  lucide).
- **Faixa no topo** quando há aviso ativo: "No ar em N TVs até HH:MM" e botão
  "Encerrar agora" (confirma antes; chama `/end` e recarrega).
- **Formulário**: título, texto, alvo (Todas as TVs / Segmentos / Empresas,
  com caixas de seleção carregadas de `/segments` e `/companies`), duração
  (select 30 min, 1h, 2h, 4h, 8h, 24h). "Publicar aviso" abre confirmação:
  "As TVs escolhidas vão mostrar só este aviso até HH:MM. Campanhas ficam
  pausadas nelas." Só depois envia.
- **Histórico**: miniatura (arte deitada), título, alvo, período, status.
- `components/device-preview.tsx`: `SOURCE_LABEL.alert = "Aviso urgente"`.
- Cliente HTTP em `lib/urgent-alerts-api.ts`, no padrão de
  `lib/segments-api.ts`.

## Testes (TDD)

API:

- `alert-eligibility.test.ts`: `all` atinge qualquer TV; `segments` atinge
  só TV do segmento e nunca TV sem segmento; `companies` só TV da empresa;
  ativo respeita início, fim exclusivo e `endedAt`; com dois ativos vale o
  mais recente; nenhum → null.
- `alert-template.test.ts`: `alertNode` monta as duas orientações; título e
  texto truncados nos limites.
- Rota `/display/:key/feed`: TV no alvo recebe só a peça do aviso, da
  orientação dela; TV fora do alvo recebe a volta normal; vitrine ignora;
  falha na consulta de avisos cai para a volta normal.
- Telemetria: exibição de peça `alert` responde como hoje e não chama o
  insert de `plays`.
- Rotas de aviso (render mockado): 400 para título vazio/longo, alvo vazio,
  duração fora da lista; criar chama o render 2× (landscape e portrait) e
  grava duas peças `alert`; falha no render → 500 sem insert; `end` grava
  `endedAt`, é idempotente e dá 404 para id inexistente; `GET` ordena ativos
  primeiro.
- `GET /announcements` não lista `source = "alert"`.

Web:

- `urgent-alerts.test.tsx`: formulário monta o corpo certo; só envia depois
  de confirmar; faixa de aviso ativo mostra TVs e horário e "Encerrar agora"
  chama o endpoint.
- `nav-config`: grupo Operação tem "Avisos urgentes" → `/avisos`.

## Fora do escopo

- Lojista disparar aviso; aviso intercalado na volta; faixa por cima do
  conteúdo; agendar início; editar aviso depois de criado; prévia ao vivo da
  arte; notificar quando expira; push para a TV.

## PR

Título: `feat(api): aviso urgente nas TVs` (minor).
