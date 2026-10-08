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

O keystore fica só nos secrets e é apagado do runner ao fim do job.

**O repositório é privado**, então o link `releases/latest/download/` do GitHub
dá 404 para quem baixa sem login — as TVs e o navegador da box. Elas baixam
pela API do painel (`https://smart-tv-ads.vercel.app/api/tv-app/`), que lê a
release com um token guardado só no servidor:

- `GET /api/tv-app/update.json` — o mesmo `update.json` da última release.
- `GET /api/tv-app/signage-tv-X.Y.Z.apk` e `GET /api/tv-app/apk` — redirecionam
  para um link temporário do APK gerado pelo GitHub (vale alguns minutos).

**Configuração única — token na Vercel:** crie um token *fine-grained* no
GitHub (Settings → Developer settings → Personal access tokens) com acesso só
a este repositório e permissão **Contents: Read-only**, e guarde como
`GITHUB_RELEASES_TOKEN` nas variáveis de ambiente de produção do projeto na
Vercel. O token expira na data escolhida ao criar: antes disso, gere outro e
troque a variável — as TVs não mudam nada. Sem ele, a página `/apk` mostra
"Não foi possível obter o aplicativo agora" e as TVs não acham versão nova.

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

### Imagem sem nitidez

Qualquer tecla do controle mostra também o botão **"Ajustar imagem"**, ao
lado do de sair (seta para a direita leva o foco até ele; OK abre). A tela de
ajuste mostra:

- a resolução em que o Android está desenhando e, se a box disser que tem
  modo maior, qual é. Abaixo de 1920x1080, suba a resolução pelo botão "Abrir
  configurações de tela";
- um padrão de teste ao fundo, com linhas de 1 px. De perto as linhas são
  nítidas; de longe o fundo é um cinza liso. Faixas, ondas ou borrão indicam
  que a box ou a TV estão reescalando a imagem: acerte a resolução da box
  para a nativa da TV e, na TV, use o formato "Ajustar à tela" (nome varia
  por marca: "Just Scan", "Somente varredura", "1:1") e baixe a nitidez;
- uma moldura branca de 1 px nas bordas. Lado cortado é overscan da TV:
  resolve no mesmo ajuste de formato.

O app não troca a resolução sozinho: box genérica só deixa mexer nisso pelas
configurações do sistema. Em TV com painel HD (1366x768) nenhuma resolução
casa pixel a pixel; escolha a que der o padrão mais limpo.

Voltar ou "Fechar" saem da tela de ajuste, e ela fecha sozinha depois de
5 minutos sem ninguém mexer no controle.

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

O app se atualiza sozinho a partir das releases do GitHub, pela API do painel
(versão 1.29 em diante; até a 1.28 o app lia direto do GitHub e precisa que o
repositório esteja público para achar a versão nova):

- Checa 2 minutos depois de abrir e depois a cada 6 horas.
- Achou versão nova: baixa e confere o SHA-256.
- **Android 12 ou mais novo:** instala sozinho, sem aviso e sem ninguém
  apertar nada. O painel some por alguns segundos enquanto o app reinicia.
  Vale a partir da versão 1.15.1, a primeira com a permissão
  `UPDATE_PACKAGES_WITHOUT_USER_ACTION`: quem está numa versão anterior ainda
  confirma uma vez com OK para chegar nela.
- **Android 10/11:** o sistema sempre pede confirmação. Aparece no canto
  "Atualização X pronta — aperte OK para instalar", o painel segue normal, e
  alguém aperta **OK** no controle → o Android pergunta "Atualizar?" →
  confirmar. O mesmo aviso aparece no Android 12+ se o sistema recusar a
  instalação silenciosa.
- Nos dois casos o app é reinstalado e reiniciado, com a mesma key (TV continua
  vinculada). Em TV box com Android comum onde o Signage TV é a tela inicial,
  o sistema traz o painel de volta sozinho. Em Android TV / Google TV
  certificado, e no Android 10+ em geral, essa reabertura automática pode ser
  bloqueada pelo sistema — a TV fica no launcher até alguém apertar Home ou
  abrir o app (não é defeito; ver a seção "Android TV / Google TV
  certificado").
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
  Junto aparece "Ajustar imagem", que abre a tela de ajuste (ver "Imagem sem
  nitidez").
- Motor da WebView trava: o app recria a WebView sozinho.
- Todo dia às 04:00 a página é recarregada.
- Aparelho sem Android System WebView: aviso na tela pedindo para atualizar.
- TV apagada no painel admin: volta ao QR com a mesma key.
- "Limpar dados" do app: key nova, QR novo — precisa vincular de novo.
- Falha ao baixar ou instalar atualização: nada muda no painel; aviso
  "Falha ao atualizar" por 10 s quando a instalação falha; tenta de novo na
  próxima checagem.
- Música de fundo (ex.: Spotify aberto na box, tocando em segundo plano): a
  peça com som cala a música e, 1 s depois que ela sai da tela, o app manda
  play de volta. Só manda se havia música tocando quando a peça começou —
  música pausada de propósito continua pausada. Se o play comum não trouxer a
  música em 2 s, o app manda o play direto ao Spotify, uma vez, e para por aí.
  O uso do Spotify em estabelecimento é responsabilidade de quem assina a
  conta: os termos do Spotify são de uso pessoal.
- Música de fundo do painel (link do YouTube configurado na TV, no admin): toca
  dentro do próprio `tv.html` e não depende do app. Com ela ligada, o `tv.html`
  não chama `somIniciou`/`somTerminou`, então o app não mexe no Spotify. É uma
  ou outra: Spotify e música do painel na mesma TV disputam o áudio.

## Checklist de teste manual

- [ ] Emulador Android TV e, se houver, uma TV box real com Android 10.
- [ ] Abrir o app → QR aparece.
- [ ] Vincular pelo celular → painel aparece em até ~10 s.
- [ ] Reiniciar o aparelho → abre sozinho e exibe.
- [ ] Sem rede no boot → aviso → volta sozinho ao reconectar.
- [ ] Peça com YouTube toca com som sem clique.
- [ ] Com o Spotify tocando em segundo plano, a peça com som cala a música e
      ela volta sozinha até ~3 s depois que a peça sai da tela.
- [ ] Com o Spotify pausado à mão, a peça com som passa e a música segue
      pausada.
- [ ] Apagar a TV no painel → volta ao QR.
- [ ] Segurar Voltar por 5 s e soltar abre as Configurações da TV.
- [ ] Uma tecla do controle mostra "Sair da tela cheia"; OK com ele em foco
      devolve as barras e leva ao menu da TV; sem mexer, o botão some em 8 s.
- [ ] Seta para a direita leva o foco a "Ajustar imagem"; OK abre a tela de
      ajuste com a resolução, o padrão de linhas e a moldura inteira; "Abrir
      configurações de tela" abre a tela de vídeo do sistema; Voltar fecha.
- [ ] Voltar no controle não sai do painel; Home volta ao painel em TV box
      com Android comum (em Android TV / Google TV certificado, só depois
      do procedimento da seção "Android TV certificado").
- [ ] Android 10/11: com versão nova na última release, o aviso aparece no
      canto em até 2 minutos depois de abrir.
- [ ] Android 10/11: OK abre a confirmação do sistema; confirmar instala e o
      painel volta com a mesma key.
- [ ] Android 12+, já na 1.15.1 ou mais nova: com versão nova na release, o
      app se atualiza sem aviso nem OK e volta com a mesma key.
- [ ] Com o Signage TV como tela inicial numa TV box com Android comum, o
      painel volta sozinho depois de atualizar.
- [ ] Se a TV ficar no launcher do sistema depois de atualizar (comum em
      Android TV / Google TV certificado), não é defeito — ver a seção
      "Android TV / Google TV certificado".
