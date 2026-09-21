# Signage TV — app Android

APK para TV e TV box Android (5.0+, alvo principal Android 10). Abre sozinho
ao ligar, em tela cheia, e carrega `https://smart-tv-ads.vercel.app/tv`. Quem
decide o que aparece é o `artifacts/signage/public/tv.html`:

- TV ainda não vinculada → QR code de vínculo;
- TV vinculada → painel.

O app não tem lógica de pareamento nem de exibição. Mudou o `tv.html`, todas
as TVs pegam no próximo deploy — sem APK novo.

## Requisitos para buildar

- JDK 17
- Android SDK com `platforms;android-35` e `build-tools;35.0.0`
- `local.properties` com `sdk.dir=/caminho/do/Android/sdk` (não versionado)

## Build

```bash
cd artifacts/android-tv
./gradlew :app:testDebugUnitTest      # testes JVM
./gradlew :app:assembleDebug          # aponta para produção
./gradlew :app:assembleRelease        # aponta para produção; exige keystore
```

Outro servidor: `-PtvUrl=https://outro-dominio/tv`. Para testar contra o
`dev.sh` no emulador: `./gradlew :app:installDebug -PtvUrl=http://10.0.2.2:21153/tv`
(o teste instrumentado também precisa desse `-PtvUrl`).

### Keystore de release

Gerar uma vez:

```bash
keytool -genkeypair -keystore signage-tv.jks -alias signage -keyalg RSA -keysize 2048 -validity 10000
```

**Guarde o arquivo e as senhas com backup.** Sem esse mesmo keystore o
Android recusa instalar uma versão nova por cima da instalada, e cada TV teria
que desinstalar o app — perdendo a key e exigindo novo vínculo.

Build assinado:

```bash
export SIGNAGE_KEYSTORE=/caminho/signage-tv.jks
export SIGNAGE_KEYSTORE_PASS=...
export SIGNAGE_KEY_ALIAS=signage
export SIGNAGE_KEY_PASS=...
./gradlew :app:assembleRelease -PversionName=1.0.1
# -> app/build/outputs/apk/release/signage-tv-1.0.1.apk
```

`-PversionName=X.Y.Z` (sufixo como `-rc1` aceito) define a versão e o
`versionCode` = major×1000000 + minor×1000 + patch; sem ele, `1.0.0`. Cada
APK novo precisa de versão maior que a instalada para atualizar por cima.

## Releases automáticas (GitHub Actions)

A pipeline `.github/workflows/release.yml` roda os testes do web e do app em
todo PR. **Cada merge na `main` gera uma release `vX.Y.Z`** em Releases, com
`signage-tv-X.Y.Z.apk` (assinado) e `signage-web-X.Y.Z.zip` (build do web)
anexados — ninguém cria tag à mão. O técnico baixa o APK da release mais
recente.

A versão sobe a partir da última release conforme o título do PR mesclado:

| Título do PR | Sobe | Ex. a partir de 1.4.2 |
|---|---|---|
| `feat(...)` | minor | 1.5.0 |
| `fix(...)`, `docs(...)`, `ci(...)` e demais | patch | 1.4.3 |
| `feat!:` / `fix(x)!:` ou linha `BREAKING CHANGE:` no corpo | major | 2.0.0 |

Sem nenhuma release `vX.Y.Z` ainda, a base é `1.0.0`.

**Configuração única — secrets do repositório** (Settings → Secrets and
variables → Actions), a partir do keystore gerado acima:

```bash
base64 -i signage-tv.jks | gh secret set SIGNAGE_KEYSTORE_BASE64
gh secret set SIGNAGE_KEYSTORE_PASS   # pede a senha no terminal
gh secret set SIGNAGE_KEY_ALIAS --body signage
gh secret set SIGNAGE_KEY_PASS        # pede a senha no terminal
```

O repositório é público: o APK do Release fica baixável por qualquer um (ele
só abre o domínio público). O keystore fica só nos secrets e é apagado do
runner ao fim do job.

## Instalação na TV / TV box (técnico)

O caminho mais curto na box é abrir o navegador dela e digitar
**smart-tv-ads.vercel.app/apk**: a página mostra a versão, dispara o download
do APK da última release e explica os passos seguintes. A rota lê o
`update.json` da release, então sempre entrega o APK mais novo.

1. Copie `signage-tv-<versão>.apk` para um pendrive (ou baixe na box pelo
   link acima).
2. Na box, permita instalar apps de fontes desconhecidas (Configurações →
   Segurança; em Android 8+ a permissão é por app, ex.: o gerenciador de
   arquivos).
3. Abra o APK pelo gerenciador de arquivos e instale.
4. Libere **Instalar apps desconhecidos** para o **Signage TV** (Configurações
   → Apps → Acesso especial / Segurança; em Android 8+ é por app). É o que
   permite o app instalar as próprias atualizações.
5. Abra **Signage TV**. Aparece o QR code.
6. Aperte **Home** no controle. Quando o Android perguntar qual tela inicial
   usar, escolha **Signage TV → Sempre**. Em TV box com Android comum
   (AOSP) é isso que faz o app abrir sozinho quando a box liga (Android
   10+ não permite de outro jeito). Em Android TV / Google TV certificado
   não basta — veja a seção abaixo.
7. Leia o QR com o celular do administrador e vincule a TV a uma empresa. Em
   alguns segundos a TV começa a exibir.

Se a box não perguntar a tela inicial: Configurações → Apps → Apps padrão →
Tela inicial → Signage TV.

**Para mexer na box depois:** Configurações do sistema (um toque em Voltar
não sai do painel). Chegar lá com o app em primeiro plano:

- **Botão "Sair da tela cheia"**: qualquer tecla do controle faz o botão
  aparecer no canto inferior esquerdo por 8 segundos; com ele em foco, aperte
  OK. As barras do sistema voltam e a TV vai para o menu. Numa box onde o
  Signage TV é a tela inicial, o sistema traz o painel de volta na hora — ali
  use a saída abaixo;
- **Segure Voltar por 5 segundos e solte**: abre as Configurações da TV. De
  lá dá para abrir outros apps e trocar a tela inicial;
- Tecla de configurações/engrenagem do controle remoto, se houver;
- Teclado ou mouse USB (o Android aceita normalmente);
- Ou, com um PC na mesma rede e depuração USB/rede ligada:
  `adb shell am start -a android.settings.SETTINGS`.

Para devolver o launcher original, troque a tela inicial padrão de volta.

### Android TV / Google TV certificado

Em aparelhos com o Android TV certificado pela Google (a maioria das smart
TVs e boxes "Google TV"), o launcher da Google
(`com.google.android.tvlauncher`, ou `com.google.android.apps.tv.launcherx`
no Google TV) fica na frente depois do boot e depois da tecla Home, mesmo
com o Signage TV escolhido como tela inicial — não é peculiaridade de
emulador, é o comportamento do launcher certificado. Para o app ser
realmente a única tela inicial:

1. Ligue as opções de desenvolvedor (Configurações → Sobre → toque 7x em
   "Compilação") e a depuração por rede ou USB.
2. Pelo `adb` (rede: `adb connect <ip-da-tv>:5555`):
   ```bash
   adb shell pm disable-user --user 0 com.google.android.tvlauncher
   # Google TV: adb shell pm disable-user --user 0 com.google.android.apps.tv.launcherx
   ```
3. Reinicie a box. O Signage TV passa a abrir sozinho.

Riscos: precisa de `adb`; uma atualização OTA do sistema pode reativar o
launcher da Google, exigindo repetir o passo 2. É reversível:
`adb shell pm enable com.google.android.tvlauncher`.

Nessas TVs, desligue também a economia de energia que apaga a tela sozinha
(Configurações → Preferências do dispositivo → Energia → "Desligar tela
após", escolha nunca/o maior valor): `FLAG_KEEP_SCREEN_ON` não bloqueia esse
temporizador do sistema, só o de suspensão geral.

## Atualizar o app

O app se atualiza sozinho a partir das releases do GitHub:

- Checa 2 minutos depois de abrir e depois a cada 6 horas.
- Achou versão nova: baixa, confere o SHA-256 e mostra no canto
  "Atualização X pronta — aperte OK para instalar". O painel segue normal.
- Alguém aperta **OK** no controle → o Android pergunta "Atualizar?" →
  confirmar. O app é reinstalado e reiniciado, com a mesma key (TV continua
  vinculada). Em TV box com Android comum onde o Signage TV é a tela inicial,
  o sistema traz o painel de volta sozinho. Em Android TV / Google TV
  certificado, e no Android 10+ em geral, essa reabertura automática pode ser
  bloqueada pelo sistema — a TV fica no launcher até alguém apertar Home ou
  abrir o app (não é defeito; ver a seção "Android TV / Google TV
  certificado").
- Android 10/11 sempre pede essa confirmação. No Android 12+, a partir da
  segunda atualização feita pelo próprio app, instala sem perguntar.
- Cancelou o diálogo: o aviso volta; OK tenta de novo.

TVs com a versão **1.0.1** ainda não têm o atualizador: instale uma vez à mão
o APK da release mais recente (mesmo keystore, por cima). Dali em diante é
automático. Conteúdo e comportamento de exibição continuam chegando pelo
deploy web.

## Comportamento

- Sem rede ao abrir: tela "Sem conexão. Tentando novamente…", nova tentativa
  em 5 s, 10 s, 20 s, 40 s e depois a cada 60 s.
- Android 5.x (API 21–22): a WebView não informa erro HTTP. Se o servidor
  devolver erro (ex.: 503) na abertura, a tela fica no erro até o reload das
  04:00 ou reiniciar o aparelho. Erro de rede é tratado normalmente.
- Rede cai com o painel no ar: o painel segue com a última lista.
- Mexeu no controle: o botão "Sair da tela cheia" aparece no canto inferior
  esquerdo por 8 s e some sozinho, sem cobrir os anúncios. Com ele em foco, o
  OK sai do painel; sem ele na tela, o OK volta a servir à atualização.
- Motor da WebView trava: o app recria a WebView sozinho.
- Todo dia às 04:00 a página é recarregada.
- Aparelho sem Android System WebView: aviso na tela pedindo para atualizar.
- TV apagada no painel admin: volta ao QR com a mesma key.
- "Limpar dados" do app: key nova, QR novo — precisa vincular de novo.
- Falha ao baixar ou instalar atualização: nada muda no painel; aviso
  "Falha ao atualizar" por 10 s quando a instalação falha; tenta de novo na
  próxima checagem.

## Checklist de teste manual

- [ ] Emulador Android TV e, se houver, uma TV box real com Android 10.
- [ ] Abrir o app → QR aparece.
- [ ] Vincular pelo celular → painel aparece em até ~10 s.
- [ ] Reiniciar o aparelho → abre sozinho e exibe.
- [ ] Sem rede no boot → aviso → volta sozinho ao reconectar.
- [ ] Peça com YouTube toca com som sem clique.
- [ ] Apagar a TV no painel → volta ao QR.
- [ ] Segurar Voltar por 5 s e soltar abre as Configurações da TV.
- [ ] Uma tecla do controle mostra "Sair da tela cheia"; OK com ele em foco
      devolve as barras e leva ao menu da TV; sem mexer, o botão some em 8 s.
- [ ] Voltar no controle não sai do painel; Home volta ao painel em TV box
      com Android comum (em Android TV / Google TV certificado, só depois
      do procedimento da seção "Android TV certificado").
- [ ] Com versão nova na última release, o aviso aparece no canto em até
      2 minutos depois de abrir.
- [ ] OK abre a confirmação do sistema; confirmar instala e o painel volta com
      a mesma key.
- [ ] Com o Signage TV como tela inicial numa TV box com Android comum, o
      painel volta sozinho depois de atualizar.
- [ ] Se a TV ficar no launcher do sistema depois de atualizar (comum em
      Android TV / Google TV certificado), não é defeito — ver a seção
      "Android TV / Google TV certificado".
