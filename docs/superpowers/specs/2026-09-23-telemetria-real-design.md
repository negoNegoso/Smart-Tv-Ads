# Duração real das exibições e fila de reenvio na TV — design

Data: 2026-09-23
Branch: `feat/telemetria-fila`

## Objetivo

Deixar os números de exibição e de tempo de tela fiéis ao que passou na TV
antes de a plataforma entrar em produção. Dois problemas da revisão de
métricas:

1. **Tempo de exibição errado para vídeo.** A TV manda a duração configurada
   na peça (`slide.duration`), não o tempo do vídeo. Um Short de 77 s em modo
   natural vira 10 s; um vídeo de 60 s em modo capped, passado em 6 pedaços de
   10 s, vira 1 exibição de 10 s.
2. **Exibição perdida quando a rede falha.** O `tv.html` manda cada exibição
   uma vez (`xhrPost`, fire-and-forget). Internet instável na loja = números
   abaixo do real.

## Regras decididas

- **Exibição de vídeo conta 1 quando o vídeo passa inteiro**, em modo natural
  ou capped, mesmo que em pedaços.
- **O tempo registrado de um vídeo é o tempo total do vídeo.**
- Vídeo que começou e não terminou (TV desligou, campanha saiu do ar) não conta
  exibição nem tempo.
- Imagem, e vídeo que caiu no fallback de miniatura, continuam como hoje:
  1 exibição com a duração configurada.
- Exibição reenviada depois conta no **dia em que passou na tela**, não no dia
  em que chegou ao servidor.
- A TV guarda exibições não enviadas por **até 7 dias**.
- Reenvio nunca conta a mesma exibição duas vezes.

## Fora do escopo

- Conferir se a peça/campanha enviada estava mesmo programada naquela TV e
  limitar envios por minuto (item 3 da revisão de métricas). O
  `client_play_id` desta mudança prepara o terreno para isso.
- Deduplicar a mesma key aberta em duas telas ao mesmo tempo (item 2).
- Separar o banco do preview do de produção (item 1).
- `pages/display.tsx` (rota legada `/display/:key`): segue no endpoint antigo,
  sem fila.

## 1. Dados

Migração `0013` (gerada por `drizzle-kit generate`), só acréscimo:

- `plays.client_play_id text` — nulo nas linhas antigas e nas exibições do
  endpoint antigo.
- Índice único `plays_device_client_play_idx` em `(device_id, client_play_id)`.
  Postgres permite vários `NULL` num índice único, então as linhas antigas não
  conflitam.

As migrações rodam no build da Vercel, **inclusive no preview**, e preview e
produção usam o mesmo banco. Por isso a mudança tem de ser compatível com o
código que já está no ar: coluna anulável e índice são ignorados por ele.
`CREATE UNIQUE INDEX` trava escrita em `plays` durante a criação; no tamanho
atual da tabela, menos de um segundo.

## 2. O que a TV registra (`public/tv.html`, ES5)

`recordImpression(slide)` passa a receber a duração a registrar:

| Caso | Quando registra | `durationSeconds` |
|---|---|---|
| Imagem | fim do cronômetro (como hoje) | `slide.duration` |
| Vídeo em fallback de miniatura | fim do cronômetro (como hoje) | `slide.duration` |
| Vídeo natural ou capped | fim do vídeo: `ENDED` ou vigia de laço (`vigiarFim`) | `player.getDuration()` |
| Vídeo de playlist do YouTube | fim de cada vídeo | `getDuration()` daquele vídeo |
| Vídeo que não terminou | nunca | — |

- `getDuration()` que devolve 0, `NaN` ou lança: usa a última posição lida pela
  vigia (`getCurrentTime()`), que no fim do vídeo é praticamente a duração.
  Sem nenhuma das duas: `slide.duration`.
- A duração é lida **antes** de `teardownYt()` destruir o player.
- Capped: hoje o corte (`goNextNoCount`) já não conta, e o `ENDED` do último
  pedaço conta via `goNext`. Só muda o valor da duração.

## 3. Fila na TV (`public/tv.html`)

### Item

Array compacto no `localStorage` (chave `signage_play_queue`):

```
[playId, announcementId, campaignId|null, durationSeconds, shownAtMs]
```

- `playId`: 12 caracteres base36 aleatórios (`Math.random`, ES5). Só precisa
  ser único por TV.
- `shownAtMs`: `Date.now()` da TV no momento da exibição.
- ~50 bytes por item; 60 mil itens (7 dias de peças de 10 s, 24 h) ≈ 3 MB.

### Envio

- Gatilhos: logo depois de cada exibição nova, ao carregar a página e a cada
  60 s (junto do refresh do feed que já existe).
- Um envio por vez, lote de até **200** itens, dos mais antigos para os mais
  novos.
- Cada item vai com `ageSeconds = (Date.now() - shownAtMs) / 1000`, limitado a
  `[0, 7 dias]`. Idade relativa em vez de data: um relógio de TV errado (comum
  em TV box sem bateria) se cancela na subtração, e o servidor converte com o
  relógio dele.

### Resposta

| Resposta | O que a TV faz |
|---|---|
| 2xx | Tira os itens enviados; se sobrar fila, manda o próximo lote. |
| Rede/timeout/5xx | Mantém tudo; tenta no próximo gatilho. |
| 404 com o corpo exato `{"error":"Device not found"}` | Esvazia a fila (TV apagada/desvinculada). |
| 400 | Descarta o lote e segue — item estragado não trava a fila para sempre. |

### Limites e gravação

- Antes de cada envio, itens com `shownAtMs` mais velho que 7 dias saem.
- Mais de **70.000** itens: os mais antigos saem.
- Fila com até 500 itens: grava no `localStorage` a cada mudança. Acima disso,
  no máximo a cada 30 s (não regravar 3 MB a cada 10 s num aparelho fraco).
  Queda de energia com fila grande perde no máximo 30 s.
- `localStorage` indisponível ou cheio: a fila segue só em memória; tudo em
  `try/catch`, como o resto do `tv.html`.
- Fila corrompida (JSON inválido, item com formato errado): descarta o que não
  tiver o formato esperado.

## 4. Servidor

### `POST /api/telemetry/plays` (novo, no `openapi.yaml`)

Corpo (`PlayBatchInput`):

```
{
  deviceKey: string,
  plays: [                       // 1..200
    {
      playId: string,            // 8..40 caracteres
      announcementId: integer,
      campaignId: integer | null,
      durationSeconds: number,   // 0..86400
      ageSeconds: number         // >= 0
    }
  ]
}
```

- Validação Zod (gerada do openapi). Falhou → `400`.
- Key desconhecida → `404 {"error":"Device not found"}` (mesmo corpo do feed).
- Peças inexistentes (apagadas) → item descartado.
- Campanha inexistente → grava `campaign_id` nulo (mesmo efeito do
  `ON DELETE SET NULL`).
- `created_at = agora do servidor − min(ageSeconds, 7 dias)`.
- `INSERT ... ON CONFLICT (device_id, client_play_id) DO NOTHING`.
- Resposta `200 { accepted, duplicates, discarded }`.

### O que não muda

- `POST /api/telemetry/play` segue igual (TVs com `tv.html` antigo em cache e
  `display.tsx`).
- Consultas de métricas: continuam contando linhas e somando
  `duration_seconds`.

## 5. Testes

**API** (`routes/__tests__`, estilo dos existentes):
- lote válido grava tudo com `created_at` = agora − idade;
- mesmo lote reenviado → `duplicates`, nada novo;
- peça apagada → `discarded`;
- campanha apagada → grava com campanha nula;
- key desconhecida → 404 com o corpo exato;
- idade acima de 7 dias → limitada a 7 dias;
- payload inválido (lote vazio, > 200, `playId` curto) → 400.

**`tv.html`** (`src/__tests__/tv-html.test.ts`, com os fakes de XHR e do
player já existentes):
- imagem registra `slide.duration`;
- Short natural registra `getDuration()`;
- vídeo capped em pedaços registra 1 exibição com `getDuration()` no fim;
- sem rede, a fila guarda; rede volta, reenvia e esvazia;
- 404 esvazia a fila; 400 descarta o lote e segue;
- item com mais de 7 dias sai; fila sobrevive a recarregar a página
  (`localStorage`).

**Migração**: aplicar no Postgres descartável (Docker) e confirmar o
`ON CONFLICT` com um insert repetido.

## Riscos

- **Migração no banco compartilhado antes do merge.** Mitigado por ser só
  acréscimo.
- **TVs com `tv.html` antigo em cache** seguem no endpoint antigo com a duração
  configurada até recarregar a página (recarga diária do app).
- **Relógio da TV que pula no meio de uma queda longa** pode deslocar a data de
  algumas exibições; o limite de `[0, 7 dias]` evita datas absurdas.

## Versão

PR `feat(tv): duração real dos vídeos e fila de reenvio das exibições` → minor.
