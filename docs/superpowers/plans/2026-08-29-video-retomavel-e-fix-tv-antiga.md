# Vídeo retomável (capped) + correção de travamento no tv.html — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o modo `capped` retomar vídeos de onde pararam (em vez de reiniciar) e corrigir o travamento de vídeo nas TVs antigas (`tv.html`).

**Architecture:** Toda a mudança é no player (frontend). Um mapa em memória `announcementId+videoId → segundos` guarda a posição de cada vídeo. No corte, salva a posição e cede a tela; ao voltar, faz `seekTo`. O play só é contado quando o vídeo completa (`ENDED`). A correção do `tv.html` arma um timeout na carga da IFrame API para nunca congelar a rotação.

**Tech Stack:** React 18 + TypeScript (Vite) em `artifacts/signage/src`; HTML/JS ES5 em `artifacts/signage/public/tv.html`; YouTube IFrame Player API.

---

## Nota sobre testes

O pacote `@workspace/signage` **não possui framework de testes** (apenas
`@workspace/api-server` tem). A lógica é fortemente acoplada à IFrame API do
YouTube e ao DOM. Seguindo a convenção do repositório (README: validação por
`typecheck` + `build` + verificação manual), **não** adicionamos um framework de
testes novo. Cada tarefa valida por:

- `pnpm --filter @workspace/signage run typecheck` (cobre os arquivos `.tsx`),
- `pnpm --filter @workspace/signage run build` (garante que o bundle compila),
- uma **checklist de verificação manual** descrita na tarefa.

`tv.html` é um arquivo estático em `public/` (o Vite apenas o copia; o build não
faz type-check dele), então sua validação é `build` + verificação manual.

## Estrutura de arquivos

- Modificar: `artifacts/signage/src/components/youtube-slide.tsx` — player React
  de um vídeo. Ganha `initialPosition` (seek ao iniciar), passa a disparar
  `onEnded` também em `capped` e reporta a posição atual periodicamente.
- Modificar: `artifacts/signage/src/pages/display.tsx` — orquestra a rotação.
  Ganha o mapa de posições, a lógica de corte-retoma e a contagem de play por
  completude.
- Modificar: `artifacts/signage/public/tv.html` — player Smart TV. Ganha
  `videoPositions`, corte-retoma, contagem por completude e a correção do
  travamento na carga da API.

---

## Task 1: `youtube-slide.tsx` — posição inicial, `onEnded` em capped e reporte de posição

**Files:**
- Modify: `artifacts/signage/src/components/youtube-slide.tsx`

- [ ] **Step 1: Ampliar a interface de props**

Substitua o bloco `interface YouTubeSlideProps { ... }` por:

```tsx
interface YouTubeSlideProps {
  slideKey: string | number;
  videoId: string;
  audioMode: 'muted' | 'sound';
  playbackMode: 'natural' | 'capped';
  /** Posição (segundos) para retomar o vídeo ao iniciar. 0 = do começo. */
  initialPosition?: number;
  /** Chamado quando o vídeo termina (em qualquer modo) — o pai decide o que fazer. */
  onEnded: () => void;
  /** Reporta a posição atual do vídeo (segundos) periodicamente. */
  onProgress?: (seconds: number) => void;
  /** Chamado se o player não inicializa/erra — o pai mostra o fallback. */
  onUnplayable: () => void;
}
```

- [ ] **Step 2: Ler as novas props e mantê-las em refs**

Na desestruturação de props do componente, adicione `initialPosition`,
`onProgress`. O cabeçalho da função vira:

```tsx
export function YouTubeSlide({
  slideKey,
  videoId,
  audioMode,
  playbackMode,
  initialPosition,
  onEnded,
  onProgress,
  onUnplayable,
}: YouTubeSlideProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(onEnded);
  const unplayableRef = useRef(onUnplayable);
  const progressRef = useRef(onProgress);
  const initialPositionRef = useRef(initialPosition);
  endedRef.current = onEnded;
  unplayableRef.current = onUnplayable;
  progressRef.current = onProgress;
  initialPositionRef.current = initialPosition;
```

- [ ] **Step 3: Declarar o timer de poll dentro do efeito**

No início do corpo do `useEffect`, junto das outras variáveis locais, adicione
`pollTimer`:

```tsx
  useEffect(() => {
    let player: any = null;
    let cancelled = false;
    let started = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const timeout = setTimeout(() => {
      if (!started) unplayableRef.current();
    }, INIT_TIMEOUT_MS);
```

- [ ] **Step 4: Fazer seek inicial e iniciar o poll no `onReady`**

Substitua o handler `onReady` por (adiciona o `seekTo` e o `setInterval` de
reporte de posição):

```tsx
          onReady: (e: any) => {
            started = true;
            clearTimeout(timeout);
            if (audioMode === 'sound') {
              e.target.unMute();
              e.target.setVolume(100);
            }
            const startAt = initialPositionRef.current;
            if (startAt && startAt > 0) {
              try {
                e.target.seekTo(startAt, true);
              } catch {
                /* noop */
              }
            }
            e.target.playVideo();
            pollTimer = setInterval(() => {
              try {
                const t = e.target.getCurrentTime?.();
                if (typeof t === 'number') progressRef.current?.(t);
              } catch {
                /* noop */
              }
            }, 250);
          },
```

- [ ] **Step 5: Disparar `onEnded` em qualquer modo**

Substitua o handler `onStateChange` por (remove a restrição `=== 'natural'`):

```tsx
          onStateChange: (e: any) => {
            if (e.data === YT.PlayerState.ENDED) {
              endedRef.current();
            }
          },
```

- [ ] **Step 6: Limpar o poll na desmontagem**

Substitua o `return` de cleanup do efeito por (limpa também `pollTimer`):

```tsx
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (pollTimer) clearInterval(pollTimer);
      try {
        player?.destroy();
      } catch {
        /* noop */
      }
    };
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: PASS (sem erros). `initialPosition`/`onProgress` são opcionais, então
`display.tsx` ainda compila mesmo antes da Task 2.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/components/youtube-slide.tsx
git commit -m "feat(signage): YouTubeSlide com seek inicial, onEnded em capped e reporte de posição

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: `display.tsx` — mapa de posições, corte-retoma e contagem por completude

**Files:**
- Modify: `artifacts/signage/src/pages/display.tsx`

- [ ] **Step 1: Adicionar o mapa de posições**

Logo após a linha `const playlistCursor = useRef<Record<number, number>>({});`,
adicione:

```tsx
  const videoPositions = useRef<Record<string, number>>({});
```

- [ ] **Step 2: Ramificar o corte do cronômetro para vídeo capped**

No efeito de auto-advance, dentro do `setInterval`, substitua todo o bloco
`if (elapsed >= durationMs) { ... }` por:

```tsx
      if (elapsed >= durationMs) {
        const isCappedVideo = isYouTube && slide.playbackMode !== 'natural';
        if (isCappedVideo) {
          // Corte: a posição já foi salva via onProgress. Cede a tela sem
          // contar play nem avançar o cursor da playlist (retoma depois).
          setCurrentIndex((prev) => (prev + 1) % slides.length);
          setProgress(0);
        } else {
          // Imagem ou fallback: comportamento atual (1 play por exibição).
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
          if (
            slide.mediaKind === 'youtube_playlist' &&
            slide.videoIds &&
            slide.videoIds.length > 0
          ) {
            const cur = playlistCursor.current[slide.announcementId] ?? 0;
            playlistCursor.current[slide.announcementId] =
              (cur + 1) % slide.videoIds.length;
          }
          setCurrentIndex((prev) => (prev + 1) % slides.length);
          setProgress(0);
        }
      }
```

- [ ] **Step 3: Zerar a posição salva ao completar (na função `advance`)**

Na função `advance` (usada como `onEnded` do `YouTubeSlide`), adicione a
remoção da posição logo no início, antes do avanço do cursor:

```tsx
  const advance = () => {
    delete videoPositions.current[`${slide.announcementId}-${videoId}`];
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
```

- [ ] **Step 4: Passar `initialPosition` e `onProgress` ao `YouTubeSlide`**

Substitua o JSX `<YouTubeSlide ... />` por (adiciona as duas props novas):

```tsx
        <YouTubeSlide
          slideKey={`${slide.announcementId}-${videoId}`}
          videoId={videoId}
          audioMode={slide.audioMode === 'sound' ? 'sound' : 'muted'}
          playbackMode={slide.playbackMode === 'natural' ? 'natural' : 'capped'}
          initialPosition={videoPositions.current[`${slide.announcementId}-${videoId}`] ?? 0}
          onProgress={(sec) => {
            videoPositions.current[`${slide.announcementId}-${videoId}`] = sec;
          }}
          onEnded={advance}
          onUnplayable={() =>
            setFallbackIds((prev) => new Set(prev).add(fbKey))
          }
        />
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: PASS (sem erros).

- [ ] **Step 6: Build**

Run: `pnpm --filter @workspace/signage run build`
Expected: build conclui sem erros.

- [ ] **Step 7: Verificação manual (checklist)**

Suba o ambiente (`./dev.sh`) e abra `http://localhost:21153/display/DEVICE_KEY`
com um dispositivo que tenha uma peça de vídeo YouTube longa em modo `capped`
(`duration` menor que o vídeo) e ao menos mais uma peça na fila. Confirme:

- [ ] No corte (`duration` segundos), a tela passa para o próximo anúncio.
- [ ] Ao voltar ao vídeo, ele **retoma de onde parou** (não reinicia).
- [ ] Só é registrado **1 play** para o vídeo quando ele termina por completo
      (verifique em `/analytics` ou nos logs do endpoint `/api/telemetry/play`).
- [ ] Peça de imagem em `capped` continua registrando 1 play a cada exibição.
- [ ] Peça em modo `natural` continua tocando até o fim, com 1 play no fim.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/pages/display.tsx
git commit -m "feat(signage): modo capped retoma vídeo de onde parou (player React)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: `tv.html` — corrigir o travamento de vídeo nas TVs antigas

**Files:**
- Modify: `artifacts/signage/public/tv.html`

- [ ] **Step 1: Adicionar estado da API e o limite de tempo**

No bloco `// ─── State ───`, logo após a linha
`var ytApiLoading  = false;`, adicione:

```html
      var ytApiUnavailable = false;   // API do YouTube desistiu de carregar
      var YT_API_TIMEOUT_MS = 6000;   // limite p/ a IFrame API ficar pronta
```

- [ ] **Step 2: Reescrever `loadYtApi` para armar timeout próprio**

Substitua toda a função `function loadYtApi(cb) { ... }` por (agora aceita
`onFail`, arma um timeout independente e trata erro de carga do script):

```html
      function loadYtApi(cb, onFail) {
        if (window.YT && window.YT.Player) { cb(); return; }
        if (ytApiUnavailable) { if (onFail) onFail(); return; }

        var failed = false;
        var giveUp = setTimeout(function () {
          failed = true;
          ytApiUnavailable = true;
          if (onFail) onFail();
        }, YT_API_TIMEOUT_MS);

        if (ytApiLoading) {
          var t = setInterval(function () {
            if (failed) { clearInterval(t); return; }
            if (window.YT && window.YT.Player) {
              clearInterval(t); clearTimeout(giveUp); cb();
            }
          }, 100);
          return;
        }

        ytApiLoading = true;
        var prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function () {
          if (prev) { try { prev(); } catch (e) {} }
          ytApiReady = true;
          if (failed) { return; }
          clearTimeout(giveUp);
          cb();
        };
        var tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.onerror = function () {
          if (failed) { return; }
          failed = true;
          ytApiUnavailable = true;
          clearTimeout(giveUp);
          if (onFail) onFail();
        };
        document.head.appendChild(tag);
      }
```

- [ ] **Step 3: Passar `onFail` de `playYouTube` para `loadYtApi`**

Em `function playYouTube(slide, videoId, onEnded, onFail)`, a primeira linha do
corpo é `loadYtApi(function () {`. Substitua **apenas o fechamento** dessa
chamada para encaminhar `onFail`. O final da função (o `});` que fecha o
`loadYtApi(function () { ... })`) vira:

```html
        }, onFail);
      }
```

Ou seja: a linha que hoje é `        });` imediatamente antes do `      }` que
fecha `playYouTube` passa a ser `        }, onFail);`.

- [ ] **Step 4: Build**

Run: `pnpm --filter @workspace/signage run build`
Expected: build conclui sem erros (o Vite copia `public/tv.html` para `dist`).

- [ ] **Step 5: Verificação manual (checklist)**

Abra `http://localhost:21153/tv.html?key=DEVICE_KEY` com uma peça de vídeo na
fila. Para simular uma TV que não carrega a API do YouTube, bloqueie o domínio
`www.youtube.com` (DevTools → Network → Block request domain) e recarregue.
Confirme:

- [ ] Após ~6s, a peça de vídeo cai no **fallback de thumbnail** em vez de
      congelar.
- [ ] A rotação **continua girando** para os próximos anúncios.
- [ ] As peças de vídeo seguintes vão direto ao fallback (sem esperar 6s de
      novo), pois `ytApiUnavailable` já está marcado.
- [ ] Sem o bloqueio, o vídeo toca normalmente (nada regrediu).

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/public/tv.html
git commit -m "fix(signage): tv.html não congela quando a IFrame API do YouTube não carrega

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: `tv.html` — modo capped retoma vídeo de onde parou

**Files:**
- Modify: `artifacts/signage/public/tv.html`

- [ ] **Step 1: Adicionar o mapa de posições**

No bloco `// ─── State ───`, logo após
`var playlistCursor = {};   // announcementId -> índice atual`, adicione:

```html
      var videoPositions = {};   // (announcementId + '-' + videoId) -> segundos
```

- [ ] **Step 2: Fazer seek inicial no `onReady`**

Dentro de `playYouTube`, no handler `onReady: function (e) { ... }`, logo após
o bloco que trata o áudio e **antes** de `e.target.playVideo();`, adicione o
`seekTo` da posição salva:

```html
                var posKey = slide.announcementId + '-' + videoId;
                var saved = videoPositions[posKey];
                if (saved && saved > 0) {
                  try { e.target.seekTo(saved, true); } catch (err) {}
                }
                e.target.playVideo();
```

- [ ] **Step 3: Disparar `onEnded` em qualquer modo**

No mesmo `playYouTube`, substitua o handler `onStateChange` por (remove a
restrição `=== 'natural'`):

```html
              onStateChange: function (e) {
                if (e.data === window.YT.PlayerState.ENDED) {
                  onEnded();
                }
              },
```

- [ ] **Step 4: Zerar a posição ao completar (na função `goNext`)**

`goNext` é chamada quando o vídeo completa (via `onEnded`) e para imagens. No
início da função, antes de `recordImpression(...)`, apague a posição do vídeo
que está saindo:

```html
      function goNext() {
        if (timer) { clearInterval(timer); timer = null; }
        var leaving = slides[currentIndex];
        if (leaving) {
          var leavingVid = videoIdForSlide(leaving);
          if (leavingVid) { delete videoPositions[leaving.announcementId + '-' + leavingVid]; }
        }
        recordImpression(slides[currentIndex]);
        advancePlaylistCursor(slides[currentIndex]);
        currentIndex = (currentIndex + 1) % slides.length;
        showSlide(slides[currentIndex]);
        startTimer();
      }
```

- [ ] **Step 5: Adicionar `goNextNoCount` (corte que cede a tela sem contar)**

Logo **depois** da função `goNext`, adicione uma nova função que avança sem
registrar play e sem avançar o cursor da playlist:

```html
      // Corte de vídeo capped: cede a tela sem contar play nem avançar cursor.
      function goNextNoCount() {
        if (timer) { clearInterval(timer); timer = null; }
        currentIndex = (currentIndex + 1) % slides.length;
        showSlide(slides[currentIndex]);
        startTimer();
      }
```

- [ ] **Step 6: No corte, salvar posição e usar `goNextNoCount` para vídeo capped**

Em `function runTimer(slide) { ... }`, substitua o bloco
`if (elapsed >= durationMs) { goNext(); }` por:

```html
          if (elapsed >= durationMs) {
            var s = slides[currentIndex];
            var isCappedVideo = ytActive && ytPlayer && s && s.playbackMode !== 'natural';
            if (isCappedVideo) {
              var vid = videoIdForSlide(s);
              if (vid) {
                try { videoPositions[s.announcementId + '-' + vid] = ytPlayer.getCurrentTime(); } catch (e) {}
              }
              goNextNoCount();
            } else {
              goNext();
            }
          }
```

- [ ] **Step 7: Build**

Run: `pnpm --filter @workspace/signage run build`
Expected: build conclui sem erros.

- [ ] **Step 8: Verificação manual (checklist)**

Abra `http://localhost:21153/tv.html?key=DEVICE_KEY` com uma peça de vídeo
YouTube longa em modo `capped` (`duration` menor que o vídeo) e ao menos mais
uma peça na fila. Confirme:

- [ ] No corte (`duration` segundos), a tela passa para o próximo anúncio.
- [ ] Ao voltar ao vídeo, ele **retoma de onde parou** (não reinicia).
- [ ] Só é registrado **1 play** para o vídeo quando ele termina por completo.
- [ ] Peça de imagem em `capped` continua registrando 1 play a cada exibição.
- [ ] Peça em modo `natural` continua tocando até o fim.
- [ ] Em playlist: o vídeo atual é retomado a cada volta; o cursor só avança
      para o próximo vídeo quando o atual completa.

- [ ] **Step 9: Commit**

```bash
git add artifacts/signage/public/tv.html
git commit -m "feat(signage): tv.html modo capped retoma vídeo de onde parou

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Validação final

- [ ] `pnpm --filter @workspace/signage run typecheck` — PASS
- [ ] `pnpm --filter @workspace/signage run build` — PASS
- [ ] Todas as checklists manuais das Tasks 2, 3 e 4 confirmadas.
