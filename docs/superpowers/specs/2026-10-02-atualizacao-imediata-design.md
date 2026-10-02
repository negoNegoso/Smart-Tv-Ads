# Atualização em minutos após a release e gatilho pelo admin — design

Data: 2026-10-02
Branch: `feat/atualizacao-imediata`

## Objetivo

Hoje o app da TV só descobre uma versão nova na checagem que ele mesmo faz:
2 minutos depois de abrir e a cada 6 horas. Uma release leva até 6 horas para
chegar a uma box ligada, e o admin não tem como apressar.

Depois desta mudança:

1. Toda box ligada começa a se atualizar **em até ~2 minutos** depois de a
   release sair.
2. O admin tem um botão para **mandar uma TV (ou todas) checar agora**.

## Regras decididas

- **Na hora, em todas.** Sem janela de madrugada e sem liberação por etapas.
- **O Android continua mandando na instalação.** Android 12+ com a versão
  instalada ≥ 1.15.1 instala sem ninguém tocar. Nas demais, o app baixa e
  mostra o aviso discreto de hoje, e alguém aperta OK no controle. O painel
  nunca é coberto por diálogo aberto sozinho.
- **"Forçar" não pula o OK.** O botão dispara a checagem na hora; em box que
  está esperando o OK, não muda nada.
- **O servidor só avisa; não diz o que instalar.** O app segue lendo o
  `update.json` do GitHub Releases e conferindo o SHA-256 do APK, como hoje.
  Um aviso forjado no feed consegue, no máximo, provocar uma checagem.
- **A checagem de 6 horas continua** como reserva.

## Fora do escopo

- Instalação silenciosa em Android 11 ou menor (Device Owner, reset de
  fábrica).
- Janela de horário, liberação por etapas, fixar uma TV numa versão, voltar
  versão.
- Mostrar no admin que a box está "esperando OK" ou a versão do Android.
- Push (FCM, WebSocket).

## Como funciona

```
release sai ─► API lê update.json (cache de 1 min)
                      │
TV busca o feed (60 s)│  feed.appUpdate = { version, forcedAt }
                      ▼
              tv.html chama window.SignageUpdate.check()
                      ▼
        app roda a checagem de sempre (update.json → APK → instalador)
```

O admin entra no mesmo caminho: o botão grava `update_requested_at` na TV, e o
próximo feed dela leva `appUpdate` com `forcedAt`.

## 1. Dados

Migração `0018` (gerada por `drizzle-kit generate`), só acréscimo:

- `devices.update_requested_at timestamptz`, nulo.

## 2. Sinal no feed (`routes/display.ts`)

`GET /display/:deviceKey/feed` ganha um campo opcional:

```
appUpdate: { version: string | null, forcedAt: string | null } | null
```

Regra, numa função pura `appUpdateSignal` em `lib/tv-app-update.ts`:

| Situação | `appUpdate` |
|---|---|
| TV com app em versão `X.Y.Z` menor que a última release | `{ version: <última>, forcedAt }` |
| Admin pediu atualização há menos de 15 min | `{ version: <última ou null>, forcedAt: <quando> }` |
| As duas | `{ version: <última>, forcedAt: <quando> }` |
| Nenhuma | `null` |

- `forcedAt` só vai preenchido enquanto o pedido tem menos de 15 minutos.
  Pedido antigo não fica cutucando a TV para sempre.
- "Menor que a última release" é o `isOutdatedTvApp` que o parque já usa: TV
  no navegador, versão `-rc` ou GitHub fora não disparam o sinal automático.
- O pedido do admin vale mesmo quando o servidor não consegue comparar
  (GitHub fora, versão fora do padrão): aí `version` vai `null`.
- `/display/:deviceKey/slides` (tv.html antigo) e a vitrine pública não mudam.

### Última release sem atrasar o feed

O feed é a rota mais chamada do sistema e não pode esperar o GitHub.

- O cache de `lib/tv-app-release.ts` cai de 5 minutos para **1 minuto**.
- Função nova `latestTvAppReleaseForFeed()`: devolve o valor em cache se ele
  tem menos de 1 minuto; senão consulta o GitHub com teto de **1,5 s** e, se
  falhar ou estourar, devolve o último valor conhecido (mesmo vencido) ou
  `null`. Nunca lança.
- Sem release conhecida → sem sinal automático neste feed; o próximo tenta de
  novo.
- Chamadas simultâneas do feed compartilham uma consulta só. A página de
  download do APK (`latestTvAppRelease`, teto de 5 s) faz a própria consulta e
  não compartilha nada com o feed: se compartilhasse, um feed poderia ficar
  esperando os 5 s dela.
- Depois de uma tentativa que falhou, o feed só tenta de novo passado 1 minuto;
  até lá responde na hora com o último valor conhecido.

Atraso depois da release: até 1 min do cache + até 60 s do feed.

## 3. `tv.html` (ES5)

Depois de cada feed aplicado:

- Sem `appUpdate`, ou sem `window.SignageUpdate.check`: nada.
- Com os dois: chama `window.SignageUpdate.check()` quando
  - a chave `version + '|' + forcedAt` é diferente da última usada, ou
  - passaram **10 minutos** desde a última chamada (cobre download que falhou).
- Estado só em memória. Recarregar a página provoca uma chamada a mais, que é
  inofensiva.
- Tudo em `try/catch`: erro na ponte não interrompe o rodízio das peças.

Navegador sem o app nunca tem `window.SignageUpdate` e ignora o campo.

## 4. App Android

- Classe nova `AtualizacaoPelaPagina`, registrada na WebView como
  `window.SignageUpdate`, com um método `@JavascriptInterface fun check()`.
  Fica separada da `MusicaDeFundo` (`window.SignageNative`): são assuntos
  diferentes e a ponte da música não muda.
- `check()` é chamado numa thread da WebView; passa o trabalho para a thread
  principal e chama o mesmo caminho da checagem periódica, com a **mesma
  guarda**: não checa se há confirmação pendente
  (`UpdateState.pendingConfirmation`) nem sessão ativa
  (`UpdateState.activeSessionId`). A guarda vira uma função só
  (`UpdateState.canCheck()`), usada pelos dois chamadores.
- `UpdateController.check()` já é "uma por vez" e nunca propaga erro.
- A ponte fica exposta a todo frame da página, inclusive o iframe do YouTube.
  Aceitável: o único efeito possível é uma checagem contra a URL fixa do
  build, com APK conferido por SHA-256.
- **Recuo depois de falha de instalação.** Toda vez que o instalador devolve
  falha (disco cheio, assinatura diferente, pessoa cancelou o diálogo), o app
  passa a ignorar os avisos da página até a próxima checagem periódica, que é
  quem os libera de novo. Sem isso, uma box que não consegue instalar
  refaria a sessão, copiaria o APK e mostraria "Falha ao atualizar" a cada
  10 minutos, para sempre. Falha de download (sem rede, hash errado) não
  entra nessa regra e segue com a repetição de 10 minutos da página.
- A checagem periódica (2 min após abrir, depois a cada 6 h) não muda.

## 5. Admin

### `POST /fleet/update-requests` (depois de `requireAdmin`)

Corpo: `{ deviceIds?: integer[] }`. Sem `deviceIds` = todas as TVs.
Grava `update_requested_at = agora` nas TVs escolhidas.
Resposta: `200 { requested: <quantas> }`. `deviceIds` vazio ou com id que não
é inteiro → `400`.

### `GET /fleet`

Cada TV ganha `updateRequestedAt: string | null`.

### Página `/parque`

- Botão **"Atualizar todas"** no topo, com confirmação ("Mandar todas as TVs
  checarem atualização agora?").
- Botão **"Atualizar agora"** em cada linha de TV que roda o app
  (`appVersion` não nulo). TV no navegador não tem botão.
- Depois do pedido: toast "Pedido enviado. A TV checa no próximo minuto." e a
  linha mostra "atualização pedida há 2 min" enquanto o pedido tem menos de
  15 minutos.
- Texto de ajuda fixo sob o bloco de versões: "As TVs se atualizam sozinhas em
  poucos minutos depois de cada release. Em Android 11 ou anterior, alguém
  precisa apertar OK no controle."

## 6. Limites que o admin precisa conhecer

- **O primeiro salto é lento.** Só reage ao sinal a box que já tem a versão
  com `window.SignageUpdate`. A atualização que traz essa versão ainda chega
  pela checagem de 6 horas (e pelo OK, onde o Android exige).
- **Box que falhou uma instalação fica até 6 horas sem reagir** ao aviso do
  servidor e ao botão "Atualizar agora": ela volta ao ritmo da checagem
  periódica até conseguir instalar.
- **Box desligada** se atualiza ~2 minutos depois de ligar, como hoje.
- **Release com defeito chega a todas em ~2 minutos.** O conserto é uma nova
  release, que chega no mesmo prazo.
- **Instalar reinicia o app**: a tela pisca alguns segundos, a qualquer hora
  do dia.

## 7. Testes

**API**
- `appUpdateSignal`: desatualizada; em dia; navegador; versão `-rc`; sem
  release conhecida; pedido de 1 min; pedido de 16 min; pedido + desatualizada;
  pedido com release desconhecida.
- `latestTvAppReleaseForFeed`: cache fresco não consulta; cache vencido
  consulta; falha devolve o valor vencido; sem nada devolve `null`; estouro do
  teto devolve o valor vencido.
- Feed: leva `appUpdate` conforme a regra; `/slides` não muda; resposta segue
  o contrato do openapi.
- `POST /fleet/update-requests`: uma TV, várias, todas, corpo inválido, sem
  login (401).
- `GET /fleet` devolve `updateRequestedAt`.

**`tv.html`** (`src/__tests__/tv-html.test.ts`)
- chama a ponte quando o sinal aparece;
- não repete no feed seguinte com o mesmo sinal;
- repete depois de 10 minutos;
- chama de novo quando `forcedAt` muda;
- sem ponte, ignora;
- ponte que lança não para o rodízio.

**Android** (testes unitários no padrão dos existentes)
- `UpdateState.canCheck()`: livre, com confirmação pendente, com sessão ativa.
- `AtualizacaoPelaPagina.check()` entrega o pedido ao receptor.
- Teste instrumentado existente da WebView ganha a conferência de que
  `window.SignageUpdate.check` existe.

**Web**
- Botão por linha só em TV com app; pedido de uma TV; "Atualizar todas" com
  confirmação; rótulo "atualização pedida há…"; erro mostra toast.

**Migração**: aplicar no Postgres descartável (Docker).

## Riscos

- **Uma consulta ao GitHub por minuto por instância do servidor.** É o link
  de download da release, sem limite de API; com teto de 1,5 s e nunca
  bloqueando além disso.
- **Feed mais lento uma vez por minuto** (até 1,5 s) na instância que renova o
  cache. A TV tolera: o feed é buscado em segundo plano.
- **`tv.html` em cache antigo** não conhece `appUpdate` e segue na checagem de
  6 horas até a recarga diária.

## Versão

PR `feat(android-tv): atualização em minutos após a release e gatilho pelo admin`
→ minor.
