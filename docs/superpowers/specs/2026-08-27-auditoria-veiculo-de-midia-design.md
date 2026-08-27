# Auditoria conceitual do veículo de mídia

**Data:** 2026-08-27
**Objetivo:** Validar se a modelagem/arquitetura do nosso veículo de mídia (ad server de DOOH/Smart TV) está estruturada corretamente, comparando com plataformas consolidadas (Google Ads, Meta) e com empresas do mesmo segmento de mídia indoor/DOOH.
**Escopo desta auditoria:** os três ajustes essenciais (#1, #2, #3). Camada de flight/ad-set e roadmap (SOV, dayparting, CPM, formatos, taxonomia de venue) ficam registrados como evolução futura, fora do escopo de implementação imediata.

---

## 1. Referências de mercado

Princípio comum às plataformas consolidadas: **separar camadas por responsabilidade** — a camada comercial (campanha), a de entrega/segmentação (ad set / flight) e a de criativo (anúncio) são distintas, e cada exibição precisa ser rastreável de volta à campanha que a gerou.

| Plataforma | Camadas (topo → base) |
| --- | --- |
| Google Ads | Conta → Campanha (orçamento, lance, objetivo, segmentação) → Grupo de anúncios → Anúncios (criativo) |
| Meta | Campanha (objetivo) → Ad Set (público, posicionamento, agenda, orçamento, lance) → Anúncio (criativo) |
| DOOH / OpenOOH+IAB | Campanha → Flight (janela + telas/venues + frequência) → Creative → **Play / Proof-of-Play** → Impressão (audiência/OTS) |

### Empresas do mesmo segmento (validação)

- **Ad networks indoor/DOOH** (Vistar Media, Broadsign, Grocery TV, Captivate): o registro de *play / proof-of-play* segue o formato
  `Play (PoP): id, timestamp, screen_id, creative_id, campaign_id, duration`.
  Ou seja, **a indústria grava `campaign_id` no próprio registro de play** — é o campo que hoje falta na nossa tabela `impressions`.
- **Play ≠ Impressão:** redes separam **Play** (métrica de entrega — rodou na tela) de **Impressão** (estimativa de audiência = plays × multiplicador de fluxo/dwell do ponto). Grocery TV usa tráfego de loja; Captivate usa sensores de fluxo do prédio.
- **Unidade real de venda/escassez:** SOV / slot de loop (ex.: slot de 1 min em loop de 5 min = 20% de share of voice). Cobrança por-play, por-SOV ou CPM.
- **Venue vs Screen:** as redes separam **Venue** (propriedade + tipo de venue) de **Screen** (hardware).
- **CMS de digital signage** (Yodeck, ScreenCloud, OptiSigns, NoviSign): modelam Player, Playlist (ligada ao player, com prioridade/frequência) e evento de Proof-of-Play (`Player_ID, Playlist_ID, Media_ID, Duration, Result`).

---

## 2. Modelo atual (resumo)

Lado da **oferta** (inventário):
- `clients` — donos/operadores das TVs.
- `devices` — cada TV (screen), com `device_key` e `location` (texto livre), ligada a um `client`.
- `device_playlist` — playlist por dispositivo (anúncio + ordem + ativo).

Lado da **demanda**:
- `advertisers` — quem paga.
- `campaigns` — `advertiserId` (escalar) + nome + `contractValue` + `startsAt`/`endsAt` + `allDevices` + `isActive`.
- `campaign_announcements` (m2m) — criativos da campanha.
- `campaign_advertisers` (m2m) — anunciantes da campanha.
- `campaign_devices` (m2m) — segmentação por dispositivo.
- `announcements` — a peça (imagem + duração + ordem).

Telemetria:
- `impressions` — `deviceId` + `announcementId` + `durationSeconds` + `createdAt`.

---

## 3. Veredito

### O que está sólido e alinhado ao mercado ✅

- **Modelo de dois lados bem separado:** oferta (`clients → devices` = inventário) vs. demanda (`advertisers → campaigns → creatives`, com segmentação por device). Muitos sistemas simples erram justamente aqui.
- **Vários criativos por campanha** (`campaign_announcements`) e **playlist por dispositivo** (`device_playlist`) seguem o padrão de CMS do segmento.
- Segmentação por dispositivo via `campaign_devices` + `allDevices` é coerente com o padrão de targeting por screen.

### Lacunas estruturais ⚠️

Ordenadas por gravidade. As três primeiras são o escopo desta auditoria.

---

## 4. Recomendações (escopo essencial)

### #1 — Atribuir play → campanha (mais grave)

**Problema.** `impressions` guarda apenas `deviceId + announcementId`. Como o mesmo anúncio pode estar em várias campanhas (`campaign_announcements` é m2m), não há como afirmar com certeza **qual campanha** gerou o play — que é exatamente o que fatura o anunciante.

**Evidência no código.**
- `artifacts/api-server/src/routes/telemetry.ts` insere o play sem `campaignId` (a TV só envia `deviceKey, announcementId, durationSeconds`).
- `artifacts/api-server/src/routes/advertisers.ts` conta impressões por campanha com uma subquery correlacionada que **infere** a atribuição por `announcement_id` + faixas de `created_at` (campanha, vínculo do anúncio e vínculo do device). Essa inferência frágil por timestamp é a origem dos bugfixes recentes (`escopar impressões por vínculo do device`, `contar a partir do vínculo do anúncio`, `não contar impressões anteriores à criação da campanha`).
- O segmento (Vistar, Broadsign) grava `campaign_id` diretamente no registro de play.

**Recomendação.**
- Adicionar coluna `campaignId` em `impressions` (FK → `campaigns`, `onDelete: cascade`). Opcionalmente `campaignAnnouncementId` para granularidade por criativo dentro da campanha.
- No momento do play, o display já resolve a campanha ativa → a telemetria passa a enviar `campaignId`; o endpoint grava direto.
- As contagens em `advertisers.ts` deixam de ser inferência por timestamp e viram `where campaign_id = ?`.
- **Backfill:** coluna nullable; linhas históricas recebem atribuição best-effort (a lógica de inferência atual) ou permanecem `null` (histórico não atribuível). Dados novos passam a ser `notNull` na aplicação.

### #2 — Resolver o conflito de anunciante (uma fonte da verdade)

**Problema.** Existem `campaigns.advertiserId` (escalar, `notNull`) **e** `campaign_advertisers` (m2m) representando a mesma relação, usados simultaneamente.

**Evidência no código.**
- `advertisers.ts` faz `innerJoin` em `campaigns.advertiserId` (dono único) para as estatísticas da campanha, **e** usa `campaign_advertisers` para montar `advertiserNames` e para a contagem de campanhas na tela de anunciantes.
- O input aceita `advertiserId` **e** `advertiserIds`. Se as duas fontes divergirem, os números divergem — bug latente.

**Recomendação (padrão de mercado).**
- **Uma campanha pertence a um anunciante** (Google/Meta/DOOH). Manter `campaigns.advertiserId` como fonte única, **descartar `campaign_advertisers`**, e ajustar a tela de anunciantes para contar/associar via `advertiserId`.
- **Alternativa** (somente se houver caso de negócio real de rateio entre coanunciantes): descartar o escalar e usar apenas o m2m. É incomum; não adotar sem necessidade concreta.

### #3 — Separar Play vs Impressão (conceito)

**Problema.** O que registramos hoje é um render com duração (prova de exibição), não audiência. Chamar isso de "impressão" contradiz o significado do termo no segmento.

**Recomendação.**
- Tratar o registro como **Play / Proof-of-Play** (entrega) na linguagem de domínio.
- Reservar "impressão/audiência" para uma camada futura: `impressão = plays × multiplicador de fluxo do ponto`.
- Renomear a tabela `impressions` → `plays` é **opcional** (invasivo em API e frontend, que expõem "impressões"). Aceitável: manter o nome físico por ora, documentar a semântica e nomear código novo como `plays`. Decisão fica registrada para a fase de plano.

---

## 5. Fora de escopo (roadmap futuro)

Registrado, não recomendado para implementação agora:

- **Camada de flight / ad set:** hoje a campanha acumula três papéis (comercial + entrega + pacote de criativos). Uma camada de flight permitiria o mesmo criativo com agendas/telas diferentes sem duplicar a campanha. Adotar quando surgir a necessidade.
- **SOV / slot de loop:** unidade real de venda no segmento; `priority`/`frequency` na campanha e modelo de loop.
- **Dayparting:** segmentação por hora do dia (hoje só há data início/fim).
- **Precificação:** `contractValue` é um valor único; falta modelo (CPM / por-play / flat) e reconciliação entregue vs. contratado.
- **Formatos de criativo e taxonomia de venue:** hoje só imagem + duração; sem vídeo/formato/dimensões nem tipo de venue (OpenOOH) para segmentação.

---

## 6. Conclusão

A estrutura de dois lados (oferta/demanda) está **sólida e alinhada** ao mercado e ao segmento indoor/DOOH. A auditoria não indica redesenho. Os três ajustes essenciais — principalmente **gravar `campaign_id` no play** — corrigem a integridade de atribuição/faturamento e são exatamente como as empresas do mesmo nicho modelam o problema. Os demais itens são evoluções naturais, não correções.
