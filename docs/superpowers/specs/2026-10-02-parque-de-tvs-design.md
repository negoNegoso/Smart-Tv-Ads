# Parque de TVs: status, versão do app e histórico de conexão — design

Data: 2026-10-02
Branch: `feat/parque-de-tvs`

## Objetivo

Dar ao admin uma visão do parque inteiro: quais TVs estão online agora, que
versão do app cada uma roda e quando cada uma caiu e voltou.

Hoje o admin só vê as TVs dentro de cada empresa, com a data do "visto por
último" e sem indicação de online. A versão do app nunca é gravada, embora o
app Android já a envie em toda requisição.

## Regras decididas

- **Só o admin vê.** Todas as TVs de todas as empresas numa tela.
- **Online = falou com o servidor nos últimos 5 minutos**, a mesma janela do
  portal do cliente (`DEVICE_ONLINE_WINDOW_MINUTES`). A TV busca o feed a cada
  60 s.
- **A versão é a do último contato.** Sai do `User-Agent`
  (`SignageApp/<versão>`), então vale para as TVs já instaladas, sem mudar o
  app. Contato sem o marcador (TV aberta em navegador) grava versão nula.
- **Desatualizada = versão menor que a da última release**, a mesma que a API
  já lê do `update.json` (`lib/tv-app-release.ts`).
- **Histórico = linha do tempo de quedas**: períodos no ar e fora do ar, com
  hora de queda e de volta, nos últimos 30 dias. Sem percentual: loja que
  desliga a TV à noite aparece fora do ar, e quem olha julga.
- O histórico começa no deploy. Não há dado retroativo.

## Fora do escopo

- Aviso quando uma TV cai (job agendado, e-mail, WhatsApp).
- Percentual de disponibilidade e cadastro de horário de funcionamento.
- Histórico de troca de versão por TV.
- Visão do parque no portal do cliente.

## 1. Dados

Migração `0017` (gerada por `drizzle-kit generate`), só acréscimo:

- `devices.app_version text`, nulo.
- Tabela `device_sessions`:

  | Coluna | Tipo | |
  |---|---|---|
  | `id` | `serial` | PK |
  | `device_id` | `integer` | FK `devices.id`, `ON DELETE CASCADE` |
  | `started_at` | `timestamptz` | primeiro contato do período |
  | `last_seen_at` | `timestamptz` | último contato do período |

  Índice `device_sessions_device_last_seen_idx` em `(device_id, last_seen_at)`.

Uma linha por período contínuo no ar. O buraco entre duas sessões seguidas da
mesma TV é uma queda. Coluna anulável e tabela nova são ignoradas pelo código
que já está no ar.

## 2. Captura (`routes/display.ts`)

`loadForTv` é o ponto único por onde as duas rotas da TV passam
(`/display/:deviceKey/slides` e `/feed`).

- Função pura nova `tvAppVersionFromUserAgent(ua)` em `lib/tv-app-version.ts`:
  devolve o que vem depois de `SignageApp/` (letras, números, `.` e `-`, até 32
  caracteres) ou `null`.
- O `UPDATE` que já grava `last_seen_at` passa a gravar também `app_version`.
- Sessão, em `lib/device-sessions.ts` (`touchDeviceSession(deviceId, now)`):
  1. `UPDATE device_sessions SET last_seen_at = now` na sessão da TV com
     `last_seen_at >= now − 5 min`.
  2. Nenhuma linha alterada → `INSERT` de sessão nova
     (`started_at = last_seen_at = now`) e `DELETE` das sessões dessa TV com
     `last_seen_at` mais velho que 30 dias. A limpeza pega carona na abertura
     de sessão, que é rara; não há job agendado.
- `DEVICE_ONLINE_WINDOW_MINUTES` e `onlineSince` saem de `lib/portal/overview.ts`
  para `lib/device-presence.ts`. Portal, parque e sessão usam a mesma janela.
- Falha ao gravar a sessão é registrada no log e engolida: o feed da TV não
  pode quebrar por causa do histórico.
- `routes/public-vitrine.ts` segue gravando só `last_seen_at`: visita da
  landing não é TV e não abre sessão.

## 3. API (`openapi.yaml` + codegen)

As duas rotas ficam depois de `requireAdmin`.

### `GET /fleet`

```
{
  latestVersion: string | null,
  devices: [
    {
      id, name, clientId, clientName, location,
      showcase: boolean,
      lastSeenAt: string | null,
      isOnline: boolean,
      appVersion: string | null,
      outdated: boolean
    }
  ]
}
```

- `isOnline` e `outdated` são calculados no servidor, com um relógio só.
- `latestVersion` vem de `latestTvAppRelease()`. Se o GitHub não responder,
  vai `null` e nenhuma TV é marcada como desatualizada; a página segue
  funcionando.
- `outdated` compara `X.Y.Z` número a número. Versão nula ou fora do padrão
  (ex.: `1.0.1-rc1`) não é marcada.

### `GET /devices/{id}/sessions`

```
{
  isOnline: boolean,
  sessions: [{ startedAt, lastSeenAt }]
}
```

`sessions` cobre os últimos 30 dias, da mais nova para a mais antiga.
`isOnline` vem do relógio do servidor, como em `/fleet`: é ele que diz se a
sessão mais recente segue em andamento, sem depender do relógio do navegador.
TV inexistente → `404`.

## 4. Tela

### Página `/parque` (`pages/fleet.tsx`)

Item "Parque de TVs" no menu do admin (`components/layout.tsx`).

- Cards: total, online, offline, desatualizadas.
- Bloco "Versões em uso": uma linha por versão com a contagem de TVs
  (`1.9.0 — 12 TVs`), a mais nova primeiro; TVs sem versão entram como
  "navegador".
- Tabela: status, TV, empresa, local, visto por último (tempo relativo),
  versão com selo "desatualizada", link para `/devices/:id`.
- Filtro: todas, online, offline, desatualizadas. Ordem padrão: offline
  primeiro, depois por nome.
- Recarrega a cada 60 s.
- A vitrine da landing aparece na tabela com selo próprio e fica fora dos
  cards e do bloco de versões.

### Detalhe da TV (`pages/device-detail.tsx`)

Seção "Histórico de conexão" num componente novo,
`components/device-connection-history.tsx` (o `device-detail.tsx` já é
grande). Lista alternada dos últimos 30 dias, mais recente primeiro:

```
No ar        hoje 08:02 → agora          (6h14)
Fora do ar   ontem 22:10 → hoje 08:02    (9h52)
No ar        ontem 08:01 → 22:10         (14h09)
```

Os períodos fora do ar são calculados no navegador, a partir dos buracos entre
sessões, por uma função pura (`buildConnectionTimeline`). A sessão mais
recente só vale como "no ar até agora" se a TV estiver online; senão abre um
"fora do ar" de `lastSeenAt` até agora.

## 5. Casos de borda

- TV que nunca conectou: offline, "nunca conectou", histórico vazio.
- Queda menor que 5 minutos não aparece: a sessão só fecha depois da janela.
- TV sem sessão registrada (anterior ao deploy): histórico vazio com o aviso
  de que o registro começou na data do deploy.
- TV apagada: as sessões saem junto (`ON DELETE CASCADE`).

## 6. Testes

**API** (`routes/__tests__`, estilo dos existentes):
- `tvAppVersionFromUserAgent`: com marcador, sem marcador, UA vazio, versão
  `-rc`.
- Feed grava `app_version`; contato sem marcador grava nulo.
- Feed cria sessão; segundo feed dentro de 5 min estica a mesma; feed depois
  de 5 min abre outra.
- Abrir sessão apaga as de mais de 30 dias da mesma TV e não toca nas de
  outra.
- Erro na gravação da sessão não derruba o feed.
- `/fleet`: online/offline pela janela, `outdated`, `latestVersion` nulo com o
  GitHub fora, vitrine marcada.
- `/devices/:id/sessions`: ordem, corte de 30 dias, 404.
- As duas rotas recusam quem não é admin.

**Web** (`pages/__tests__`, `components/__tests__`):
- Parque: contagens dos cards, bloco de versões, filtro, selo de
  desatualizada, vitrine fora das contagens.
- `buildConnectionTimeline`: buracos entre sessões, TV online, TV offline,
  lista vazia.

**Migração**: aplicar no Postgres descartável (Docker).

## Riscos

- **Uma escrita a mais por feed** (a da sessão), a cada 60 s por TV. É um
  `UPDATE` por índice numa tabela pequena.
- **Dois feeds simultâneos da mesma key** (mesma key aberta em duas telas)
  podem abrir duas sessões sobrepostas. A linha do tempo junta sessões que se
  sobrepõem antes de calcular os buracos.

## Versão

PR `feat(portal): parque de TVs com status, versão do app e histórico de conexão`
→ minor.
