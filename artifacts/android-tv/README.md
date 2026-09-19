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
./gradlew :app:assembleDebug          # aponta para http://10.0.2.2:21153/tv (dev.sh + emulador)
./gradlew :app:assembleRelease        # aponta para produção; exige keystore
```

Outro servidor: `./gradlew :app:assembleRelease -PtvUrl=https://outro-dominio/tv`.

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
./gradlew :app:assembleRelease
# -> app/build/outputs/apk/release/signage-tv-<versão>.apk
```

## Instalação na TV / TV box (técnico)

1. Copie `signage-tv-<versão>.apk` para um pendrive (ou baixe na box).
2. Na box, permita instalar apps de fontes desconhecidas (Configurações →
   Segurança; em Android 8+ a permissão é por app, ex.: o gerenciador de
   arquivos).
3. Abra o APK pelo gerenciador de arquivos e instale.
4. Abra **Signage TV**. Aparece o QR code.
5. Aperte **Home** no controle. Quando o Android perguntar qual tela inicial
   usar, escolha **Signage TV → Sempre**. É isso que faz o app abrir sozinho
   quando a box liga (Android 10+ não permite de outro jeito).
6. Leia o QR com o celular do administrador e vincule a TV a uma empresa. Em
   alguns segundos a TV começa a exibir.

Se a box não perguntar a tela inicial: Configurações → Apps → Apps padrão →
Tela inicial → Signage TV.

**Para mexer na box depois:** Configurações do sistema (a tecla Voltar não
sai do painel). Para devolver o launcher original, troque a tela inicial
padrão.

## Atualizar o app

Instale o APK novo por cima (mesmo keystore). Os dados ficam — a TV continua
vinculada. Conteúdo e comportamento de exibição chegam pelo deploy web.

## Comportamento

- Sem rede ao abrir: tela "Sem conexão. Tentando novamente…", nova tentativa
  em 5 s, 10 s, 20 s, 40 s e depois a cada 60 s.
- Android 5.x (API 21–22): a WebView não informa erro HTTP. Se o servidor
  devolver erro (ex.: 503) na abertura, a tela fica no erro até o reload das
  04:00 ou reiniciar o aparelho. Erro de rede é tratado normalmente.
- Rede cai com o painel no ar: o painel segue com a última lista.
- Motor da WebView trava: o app recria a WebView sozinho.
- Todo dia às 04:00 a página é recarregada.
- Aparelho sem Android System WebView: aviso na tela pedindo para atualizar.
- TV apagada no painel admin: volta ao QR com a mesma key.
- "Limpar dados" do app: key nova, QR novo — precisa vincular de novo.

## Checklist de teste manual

- [ ] Emulador Android TV e, se houver, uma TV box real com Android 10.
- [ ] Abrir o app → QR aparece.
- [ ] Vincular pelo celular → painel aparece em até ~10 s.
- [ ] Reiniciar o aparelho → abre sozinho e exibe.
- [ ] Sem rede no boot → aviso → volta sozinho ao reconectar.
- [ ] Peça com YouTube toca com som sem clique.
- [ ] Apagar a TV no painel → volta ao QR.
- [ ] Voltar no controle não sai do painel; Home volta ao painel.
