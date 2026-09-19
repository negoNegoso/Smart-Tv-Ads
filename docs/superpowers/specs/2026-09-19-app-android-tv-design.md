# App Android para TV e TV box — design

Data: 2026-09-19
Branch: `feat/app-android-tv`

## Objetivo

Um APK que, instalado numa TV ou TV box Android, abre sozinho ao ligar e:

- TV ainda não vinculada → mostra a tela de vínculo (QR code);
- TV já vinculada → mostra o painel em tela cheia.

As duas telas já existem em `artifacts/signage/public/tv.html` (pareamento por
QR — spec `2026-09-18-pareamento-tv-qrcode-design.md` — e gatilho de tela
cheia). O app as reproduz no Android sem reimplementá-las.

## Decisão central: casca WebView sobre `/tv`

O app é uma Activity em tela cheia nativa com uma WebView apontando para
`https://smart-tv-ads.vercel.app/tv`. Pareamento, QR, polling, exibição,
YouTube e telemetria continuam sendo o `tv.html`. A key da TV fica no
`localStorage` da WebView, que persiste entre reinícios do app e do aparelho.

Motivos:

- **Escala.** O APK é instalado à mão (sem Play Store). Toda mudança de
  exibição chega à frota inteira pelo deploy web; o APK quase nunca muda.
- **Compatibilidade.** A API nativa de player do YouTube para Android foi
  descontinuada: qualquer app que toque YouTube depende de WebView de qualquer
  jeito. O `tv.html` já é ES5 para rodar em navegador antigo, e a WebView de
  fábrica do Android 10 (Chromium 74+) o executa.

Alternativas descartadas: app nativo completo (Kotlin + Compose for TV +
ExoPlayer) — duas implementações a manter e cada ajuste exige APK novo em cada
box; híbrido com pareamento nativo e exibição em WebView — duplica a lógica de
pareamento e do 404 → QR sem ganho real.

## Distribuição e início automático

- Instalação manual do APK (pendrive ou download), "fontes desconhecidas".
- **Início no boot.** A partir do Android 10 o sistema bloqueia abrir Activity
  a partir do evento de boot. Por isso o app se registra também como **tela
  inicial** (`HOME`); na instalação o técnico escolhe o app como tela inicial
  padrão ("Sempre"). Assim ele abre no boot e volta quando alguém aperta Home.
  Um `BootReceiver` para `BOOT_COMPLETED` abre a Activity em Android ≤ 9 como
  reforço.
- Aparece nos dois launchers: `LEANBACK_LAUNCHER` (Android TV) e `LAUNCHER`
  (TV box com Android comum), com banner 320×180 para o leanback.

## Módulo `artifacts/android-tv/`

Projeto Gradle independente em Kotlin, fora do workspace pnpm e do build da
Vercel. Gradle wrapper commitado.

- `applicationId` `com.smarttvads.signage`, `minSdk 21`, `targetSdk 34`.
- Somente paisagem. Declara `android.software.leanback` e
  `android.hardware.touchscreen` como `required="false"`.
- Permissões: `INTERNET`, `ACCESS_NETWORK_STATE`, `RECEIVE_BOOT_COMPLETED`,
  `WAKE_LOCK`.
- Sem R8/minify.

### Componentes

| Unidade | Função |
|---|---|
| `MainActivity` | Tela cheia imersiva (barras ocultas, reaplicada ao recuperar foco), `FLAG_KEEP_SCREEN_ON`, hospeda a WebView. Intent filters `MAIN` + `LAUNCHER` + `LEANBACK_LAUNCHER` e `MAIN` + `HOME` + `DEFAULT`. `launchMode="singleTask"`. |
| `TvWebViewConfig` | Aplica a configuração: JavaScript e DOM storage ligados, `mediaPlaybackRequiresUserGesture = false`, mixed content bloqueado, user agent padrão acrescido de ` SignageApp/<versionName>`. Foco inicial na WebView para o controle remoto funcionar. |
| `ConnectivityGuard` | Decide e agenda novas tentativas quando a carga da página principal falha. Backoff 5 s → 10 s → 20 s → 40 s → 60 s (teto), resetado após carga bem-sucedida. Lógica pura, testável sem Android. |
| `OfflineOverlay` | View nativa sobre a WebView: "Sem conexão. Tentando novamente…". Aparece só em falha da carga do frame principal. |
| `WatchdogReload` | `onRenderProcessGone` → destrói e recria a WebView e recarrega a URL, sem derrubar o app. Reload preventivo diário às 04:00 (horário local) contra vazamento de memória. |
| `BootReceiver` | `BOOT_COMPLETED` → inicia `MainActivity` com `FLAG_ACTIVITY_NEW_TASK`. Ignora outras actions. |
| `BuildConfig.TV_URL` | `https://smart-tv-ads.vercel.app/tv` em debug e release. Sobrescrevível pela propriedade Gradle `-PtvUrl=` (ex.: `http://10.0.2.2:21153/tv` para o Vite local visto pelo emulador; `usesCleartextTraffic` só no debug). |

### Fluxo ao abrir

1. `MainActivity` sobe em tela cheia e carrega `TV_URL`.
2. O `tv.html` resolve a key (`localStorage` ou gera nova) e decide sozinho:
   404 → tela de vínculo com QR; 200 → painel.
3. O app não conhece key, device nem pareamento.

### Teclas

- **Voltar**: consumida pelo app (não sai do painel, não navega o histórico da
  WebView).
- **Home**: cai no próprio app, que é a tela inicial.
- Demais teclas vão para a WebView.
- Para sair do app, o técnico usa as Configurações do sistema (trocar a tela
  inicial padrão).

## Mudança no `tv.html`

Dentro do app a tela já é cheia; o aviso "Pressione OK para tela cheia" e o
gatilho por tecla/clique não fazem sentido. Se `navigator.userAgent` contém
`SignageApp`, o `tv.html` não registra os listeners de tela cheia nem mostra o
aviso. Fora do app, comportamento inalterado. O componente
`fullscreen-hint.tsx` (rota `/display/:deviceKey`) não muda: o app não usa essa
rota.

## Tratamento de erros

- **Sem rede no boot** (box liga antes do Wi-Fi): `OfflineOverlay` + retry com
  backoff; nunca mostra a página de erro do Chromium.
- **Rede cai com o painel no ar**: nada nativo. O `tv.html` já segura a lista
  atual e continua consultando.
- **HTTP ≥ 400 na carga do frame principal** (`/tv` fora do ar ou quebrado):
  mesmo tratamento de sem conexão. Não confundir com o 404 de
  `/api/display/<key>/slides`, que é requisição da página e vira tela de QR.
- **Falha em sub-recurso** (imagem, iframe do YouTube, API): ignorada pelo app;
  é assunto do `tv.html`.
- **WebView ausente ou quebrada** (exceção ao instanciar): tela nativa
  "Atualize o Android System WebView nas configurações do aparelho", sem crash.
- **Processo de renderização morto**: `WatchdogReload` recria a WebView.
- **Device apagado no painel**: o `tv.html` volta ao QR com a mesma key.
- **Dados do app limpos**: key nova, QR novo — mesmo comportamento aceito na
  spec de pareamento.

## Build e assinatura

- `./gradlew assembleDebug` / `./gradlew assembleRelease`; saída renomeada para
  `signage-tv-<versionName>.apk`.
- Keystore de release **fora do git**, lida das variáveis de ambiente
  `SIGNAGE_KEYSTORE`, `SIGNAGE_KEYSTORE_PASS`, `SIGNAGE_KEY_ALIAS`,
  `SIGNAGE_KEY_PASS`. Sem elas, `assembleRelease` falha com mensagem clara.
- Perder o keystore impede atualizar o APK por cima nas TVs instaladas: o
  README do módulo manda guardar backup.
- `.gitignore` do módulo ignora `build/`, `.gradle/`, `local.properties`,
  `*.jks`, `*.keystore`.

## README do módulo (`artifacts/android-tv/README.md`)

- Como gerar o keystore e buildar o APK.
- Passo a passo do técnico: copiar APK, permitir fontes desconhecidas,
  instalar, abrir, apertar Home e escolher o app como tela inicial "Sempre",
  ler o QR com o celular do admin.
- Atualizar o app: instalar o APK novo por cima (dados e key preservados).
- Checklist de teste manual (abaixo).

## Testes

**Unitários (JVM: JUnit + Robolectric):**

- `ConnectivityGuard`: sequência 5/10/20/40/60/60 s; reset após sucesso.
- Decisão de erro: falha do frame principal → overlay; falha de sub-recurso →
  nada; HTTP ≥ 400 no frame principal → overlay.
- `TvWebViewConfig`: user agent termina com `SignageApp/<versão>`, DOM storage
  ligado, autoplay sem gesto.
- `BootReceiver`: `BOOT_COMPLETED` dispara intent para `MainActivity`; outra
  action não dispara.
- `MainActivity`: tecla Voltar consumida; `onRenderProcessGone` recria a
  WebView sem crash.
- `TV_URL` do variant debug aponta para produção.

**Instrumentado (emulador Android TV API 29, Espresso-Web)**, contra o servidor
local do `dev.sh`:

- Sem device → elemento do QR (`#pair-qr`) visível.
- Device criado pela API com a key lida da página → painel aparece em até 10 s.
- Activity recriada → painel direto (key persistida).

**`tv.html` (vitest, `src/__tests__/tv-html.test.ts`):**

- UA com `SignageApp` → aviso de tela cheia ausente e tecla não chama
  `requestFullscreen`.
- UA normal → testes de tela cheia existentes continuam passando.

**Manual:**

- Emulador Android TV API 29 e, se disponível, uma TV box real.
- Pareamento ponta a ponta pelo celular.
- Reiniciar o aparelho → abre sozinho e exibe.
- Sem rede no boot → overlay → volta sozinho ao reconectar.
- YouTube toca com som sem clique.
- Apagar o device no painel → volta ao QR.

## Fora do escopo

- Publicação na Play Store.
- Atualização automática do APK (OTA própria).
- Modo kiosk via Device Owner / lock task.
- Tela oculta para trocar o servidor.
- Qualquer lógica de pareamento ou exibição nativa.
