# Preparar uma TV box / stick para o Smart Vale TV

Roteiro para deixar uma box nova pronta para a loja: app instalado na última
versão, atualizações entrando sem ninguém apertar OK, e só o necessário
rodando. O script `artifacts/android-tv/scripts/preparar-tv-box.sh` faz os
passos fixos; este documento explica o porquê de cada um e como desfazer.

## Antes de começar

1. Na box: Configurações → Sobre → clique 7× em "Build/Versão" para liberar o
   modo desenvolvedor. Em Opções do desenvolvedor, ligue **Depuração USB** e
   **Depuração por rede (ADB)**.
2. Anote o IP em Configurações → Rede → Status. Use o endereço IPv4
   (`192.168.x.y`); as linhas com `:` são IPv6 e não servem.
3. No Mac, na raiz do repositório, com `gh` logado (para baixar a release):

   ```bash
   bash artifacts/android-tv/scripts/preparar-tv-box.sh 192.168.x.y            # só diagnostica
   bash artifacts/android-tv/scripts/preparar-tv-box.sh 192.168.x.y --aplicar  # aplica
   ```

   Sem `--aplicar` nada muda na box: o script mostra o diagnóstico e o que
   faria. Rodar de novo numa box já pronta não estraga nada.

Se o `adb connect` disser "No route to host" com a box respondendo ping, é o
servidor adb do Mac sem permissão de Rede Local: o script já reinicia o
servidor (`adb kill-server && adb start-server`) antes de conectar.

## O que o script faz e por quê

### 1. Confere a versão real do Android

Muita box chinesa ("Android 13", "512GB + 1TB") troca só o texto da versão.
Quem decide o comportamento é a API real:

```bash
adb shell getprop ro.build.version.sdk   # 28 = Android 9, 30 = 11, 31+ = 12 ou mais novo
```

- **API 31+ (Android 12+):** o app se atualiza sozinho, sem pergunta.
- **API ≤ 30:** o Android sempre pede confirmação para instalar. Precisa da
  confirmação automática (passo 5).

O stick da loja (Amlogic p291, "Android 13.0") é API 28.

### 2. Instala ou atualiza o app

Baixa o `signage-tv-X.Y.Z.apk` da última release, confere o SHA-256 com o
`update.json` da própria release e instala por cima:

```bash
adb install -r -i com.smarttvads.signage signage-tv-X.Y.Z.apk
```

`-r` mantém os dados (a key da TV continua vinculada). `-i` registra o próprio
app como instalador, exigência do Android 12+ para ele se atualizar sem
pergunta. Box nova abre o pareamento por QR code depois.

Também libera "instalar apps desconhecidos" para o app (`appops set …
REQUEST_INSTALL_PACKAGES allow`). Sem isso o diálogo de instalação vira um
desvio para as configurações, e a confirmação automática não acha o botão.

### 3. Remove apps de terceiros

Fica só o Smart Vale TV, o Chrome e o Tailscale (se instalado). Box chinesa costuma vir com IPTV pirata,
lojas paralelas e players que competem por memória e rede (`pm uninstall`).

### 4. Desativa apps de sistema suspeitos ou inúteis

`pm disable-user --user 0 <pacote>`, reversível com
`adb shell pm enable <pacote>`. Lista no script (`SISTEMA_DESATIVAR`):

| Pacote | Por quê |
|---|---|
| `com.abc.ninja` ("keychain") | Roda como uid `system`, instala/remove apps em silêncio, mexe em configurações seguras e acessa a internet: backdoor em potencial |
| `com.master.accessibility` ("NetflixMouse") | Regrava a lista de acessibilidade como vazia ~1 s depois de qualquer mudança: **desliga a confirmação automática** |
| `com.master.apps`, `com.master.ttyunos.superuser` | Gaveta de apps e "superuser" do fabricante |
| `com.charon.rocketfly` (CleanUp) | Mata apps em segundo plano; um "forçar parada" no nosso app desliga a confirmação automática |
| `com.android.mbox`, `com.ftest` | Utilitários do fabricante assinados com a chave de testes pública do AOSP |
| Galeria, player, gerenciador de arquivos, busca por voz, recomendações, protetor de tela (Backdrop), widget, impressão | Inúteis numa TV de anúncios |

**Não desativar:** nada de `com.android.*`/`com.google.android.*` essencial
(SystemUI, configurações, instalador, WebView, Play Store, GMS, teclado,
launcher, controle Bluetooth) nem o "UPDATE" (`com.droidlogic.otaupgrade`,
atualização do sistema). WebView desativado = painel em branco.

### 5. Liga a confirmação automática (só API ≤ 30)

O app tem um serviço de acessibilidade (`ConfirmaAtualizacaoService`, versão
1.32+) que aperta "Instalar" no diálogo do sistema quando é a atualização do
próprio app. O script liga:

```bash
adb shell settings put secure enabled_accessibility_services \
  com.smarttvads.signage/com.smarttvads.signage.ConfirmaAtualizacaoService
adb shell settings put secure accessibility_enabled 1
```

e confere 10 s depois se continua ligado. Se outro app desligou, o script
mostra quem gravou por último (`dumpsys settings`): desative esse pacote e
rode de novo.

O serviço sobrevive a atualização e reinício. **"Forçar parada" do app
desliga** (regra do Android): rode o script de novo.

### 6. Abre o painel

### 7. (Opcional) Desliga a depuração

`--desligar-adb` faz `settings put global adb_enabled 0` no fim. Muita box
vem com `ro.adb.secure=0`: com a depuração por rede ligada, qualquer aparelho
no Wi-Fi da loja entra como root sem autorização. Desligar corta também o
nosso acesso remoto (para voltar, religar nas Opções do desenvolvedor). Se
precisar manter para manutenção, deixe a box numa rede separada do caixa e
dos pagamentos.

## Suporte remoto (Tailscale)

O IP da box na loja (`192.168.x.y`) só é alcançável de dentro da loja. Com o
Tailscale (VPN privada, grátis até 100 aparelhos) a box ganha um IP fixo
`100.x.y.z` que funciona de qualquer lugar, sem abrir porta no roteador, e
o adb funciona por ele igual a hoje.

Uma vez por box:

1. `bash artifacts/android-tv/scripts/preparar-tv-box.sh 192.168.x.y --aplicar --tailscale`
   (instala o APK oficial de `pkgs.tailscale.com` com SHA-256 conferido, deixa
   a VPN sempre ligada sem lockdown e abre o app). O script mantém o
   Tailscale na lista de apps de terceiros.
2. Na TV: **OK** na permissão de VPN do Android.
3. A TV mostra um QR e um código: aprove no painel do Tailscale (Machines →
   Add device → código) ou lendo o QR com o celular logado na conta.
4. No Mac (Tailscale instalado e logado na mesma conta):

   ```bash
   tailscale status                               # acha o IP 100.x da box
   adb connect 100.x.y.z:5555
   ADB=~/Library/Android/sdk/platform-tools/adb scrcpy -s 100.x.y.z:5555   # tela e controle
   bash artifacts/android-tv/scripts/preparar-tv-box.sh 100.x.y.z          # diagnóstico remoto
   ```

Sem lockdown, se o Tailscale cair o painel continua com internet; só o
acesso remoto some até ele voltar (volta sozinho depois de reiniciar). Renomeie
a máquina no painel do Tailscale com o nome da loja.

O adb continua aberto também na rede da loja (`ro.adb.secure=0`): deixe a
box num Wi-Fi sem clientes e separado do caixa. `--tailscale` e
`--desligar-adb` não combinam (sem adb não há suporte).

## Apps desconhecidos

O script lista os apps de sistema ativos que não são de fabricantes
conhecidos (Android, Google, Amlogic, Rockchip, Allwinner, MediaTek), com o
uid e se podem instalar apps. Revise à mão: desconfie de nome genérico
disfarçado de sistema, uid `1000` (system) e permissão de instalar apps. Se
for lixo ou suspeito, adicione em `SISTEMA_DESATIVAR` no script (assim a
próxima box igual já sai limpa) e rode de novo.

## Conferir

- `adb shell dumpsys package com.smarttvads.signage | grep versionName` = última release.
- `adb shell settings get secure enabled_accessibility_services` contém o serviço (API ≤ 30).
- Reiniciar a box (`adb reboot`): o painel volta sozinho e o serviço continua ligado.
