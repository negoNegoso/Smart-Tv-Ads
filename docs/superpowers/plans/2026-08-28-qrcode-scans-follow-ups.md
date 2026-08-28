# QR code e scans — pendências após a implementação

**Data:** 2026-08-28
**Branch:** `feat/qrcode-scans`
**Spec:** `docs/superpowers/specs/2026-08-28-qrcode-scans-design.md`
**Plano:** `docs/superpowers/plans/2026-08-28-qrcode-scans.md`

A feature foi implementada nas 13 tasks do plano, revisada task a task e depois na branch inteira. O que segue é o que **não** foi corrigido, com o motivo. Nada aqui bloqueia o merge; os dois primeiros itens bloqueiam a publicação.

---

## Antes de publicar

### 1. Confirmar que `/r/CODE` chega na API em produção

A feature introduz um prefixo de rota **fora de `/api`**. A única mudança de roteamento versionada é o proxy do Vite, que só vale em desenvolvimento. O `.replit` usa `router = "application"` e a configuração desse roteador não está no repositório.

Se o roteador público encaminhar apenas `/api`, **todo QR gerado é natimorto** — e QR é permanente por design, então o erro seria descoberto depois do material impresso e afixado.

Verificação obrigatória após o deploy:

```bash
curl -i https://<host-público>/r/<CODE>
```

Esperado: `302` com `Location` para o destino cadastrado.

Reconciliar também a documentação: a spec §5.2 diz que `PUBLIC_BASE_URL` aponta para "o host da API"; o checklist do plano diz "a mesma origem que serve o painel". Qual está correto depende do resultado dessa verificação — ajustar o texto perdedor.

### 2. Escanear um QR de verdade

Nenhum QR desta feature foi escaneado por um celular, em lugar nenhum, nem em desenvolvimento. A corrente completa (`PUBLIC_BASE_URL` → PNG → câmera → `/r` → 302 → linha em `scans` → painel) nunca foi exercitada ponta a ponta.

O motivo é o item 3 abaixo: com os dados atuais nenhum slide entrega QR para a TV. Depois de resolver a modelagem das campanhas, esse teste passa a ser possível — e é o único que valida a feature inteira.

---

## Decisões de produto em aberto

### 3. Dedup de peça repetida entre campanhas

`display.ts` deduplica slides por `announcementId` e mantém o da campanha de **menor id**. Se a mesma peça está em duas campanhas ativas e só a de id maior tem `destination_url`, o QR nunca chega à TV.

Consequência de métrica, além do render: no `/analytics/announcements/:id`, o `totalPlays` soma as duas campanhas e o `totalScans` só a que tem QR — a taxa da peça sai **subestimada**, não apenas zerada.

Não foi corrigido porque trocar a preferência da dedup mudaria qual campanha recebe a atribuição do play (`campaignId` na telemetria), o que é decisão de faturamento.

**Encaminhamento recomendado:** resolver pela modelagem, não pelo código. Uma campanha por empresa/anunciante, cada uma com a peça dela, faz `announcementId` nunca se repetir entre campanhas ativas — a dedup deixa de disparar e passa a funcionar como rede de segurança para duplicação acidental.

### 4. Invalidação do QR ao desvincular uma peça

O `PATCH` de campanha apaga a linha de `campaign_announcements` quando o operador desmarca a peça. Remarcar cria um `scanCode` novo, e o código antigo passa a devolver 404 **para sempre** — enquanto a spec §3.1 promete imutabilidade. Apagar a campanha inteira tem o mesmo efeito via cascade.

Foi adicionado um **aviso na interface** quando a peça marcada já tem QR publicado. O comportamento de exclusão não mudou, porque desvincular a peça da campanha é o que o operador realmente pediu.

**Decisão pendente:** manter assim (aviso apenas), ou passar a preservar a linha quando ela já tiver scans, anulando só o `destination_url`.

### 5. `GET /api/analytics/campaigns/:campaignId` não tem consumidor

O endpoint existe, está no contrato e é gerado no cliente React, mas nenhuma tela o usa: a Task 12 montou as métricas de campanha a partir do `announcementLinks` do `advertisers.ts`. São duas fontes para o mesmo número, uma delas morta e portanto nunca exercitada.

**Decisão pendente:** ou a tela de campanha passa a consumi-lo, ou ele sai.

### 6. Distinguir campanha paga de permuta

O schema não tem campo para o tipo de campanha. Para separar receita real de espaço em permuta nos relatórios, hoje só há convenção de nome ou o uso de `contractValue` como valor estimado da troca. Um campo próprio exigiria mudança de schema.

---

## Dívida técnica conhecida

### 7. Abuso da métrica é trivial

`/r/:code` é público por design, e o código fica visível numa TV. Não há rate limit, throttle por fingerprint nem teto por janela. Um laço com user-agent de navegador e sem cookie infla scans brutos e únicos.

A enumeração de códigos em si não preocupa (62⁸ ≈ 2,2×10¹⁴), mas o abuso do código já conhecido, sim.

**Correção mínima quando fizer sentido:** rate limit por IP no router `/r` e um teto de scans por `(fingerprint, campaign_announcement_id, hora)`.

### 8. `plays` não tem índice, e a subquery está duplicada

`campaignSelection` em `advertisers.ts` calcula, por peça, o mesmo `count(*) from plays where campaign_id = X and announcement_id = Y` que `playsByAnnouncement` já calcula na mesma seleção. A tabela `plays` não tem nenhum índice além da PK.

São duas varreduras completas por par (campanha, peça), num objeto usado tanto em `GET /campaigns` quanto aninhado em `GET /advertisers`. Cresce com campanhas × peças × volume de plays.

**Correção:** índice em `plays(campaign_id, announcement_id)` e reuso do valor já calculado.

### 9. Lookup do `scan_code` fora do `try/catch`

Em `redirect.ts`, o insert do scan está protegido, mas a consulta que resolve o código não. Banco fora do ar vira 500 genérico do Express no único caminho público voltado ao consumidor final do anunciante.

### 10. Menores

- `advertiser-detail.tsx` recalcula a taxa no cliente, reimplementando `scanRate` e sua guarda de divisão por zero.
- "Copiar link" monta a URL com `window.location.origin`; o PNG codifica `PUBLIC_BASE_URL`. Se as origens divergirem, o link copiado e o QR apontam para lugares diferentes.
- `qr.ts` usa `req.log.error`, `redirect.ts` usa o `logger` importado. Mesma feature, dois estilos.
- A lista de campanhas mostra exibições sem scans nem taxa; o detalhe do anunciante mostra os três.
- `fingerprintFor` junta `ip|ua` sem escape (colisão teórica se o user-agent contiver `|`).
- User-agent composto só de espaços em branco não é classificado como bot.
- O `<a download><Button>` do "Baixar PNG" aninha elemento interativo dentro de âncora.
- `announcementDestinations` carrega chaves de peças desmarcadas no payload; o backend as ignora.
- Textos com plural sem concordância ("1 visitantes únicos", "1 exibições") — segue o padrão pré-existente do painel.
