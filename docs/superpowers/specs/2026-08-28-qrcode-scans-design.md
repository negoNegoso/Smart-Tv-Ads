# QR code por peça de campanha e métrica de scans

**Data:** 2026-08-28
**Objetivo:** Exibir um QR code rastreável em cada peça veiculada por campanha, redirecionar o scan para um destino definido pelo painel e contabilizar os scans como métrica apresentada junto das exibições (plays).
**Escopo:** geração e exibição do QR, endpoint público de redirect, registro e contagem de scans, agregações de analytics e apresentação no painel. Fora de escopo: landing page própria do anunciante, atribuição de scan por dispositivo/TV e estimativa de audiência (OTS).

---

## 1. Decisão de produto: scans são uma boa métrica?

Sim, desde que lida como **métrica de resposta**, não de alcance.

- `scans / exibições` é o equivalente DOOH da taxa de clique: é o número que o anunciante entende e o que justifica renovação de contrato.
- Taxa típica em DOOH é baixa (ordem de 0,1% a 1%). Números pequenos são esperados e não indicam falha.
- A métrica é comparativa: serve para ranquear peças e campanhas entre si, sob condições semelhantes.

**Limites que devem estar escritos na interface e neste spec:**

- Um scan não é atribuível a uma exibição específica nem a uma TV específica. A taxa é a razão entre dois totais na mesma janela de tempo, não uma conversão medida por exibição.
- Um scan não equivale a uma pessoa nova: a mesma pessoa pode escanear mais de uma vez, e alguém pode escanear a foto do QR tirada por outra pessoa, dias depois.
- Previews de link (WhatsApp, redes sociais) e crawlers inflam o número bruto se não forem filtrados.

Por isso o sistema registra e apresenta **dois números**: scans brutos e visitantes únicos.

---

## 2. Granularidade

O QR é preso ao par **campanha ↔ peça** (`campaign_announcements`).

Motivo: `plays` já grava `campaignId` + `announcementId`, então `scans` na mesma granularidade permite calcular `scans / exibições` sem rateio nem estimativa. A mesma peça rodando em duas campanhas gera dois códigos e duas contagens separadas.

Descartado: QR por dispositivo. Exigiria uma imagem diferente por TV para a mesma peça, complicando o player, e a atribuição geográfica resultante não compensa o custo.

---

## 3. Modelo de dados

### 3.1 `campaign_announcements` — colunas novas

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `scan_code` | `text not null unique` | Base62, 8 caracteres, gerado no insert do vínculo. **Imutável** — QR já exibido ou impresso continua válido para sempre. |
| `destination_url` | `text` (nullable) | URL de destino do redirect. Nulo = sem QR no display. Vínculos existentes continuam funcionando sem migração de dados. |

Backfill: vínculos já existentes recebem `scan_code` gerado na migração e `destination_url` nulo.

### 3.2 Tabela nova `scans`

```
id                        serial primary key
campaign_announcement_id  integer  FK campaign_announcements  on delete set null
campaign_id               integer  FK campaigns               on delete set null
announcement_id           integer  FK announcements           on delete set null
visitor_id                text     (nullable)
fingerprint               text     (nullable)
user_agent                text     (nullable)
is_bot                    boolean  not null default false
created_at                timestamptz not null default now()
```

`campaign_id` e `announcement_id` são denormalizados com `on delete set null`, seguindo o padrão já usado em `plays`: se o vínculo campanha↔peça for removido, o histórico de scans sobrevive para o relatório.

Índices: `(campaign_id, created_at)` e `(announcement_id, created_at)`.

### 3.3 Privacidade (LGPD)

- O IP bruto **nunca** é gravado. Persiste-se apenas `fingerprint = sha256(SCAN_SALT + ip + userAgent)`.
- `SCAN_SALT` é variável de ambiente nova, documentada no README junto das demais.
- `visitor_id` é um UUID em cookie `sc_v` (validade 1 ano, `httpOnly`, `sameSite=lax`).

---

## 4. Contagem

- **Scans (bruto)** = linhas com `is_bot = false`.
- **Visitantes únicos** = `COUNT(DISTINCT COALESCE(visitor_id, fingerprint))` sobre as linhas com `is_bot = false` na janela consultada.
- **`is_bot`** = verdadeiro quando o user-agent casa com a lista de previews e crawlers conhecidos (`facebookexternalhit`, `WhatsApp`, `Twitterbot`, `Slackbot`, `bot`, `crawler`, `spider`, `curl`, `wget`, `preview`). Linhas de bot **são gravadas**, apenas não entram nas contagens — isso permite auditoria posterior.
- **`scanRate`** = `scans / plays` na mesma janela e mesma chave de agregação. Quando `plays = 0`, o valor é `0` (nunca divisão por zero, nunca `null`).

---

## 5. Endpoints

### 5.1 `GET /r/:code` — redirect público

Fica **fora do prefixo `/api`**, para manter a URL curta e o QR com menos módulos (mais legível de longe, que é o caso de uso na TV).

Hoje `artifacts/api-server/src/app.ts` monta todas as rotas em `app.use("/api", router)`. Este endpoint exige uma montagem própria: `app.use("/r", redirectRouter)`, antes do router `/api`.

Leitura e escrita do cookie exigem `cookie-parser` (dependência nova no `api-server`) ou parsing manual do header `Cookie`. Preferir `cookie-parser`, aplicado **apenas** ao router de redirect — as demais rotas não precisam de cookie.

Fluxo:

1. Resolve `scan_code` → vínculo + `destination_url`.
2. Código inexistente **ou** `destination_url` nulo → `404`.
3. Define o cookie `sc_v` se ausente; insere a linha em `scans`.
4. Responde `302` para o destino.

O insert é envolvido em `try/catch` e não bloqueia a resposta: falha de banco não pode quebrar o redirect do usuário final. Erro é logado.

### 5.2 `GET /api/qr/:code.png` — imagem do QR

- Dependência nova: `qrcode`, no pacote `@workspace/api-server`.
- Conteúdo codificado: `${PUBLIC_BASE_URL}/r/${code}`.
- Nível de correção de erro **M** (15%), margem de 2 módulos, escala fixa de 512px. Nível M suporta reflexo e sujeira na tela sem inflar o número de módulos.
- `Cache-Control: public, max-age=31536000, immutable`. O código é imutável, então a Smart TV baixa a imagem uma única vez.
- Código inexistente → `404`.
- `PUBLIC_BASE_URL` é variável de ambiente nova e aponta para o **host da API** (é lá que `/r/:code` vive), não para o host do frontend. Se ausente, usa `req.protocol` + `req.get('host')`, o que mantém o desenvolvimento local funcionando sem configuração.

### 5.3 `GET /display/:deviceKey/slides` — campo novo

Cada slide passa a devolver:

```
qrImageUrl: string | null   // ex.: "/api/qr/AbC12XyZ.png"
```

É `null` quando o slide vem da playlist do dispositivo (`campaignId` nulo) ou quando o vínculo não tem `destination_url`. O campo entra como opcional no `lib/api-spec/openapi.yaml`, então clientes antigos não quebram.

### 5.4 Analytics

`GET /analytics/summary` ganha:
- `totalScans`, `totalUniqueScans`
- em cada item de `topAnnouncements`: `scans` e `scanRate`

`GET /analytics/announcements/:announcementId` ganha:
- `totalScans`, `totalUniqueScans`, `scanRate`
- `byCampaign`: `campaignId`, `campaignName`, `plays`, `scans`, `scanRate`

`GET /analytics/campaigns/:campaignId` — **endpoint novo**:
- `campaignId`, `campaignName`, `advertiserId`, `advertiserName`, `startsAt`, `endsAt`
- `totalPlays`, `totalScans`, `totalUniqueScans`, `scanRate`
- `byAnnouncement`: `announcementId`, `title`, `plays`, `scans`, `scanRate`

Implementação: plays e scans são agregados em **queries separadas** e combinados em memória pela chave `(campaignId, announcementId)`. Um `JOIN` direto entre as duas tabelas multiplicaria linhas e corromperia ambas as contagens.

---

## 6. Exibição do QR no player

O QR é desenhado como sobreposição em tempo de exibição. A imagem original da peça nunca é alterada — trocar o destino do link não exige novo upload, e a mesma peça em outra campanha mostra automaticamente outro QR.

Dois pontos de render, com comportamento idêntico:

- `artifacts/signage/public/tv.html` (JavaScript puro, Smart TV antiga): elemento `<img>` posicionado de forma absoluta, canto inferior direito, cerca de 12% da altura da tela, sobre fundo branco com padding. O fundo branco é obrigatório: o QR precisa de zona de silêncio clara para ser lido sobre peças escuras. O elemento só é criado quando `slide.qrImageUrl` existe.
- `artifacts/signage/src/pages/display.tsx` (React): componente `QrOverlay` com o mesmo posicionamento.

Nenhuma biblioteca de QR roda no cliente — `tv.html` precisa funcionar em navegadores de TV antigos, e a imagem já vem pronta do servidor.

Sem legenda de texto do tipo "aponte a câmera": ocupa espaço da peça do anunciante. Pode ser reavaliado depois, com dados de scan em mãos.

---

## 7. Painel administrativo

Em `advertisers.tsx` / `advertiser-detail.tsx`:

- Ao vincular uma peça a uma campanha, campo **URL de destino** (opcional, validação de `https?://`).
- Na lista de peças da campanha: miniatura do QR, botão de copiar o link curto e botão de baixar o PNG. O anunciante vai pedir o QR para usar em outras mídias.
- Por campanha: exibições, scans e taxa, na mesma linha.

Em `analytics.tsx`:

- Card **Total de scans** na grade de estatísticas, com os únicos como subtítulo.
- Colunas **Scans** e **Taxa** na tabela "Anúncios em destaque".
- Taxa formatada com 2 casas decimais (`0,37%`). Arredondar para inteiro transformaria quase todos os valores em `0%` e destruiria a informação.
- Nota de rodapé curta: scan mede resposta, não alcance; múltiplos scans da mesma pessoa contam no número bruto.

---

## 8. Verificação

O repositório não possui runner de testes hoje — nenhum `*.test.ts`, nenhuma configuração de vitest ou jest, nenhum script `test`.

**Adicionar `vitest` ao `@workspace/api-server`**, com escopo mínimo, cobrindo apenas lógica pura:

- geração de `scanCode`: tamanho (8), alfabeto (base62) e ausência de colisão em 10.000 gerações;
- detecção de bot por user-agent: `facebookexternalhit`, `WhatsApp` e `curl` classificam como bot; Safari iOS e Chrome Android não;
- cálculo de `scanRate`, incluindo o caso `plays = 0`.

Essas três são exatamente onde um erro passa silencioso e contamina o número entregue ao anunciante.

**Checklist manual** para redirect, imagem e render:

- `curl -i /r/CODE` devolve `302` com `Location` correto e `Set-Cookie: sc_v`;
- segundo acesso com o mesmo cookie incrementa o bruto e não incrementa o único;
- código inexistente devolve `404`;
- vínculo sem `destination_url` devolve `404`;
- `GET /api/qr/CODE.png` devolve PNG com o `Cache-Control` esperado;
- `tv.html` exibe a sobreposição sobre um slide de campanha e não a exibe em slide de playlist.

Antes de publicar: `pnpm run typecheck` e `pnpm run build`.

---

## 9. Arquivos afetados

| Área | Arquivos |
| --- | --- |
| Schema | `lib/db/src/schema/campaign_announcements.ts`, `lib/db/src/schema/scans.ts` (novo), `lib/db/src/schema/index.ts` |
| Contrato | `lib/api-spec/openapi.yaml` (+ codegen do `@workspace/api-client-react`) |
| API | `artifacts/api-server/src/app.ts` (montar `/r`), `src/routes/redirect.ts` (novo), `qr.ts` (novo), `analytics.ts`, `display.ts`, `advertisers.ts`, `index.ts`, `lib/scan-code.ts` (novo), `lib/bot-detect.ts` (novo) |
| Frontend | `artifacts/signage/public/tv.html`, `src/pages/display.tsx`, `src/pages/analytics.tsx`, `src/pages/advertiser-detail.tsx`, `src/pages/advertisers.tsx` |
| Docs | `README.md` (variáveis `SCAN_SALT` e `PUBLIC_BASE_URL`; seção de arquitetura funcional) |
