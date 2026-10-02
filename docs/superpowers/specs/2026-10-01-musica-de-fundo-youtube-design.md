# Música de fundo por YouTube na TV — design

Data: 2026-10-01
Branch: `feat/musica-de-fundo-youtube`

## Objetivo

Dar música ambiente à loja pela própria TV do painel: o admin cola um link do
YouTube na TV, e o áudio desse vídeo toca em fundo enquanto as peças passam.
Quando entra uma peça de vídeo com som, a música pausa; quando a peça sai, a
música volta de onde parou.

Hoje a única música de fundo possível é o Spotify rodando por fora na box
(PR #45, `MusicaDeFundo.kt`), que depende de conta, de alguém abrir o app e de
a box devolver o áudio. Esta feature é uma fonte de música dentro do painel.

Sucesso = TV com link configurado toca a música sem ninguém mexer na box;
peça com som é ouvida sozinha e a música retoma depois; nenhuma exibição,
relatório ou número muda por causa da música.

## Decisões

| Tema | Decisão |
|---|---|
| Onde configura | Por TV, na página do device do admin (`/devices/:id`). Lojista não vê nem edita |
| Fonte | Link de vídeo ou de playlist do YouTube. Live entra como vídeo |
| Repetição | Vídeo único em laço; playlist em sequência e recomeça |
| Quando pausa | Só em peça de YouTube com `audioMode === 'sound'`. Vídeo mudo e imagem não mexem na música |
| Retomada | De onde parou, quando a peça com som sai da tela (fim, corte ou falha) |
| Métrica | Nenhuma. A música fica fora de `slides`, não gera play nem scan |
| Volume | Fixo em 100. Quem regula é o volume da TV |
| TV sem peças | A música toca mesmo com a lista de slides vazia |
| Prévia e landing | Sem música: só o `tv.html` toca |

Abordagem escolhida: segundo player do YouTube, fora da tela, dentro do
`tv.html`. Descartadas: tocar o áudio pelo app Android (exige extrair o stream
do YouTube, que quebra e viola os termos, além de APK novo) e reusar o player
das peças (ele é destruído a cada troca de slide e a peça de vídeo precisa
dele).

## 1. Dados

**Migration `0016`:** `devices.music_url text` (nulo = sem música).

Guarda o link como o admin colou. Tipo e ID saem de `parseYouTubeUrl`
(`@workspace/db/youtube`) na hora de montar o feed. Uma coluna só: o campo do
admin mostra de volta exatamente o que foi digitado e não há par tipo/ID para
ficar fora de sincronia.

`parseYouTubeUrl` já dá prioridade à playlist: `watch?v=…&list=…` vira
playlist. Dois ajustes para o que o admin de fato cola:

- O parser passa a aceitar `music.youtube.com` e `youtube.com/live/<id>`
  (vale também para as peças).
- Listas que só existem para quem está logado não carregam no player
  embutido: mix automático (`list=RD…`, o link que o YouTube dá ao clicar numa
  música; `RDCLAK…` é playlist pública e fica de fora), curtidos (`LL`, `LM`) e
  assistir mais tarde (`WL`). Para a música, vale o vídeo `v` do link, em
  laço; sem `v`, o link é recusado. Regra em `musicRefFromUrl`, só da música.

## 2. API

**`PATCH /devices/:id`** (já atrás de `requireAdmin`): `UpdateDeviceBody` ganha
`musicUrl: string | null`.

- String vazia ou só espaços é gravada como `null`.
- Link que `parseYouTubeUrl` não reconhece responde
  `400 { error: "Link do YouTube inválido" }` e não grava nada.
- Link válido é gravado sem os espaços das pontas.

**`Device`** (respostas de `GET /devices`, `GET /devices/:id`, `PATCH`): ganha
`musicUrl: string | null`. `getDeviceWithClient` passa a selecionar a coluna.

**`GET /display/:deviceKey/feed`:** ganha `music`, ao lado de `screen` e
`slides`:

```json
{
  "screen": { "orientation": "landscape" },
  "music": { "kind": "youtube_playlist", "youtubeId": "PL..." },
  "slides": []
}
```

`music` é `null` quando a TV não tem link (ou quando o link gravado deixou de
ser reconhecido). A playlist **não** é resolvida no servidor: o player do
YouTube carrega a playlist pelo ID, então a música funciona sem a
`YOUTUBE_API_KEY` e sem gastar cota.

`GET /display/:deviceKey/slides` (TVs com `tv.html` antigo em cache) e a rota
pública da vitrine não mudam.

Contrato em `lib/api-spec/openapi.yaml`; `api-zod` e `api-client-react` são
regenerados pelo orval.

## 3. Admin

Página do device (`/devices/:id`), logo abaixo de "Vitrine da landing":

- Rótulo "Música de fundo (YouTube)", campo de texto com o link e botão
  "Salvar". Com link gravado, botão "Remover".
- Texto de apoio: toca só o áudio, em laço, e pausa nas peças com som.
- Erro 400 da API aparece em toast com a mensagem do servidor; o campo mantém
  o que foi digitado.
- Sucesso: toast "Música de fundo salva." / "Música de fundo removida.".

A TV pega a mudança no próximo refresh do feed, sem recarregar.

## 4. Player (`tv.html`)

ES5, como o resto do arquivo.

**Onde fica.** `<div id="musica-slot">` fora do palco (não gira com a TV),
200×200 px, posicionado fora da área visível. Tamanho real em vez de
`display: none`: player escondido por `display` pode não iniciar.

**Estado.**

- `musicaRef`: `kind + ':' + youtubeId` do que está carregado, ou `null`.
- `musicaPlayer`: o `YT.Player` do fundo.
- `musicaPausada`: há peça com som no ar.
- `musicaRetomada`: timer da retomada agendada.
- `musicaVigia`: intervalo da vigia.

**`aplicarMusica(music)`**, chamada em `fetchAndStart` a cada feed lido com
sucesso (antes do teste de lista vazia, para a música valer também sem peças):

- Mesma referência que `musicaRef`: não faz nada.
- Referência nova: destrói o player atual e cria outro.
- `null`: destrói o player e zera o estado.

Feed que falhou (rede, erro) não chama `aplicarMusica`: a música segue como
está, igual à lista de slides. `showPairing` (device desconhecido ou apagado)
desliga a música.

**Criação.** Usa o `loadYtApi` que já existe. Se a API do YouTube não
carregar, a TV fica sem música e as peças seguem no fallback de sempre. A
música pede a API de novo depois de 5 minutos (as peças não: seguem indo
direto para a miniatura, e aproveitam a API se ela voltar).

- Vídeo: `videoId` + `playerVars { autoplay: 1, loop: 1, playlist: <id>, controls: 0, disablekb: 1, fs: 0, playsinline: 1 }`
  (o `loop` de vídeo único exige o próprio ID em `playlist`).
- Playlist: `playerVars { listType: 'playlist', list: <id>, autoplay: 1, loop: 1, … }`.
- `onReady`: `unMute()`, `setVolume(100)` e, se `musicaPausada` for falso,
  `playVideo()`.
- `onError`: em playlist, `nextVideo()`; em vídeo único, nada (a vigia tenta
  de novo). No máximo 5 erros seguidos por rodada da vigia, para playlist em
  que nada toca não ficar pulando sem parar; e nunca com peça com som no ar,
  porque `nextVideo()` dá play.

**Pausa e retomada.** Nos mesmos dois pontos que hoje ligam e desligam
`somNoAr`:

- `playYouTube` com `slide.audioMode === 'sound'` → `pausarMusica()`:
  cancela a retomada agendada, marca `musicaPausada` e chama `pauseVideo()`.
- `teardownYt` com `somNoAr` verdadeiro → `retomarMusica()`: agenda
  `playVideo()` para 500 ms depois e desmarca `musicaPausada` quando dispara.

O atraso existe porque `showSlide` chama `teardownYt` e logo em seguida
`playYouTube`: duas peças com som seguidas dariam um estalo de música entre
elas. Com o atraso, a segunda peça cancela a retomada antes de ela acontecer.

`teardownYt` cobre todas as saídas da peça: fim natural, corte do modo
`capped`, erro do player, timeout de 5 s e tela vazia.

**Vigia.** A cada 30 s, com música configurada e `musicaPausada` falso: se o
estado do player não for `PLAYING` nem `BUFFERING`, chama `playVideo()`. Cobre
vídeo que parou sozinho, erro passageiro e autoplay negado. Nunca põe a música
no mudo: música muda não serve para nada.

**Isolamento.** Tudo que toca no player da música fica em `try/catch`. Erro na
música nunca para o rodízio das peças.

**Ponte com o app Android.** Com música do painel configurada
(`musicaRef` não nulo), o `tv.html` **não** chama
`SignageNative.somIniciou/somTerminou`. Sem isso o app veria a nossa música
como "havia música antes" e, no fim da peça, mandaria play ao Spotify por cima
dela. Sem música do painel, a ponte segue como hoje. Não muda nada no APK.

## 5. Fora do escopo

- Música na prévia do admin, na landing e na `/apresentacao` (player React).
- Controle de volume, agenda de horário, mais de uma música por TV.
- Música configurada pelo lojista no portal.
- Avisar o admin de que o vídeo não aceita embed (ver riscos).

## 6. Testes

**API** (`routes/__tests__`):

- `PATCH` com link de vídeo e com link de playlist grava e devolve `musicUrl`.
- `PATCH` com link inválido responde 400 e mantém o valor antigo.
- `PATCH` com `null` e com string vazia limpa a música.
- Feed de TV com música traz `music` com tipo e ID; sem música, `music: null`.
- Feed com música não acrescenta item em `slides`.

**`tv-html.test.ts`** (player do YouTube falso, como os testes atuais):

- Feed com música cria um player de fundo, com som e em laço; vídeo e playlist
  usam os `playerVars` certos.
- Peça com som pausa a música; quando sai, a música volta depois do atraso.
- Peça de vídeo muda e peça de imagem não pausam a música.
- Duas peças com som seguidas: a música não toca entre elas.
- Peça com som que cai no fallback de imagem devolve a música.
- Refresh com outro link recria o player; refresh sem música destrói.
- Feed que falha mantém a música.
- Lista de slides vazia mantém a música.
- Com música configurada, `SignageNative.somIniciou/somTerminou` não são
  chamados; sem música, continuam sendo.
- A música não gera POST de telemetria.
- Vigia: player parado sem peça com som recebe `playVideo()`; com peça com som
  no ar, não.
- Player da música que lança exceção não interrompe as peças.

**Portal** (`device-detail.test.tsx`): campo mostra o link gravado; salvar e
remover chamam o `PATCH` certo; erro do servidor aparece.

## 7. Riscos conhecidos

- **Termos do YouTube.** A política da API pede player visível (mínimo
  200×200) e proíbe separar o áudio do vídeo. O player fora da tela funciona,
  mas está fora da regra: o YouTube pode restringir o embed.
- **Anúncios do YouTube** podem tocar no meio da música.
- **Vídeo com embed bloqueado** (comum em música de gravadora) não toca e a
  loja fica em silêncio, sem aviso. Lives e mixes de canais independentes
  costumam funcionar.
- **Fora do app Android**, o navegador nega autoplay com som até haver um
  gesto: a música fica parada. No app, funciona sem gesto.
- **Box fraca** com dois players do YouTube ao mesmo tempo (música + peça de
  vídeo muda) pode engasgar. Só o teste na box real confirma.
- **Spotify e música do painel juntos** na mesma TV disputam o áudio. É um ou
  outro; a ponte do PR #45 fica desligada quando há música do painel.
- **Direitos de execução pública** da música na loja são de quem configura.
