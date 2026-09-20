# Atualização automática do app Android — design

Data: 2026-09-19
Branch: `feat/auto-update-android`

## Objetivo

O app da TV (`artifacts/android-tv`) descobre sozinho que existe versão nova
no GitHub Releases, baixa e prepara a instalação. Alguém da loja aperta **OK**
no controle uma vez e o Android instala. Sem pendrive, sem técnico.

## Limite do Android

App instalado por APK não se atualiza em silêncio no Android 10/11: o sistema
sempre mostra "Deseja instalar esta atualização?". No Android 12+ passa a ser
silencioso a partir da segunda atualização feita pelo próprio app. Silêncio
total só com Device Owner (reset de fábrica) — fora do escopo.

## Decisões

- **Origem da versão:** arquivo `update.json` anexado a cada release pela
  pipeline, lido de
  `https://github.com/negoNegoso/Smart-Tv-Ads/releases/latest/download/update.json`
  (link fixo que o GitHub redireciona para a release mais recente; não usa a
  API do GitHub, então não tem limite de requisições).
- **Confirmação só sob demanda:** o app baixa em silêncio e mostra um aviso
  discreto; o diálogo do sistema só abre quando alguém aperta OK. Nunca cobre o
  painel sozinho.
- Alternativas descartadas: endpoint próprio na API (controle de rollout que
  ainda não precisamos); API do GitHub direto (limite de 60 req/h por IP, sem
  hash); abrir o diálogo sozinho (cobre os anúncios até alguém responder).

## Pipeline (`.github/workflows/release.yml`)

No job `release`, depois de conferir o APK, gerar `update.json`:

```json
{
  "versionName": "1.2.0",
  "versionCode": 1002000,
  "apk": "signage-tv-1.2.0.apk",
  "sha256": "<sha256 hex minúsculo do APK>"
}
```

`versionCode` = o mesmo do APK (major×1000000 + minor×1000 + patch), lido do
`aapt dump badging` para não recalcular. `sha256` calculado com `sha256sum`.
Anexado à release junto com o APK e o zip do web.

## App

### Configuração

- `BuildConfig.UPDATE_BASE_URL`: padrão
  `https://github.com/negoNegoso/Smart-Tv-Ads/releases/latest/download/`;
  sobrescrevível por `-PupdateBaseUrl=` (teste no emulador com servidor local).
  Manifesto = `UPDATE_BASE_URL + "update.json"`; APK =
  `UPDATE_BASE_URL + manifest.apk`.
- Permissão nova: `REQUEST_INSTALL_PACKAGES` (a lista da spec do app passa a
  ter 5 permissões).

### Unidades

| Unidade | Função |
|---|---|
| `UpdateManifest` | `parse(json: String): UpdateManifest?` — lê e valida: `versionName` não vazio, `versionCode` > 0, `apk` só nome de arquivo (`^[A-Za-z0-9._-]+\.apk$`, sem `/`), `sha256` 64 hex. Inválido → `null`. Pura. |
| `UpdatePolicy` | `shouldUpdate(remoteCode, installedCode) = remoteCode > installedCode`. Pura. |
| `UpdateDownloader` | Baixa manifesto e APK por HTTPS (`HttpURLConnection`, segue redirecionamento, timeouts 15 s conexão / 60 s leitura). Grava o APK em `cacheDir/updates/<apk>.part`, confere SHA-256, renomeia para `<apk>`. Hash diferente ou erro → apaga e devolve falha. Se `<apk>` já existe com o hash certo, não baixa de novo. Roda em thread própria; resultado volta na main thread. |
| `UpdateInstaller` | Cria sessão do `PackageInstaller` com o APK e faz `commit` com um `PendingIntent` para `UpdateStatusReceiver`. Ao receber `STATUS_PENDING_USER_ACTION`, guarda o `Intent` de confirmação (não abre). `STATUS_SUCCESS` → nada (o app é reiniciado). Falha → avisa a Activity. |
| `UpdateBanner` | `TextView` no canto inferior direito do `activity_main.xml`, fundo escuro semitransparente, texto pequeno: "Atualização X pronta — aperte OK para instalar" / "Falha ao atualizar" (some em 10 s). Não recebe foco. |
| `MainActivity` | Agenda a checagem 2 min após abrir e a cada 6 h (`Handler`, como o reload diário). Quando há confirmação guardada, `KEYCODE_DPAD_CENTER`/`KEYCODE_ENTER`/`KEYCODE_NUMPAD_ENTER` (ACTION_UP) abre a confirmação e não chegam à WebView; sem confirmação guardada, seguem para a WebView como hoje. Cancelado pelo usuário → o aviso volta. |
| `UpdatedReceiver` | `ACTION_MY_PACKAGE_REPLACED` → inicia `MainActivity` (`FLAG_ACTIVITY_NEW_TASK`), se não houver instância viva. Apaga `cacheDir/updates/`. |

Nada disso toca no `tv.html`, na key da TV ou no `localStorage`: dados do app
são mantidos numa atualização com a mesma assinatura.

### Fluxo

1. Checagem → baixa `update.json` → `UpdatePolicy` → se não há versão maior, fim.
2. Baixa o APK (ou reaproveita o já conferido) → SHA-256 ok.
3. `UpdateInstaller` prepara a sessão → recebe o `Intent` de confirmação.
4. `UpdateBanner` mostra "Atualização X pronta — aperte OK para instalar".
5. OK → diálogo do sistema → confirmar → Android instala e reinicia o app;
   `UpdatedReceiver` reabre o painel se o sistema não reabrir.

Só uma checagem/instalação em andamento por vez; uma checagem agendada durante
um download em curso é ignorada.

## Erros

Nenhum erro de atualização cobre o painel nem derruba o app.

- Sem rede / GitHub fora / HTTP ≥ 400: ignora, tenta de novo em 6 h.
- Manifesto inválido: ignora (log).
- Download interrompido, pouco espaço, hash diferente: apaga o parcial, não
  oferece atualização, tenta de novo em 6 h.
- Diálogo cancelado: o aviso volta; OK tenta de novo.
- "Instalar apps desconhecidos" não liberado: o próprio sistema leva à tela de
  liberação quando alguém aperta OK.
- Instalação falha (ex.: assinatura diferente): aviso "Falha ao atualizar" por
  10 s; app segue na versão atual; próxima checagem tenta de novo.

## Segurança

- Só HTTPS (release). O APK é conferido pelo SHA-256 do `update.json`.
- O Android recusa APK com assinatura diferente da instalada: só APK assinado
  com o keystore do projeto instala.
- `apk` do manifesto é validado como nome de arquivo simples (sem caminho).
- APKs baixados ficam no cache privado do app e são apagados após a
  atualização.

## Transição

TVs com a versão **1.0.1** (sem atualizador) precisam de **uma** atualização
manual para a primeira versão com atualizador; dali em diante é automático.

## README (`artifacts/android-tv/README.md`)

- Instalação: liberar "Instalar apps desconhecidos" para o Signage TV.
- Comportamento: checagem a cada 6 h, aviso no canto, OK para instalar;
  limite do Android 10/11 (sempre pede OK).
- Checklist: aviso aparece com versão nova; OK instala; key mantida.

## Testes

**JVM (JUnit + Robolectric):**
- `UpdateManifest`: válido; campos faltando; `versionCode` ≤ 0; `apk` com `/`
  ou sem `.apk`; `sha256` inválido; JSON quebrado.
- `UpdatePolicy`: maior → sim; igual/menor → não.
- Verificação de SHA-256 (função pura sobre `InputStream`/arquivo): bate / não
  bate.
- `UpdateDownloader` contra servidor local de teste (`com.sun.net.httpserver.HttpServer`
  do JDK, sem dependência nova): sucesso, hash errado apaga,
  reaproveita APK já conferido, HTTP 404 falha.
- `MainActivity`: com confirmação guardada, OK abre a confirmação e não chega à
  WebView; sem confirmação, OK segue normal; aviso aparece/some; checagem
  agendada em 2 min e a cada 6 h.
- `UpdatedReceiver`: `MY_PACKAGE_REPLACED` inicia a Activity; outra action não.
- Manifest: permissão `REQUEST_INSTALL_PACKAGES`; `UpdatedReceiver` e
  `UpdateStatusReceiver` (não exportado) registrados.

**Pipeline:** job confere que o `sha256` do `update.json` bate com o APK
anexado.

**Emulador (manual):** APK debug `1.0.0` instalado; outro APK debug `1.0.2` e
`update.json` servidos por HTTP local; app com
`-PupdateBaseUrl=http://10.0.2.2:<porta>/` (cleartext só no debug) → aviso
aparece → OK → confirmar → app reinstalado em 1.0.2, mesma key.

## Fora do escopo

- Atualização 100% silenciosa (Device Owner / root).
- Rollout gradual, pausar versão, canal beta.
- Atualizar o web (já é automático pela Vercel).
