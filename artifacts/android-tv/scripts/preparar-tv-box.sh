#!/usr/bin/env bash
# Deixa uma TV box/stick pronta para o Smart Vale TV, pelo adb na rede.
# Roteiro completo e o porquê de cada passo: artifacts/android-tv/docs/preparar-tv-box.md
#
# Uso: bash preparar-tv-box.sh <ip[:porta]> [--aplicar] [--desligar-adb]
#   sem --aplicar   só diagnostica e mostra o que faria (nada muda na box)
#   --aplicar       instala/atualiza o app, limpa os apps, liga a confirmação automática
#   --desligar-adb  no fim, desliga a depuração (corta o acesso remoto)
set -uo pipefail

ALVO="${1:-}"
[[ -z "$ALVO" || "$ALVO" == -* ]] && { sed -n 2,9p "$0"; exit 2; }
[[ "$ALVO" == *:* ]] || ALVO="$ALVO:5555"
APLICAR=0; DESLIGAR_ADB=0
for a in "${@:2}"; do
  case "$a" in
    --aplicar) APLICAR=1 ;;
    --desligar-adb) DESLIGAR_ADB=1 ;;
    *) echo "opção desconhecida: $a"; exit 2 ;;
  esac
done

APP=com.smarttvads.signage
SERVICO="$APP/$APP.ConfirmaAtualizacaoService"
# Ficam instalados mesmo sendo de terceiros.
TERCEIROS_MANTIDOS=" $APP com.android.chrome "
# Achados em box chinesa "Android 13" (Amlogic, API 28). com.abc.ninja se diz
# "keychain", roda como uid system e instala/remove apps em silêncio;
# com.master.accessibility apaga a lista de acessibilidade (desliga o nosso
# serviço); CleanUp mata apps em segundo plano. O resto é inútil numa TV de
# anúncios e só disputa memória.
SISTEMA_DESATIVAR="com.abc.ninja com.master.accessibility com.master.apps
com.master.ttyunos.superuser com.charon.rocketfly com.android.mbox com.ftest
com.droidlogic.videoplayer com.droidlogic.FileBrower com.android.gallery3d
com.google.android.katniss com.google.android.tvrecommendations
com.google.android.backdrop com.google.android.atv.widget com.android.printspooler"
# Prefixos de sistema conhecidos; o que não casar vai para revisão manual.
SISTEMA_CONHECIDO='^(android|android\.ext\..*|com\.android\..*|com\.google\.android\..*|com\.droidlogic.*|com\.amlogic\..*|com\.mediatek\..*|com\.rockchip\..*|com\.allwinner\..*|com\.softwinner\..*)$'

ADB="${ADB:-$(command -v adb || echo "$HOME/Library/Android/sdk/platform-tools/adb")}"
[[ -x "$ADB" ]] || { echo "adb não encontrado (defina ADB=/caminho/adb)"; exit 1; }
export ANDROID_SERIAL="$ALVO"
sh_() { "$ADB" shell "$@" 2>/dev/null | tr -d '\r'; }
titulo() { printf '\n== %s\n' "$1"; }
faz() { # executa só com --aplicar; senão mostra
  if (( APLICAR )); then "$@" | sed 's/^/  /'; else shift; echo "  [faria] adb $*"; fi
}

titulo "Conexão"
# No macOS, um servidor adb antigo pode ficar sem permissão de Rede Local e
# responder "No route to host" mesmo com a box no ar: reinicia o servidor.
"$ADB" kill-server >/dev/null 2>&1; "$ADB" start-server >/dev/null 2>&1
"$ADB" connect "$ALVO" | sed 's/^/  /'
sleep 2
[[ "$(sh_ echo ok)" == ok ]] || { echo "  sem acesso à box: depuração por rede ligada? autorizou na TV?"; exit 1; }

titulo "Aparelho"
SDK=$(sh_ getprop ro.build.version.sdk)
REL=$(sh_ getprop ro.build.version.release)
echo "  Android na tela: $REL | API real: $SDK ($(sh_ getprop ro.hardware) $(sh_ getprop ro.board.platform))"
echo "  build: $(sh_ getprop ro.build.fingerprint)"
echo "  /data: $(sh_ df -h /data | tail -1 | awk '{print $2" total, "$4" livres"}')"
case "$SDK" in
  ''|*[!0-9]*) echo "  API ilegível"; exit 1 ;;
esac
if (( SDK < 31 )); then
  echo "  -> abaixo do Android 12: atualização pede confirmação; precisa da confirmação automática"
else
  echo "  -> Android 12+: o app se atualiza sozinho; confirmação automática não é necessária"
fi
[[ "$(sh_ getprop ro.adb.secure)" == 0 ]] && echo "  ⚠ ro.adb.secure=0: qualquer um na rede entra por adb sem autorização"

titulo "App Smart Vale TV"
ATUAL=$(sh_ dumpsys package $APP | sed -n 's/^ *versionName=//p' | head -1)
echo "  instalado: ${ATUAL:-não}"
REPO_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
ULTIMA=$(cd "$REPO_DIR" && gh release view --json tagName -q .tagName 2>/dev/null | sed 's/^v//')
echo "  última release: ${ULTIMA:-? (gh sem acesso)}"
if [[ -n "$ULTIMA" && "$ATUAL" != "$ULTIMA" ]]; then
  TMP=$(mktemp -d)
  if (( APLICAR )); then
    (cd "$REPO_DIR" && gh release download "v$ULTIMA" -p "signage-tv-$ULTIMA.apk" -p update.json -D "$TMP") || exit 1
    ESPERADO=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["sha256"])' "$TMP/update.json")
    OBTIDO=$(shasum -a 256 "$TMP/signage-tv-$ULTIMA.apk" | cut -d' ' -f1)
    [[ "$ESPERADO" == "$OBTIDO" ]] || { echo "  SHA-256 não confere; abortando"; exit 1; }
    # -i: o próprio app fica como instalador registrado (exigência do Android
    # 12+ para se atualizar sem pergunta). -r: por cima, mantém a key da TV.
    "$ADB" install -r -i $APP "$TMP/signage-tv-$ULTIMA.apk" | sed 's/^/  /'
  else
    echo "  [faria] baixar signage-tv-$ULTIMA.apk da release, conferir SHA-256 e instalar por cima"
  fi
  rm -rf "$TMP"
fi
# Sem "fontes desconhecidas" o diálogo de instalação vira um desvio para as
# configurações, e a confirmação automática não acha o botão.
faz "$ADB" shell appops set $APP REQUEST_INSTALL_PACKAGES allow

titulo "Apps de terceiros (fica só: $TERCEIROS_MANTIDOS)"
for p in $(sh_ pm list packages -3 | sed 's/package://' | sort); do
  [[ "$TERCEIROS_MANTIDOS" == *" $p "* ]] && continue
  faz "$ADB" shell pm uninstall "$p"
done

titulo "Apps de sistema suspeitos ou inúteis (desativar, reversível com pm enable)"
INSTALADOS=$(sh_ pm list packages | sed 's/package://')
DESATIVADOS=$(sh_ pm list packages -d | sed 's/package://')
for p in $SISTEMA_DESATIVAR; do
  grep -qx "$p" <<<"$INSTALADOS" || continue
  if grep -qx "$p" <<<"$DESATIVADOS"; then echo "  $p: já desativado"; continue; fi
  faz "$ADB" shell pm disable-user --user 0 "$p"
done

titulo "Apps de sistema desconhecidos (revisar à mão)"
DESCONHECIDOS=$(sh_ pm list packages -s -e | sed 's/package://' | sort | grep -Ev "$SISTEMA_CONHECIDO")
for p in $DESCONHECIDOS; do
  info=$(sh_ dumpsys package "$p")
  uid=$(sed -n 's/^ *userId=//p' <<<"$info" | head -1)
  instala=$(grep -c 'INSTALL_PACKAGES: granted=true' <<<"$info")
  cam=$(sh_ pm path "$p" | head -1 | sed 's/package://')
  echo "  $p  uid=$uid  instala_apps=$([[ $instala -gt 0 ]] && echo SIM || echo não)  $cam"
done
[[ -z "$DESCONHECIDOS" ]] && echo "  nenhum"

titulo "Confirmação automática da atualização"
if (( SDK >= 31 )); then
  echo "  não precisa (Android 12+)"
elif [[ "$(sh_ settings get secure enabled_accessibility_services)" == *"$SERVICO"* ]]; then
  echo "  já ligada"
elif (( APLICAR )); then
  "$ADB" shell settings put secure enabled_accessibility_services "$SERVICO"
  "$ADB" shell settings put secure accessibility_enabled 1
  sleep 10
  LIGADO=$(sh_ settings get secure enabled_accessibility_services)
  if [[ "$LIGADO" == *"$SERVICO"* ]]; then
    echo "  ligada e firme depois de 10 s"
  else
    echo "  ✗ desligada de novo por outro app. Quem gravou por último:"
    sh_ dumpsys settings | grep -E "name:(enabled_accessibility_services|accessibility_enabled) " | sed 's/^/    /'
    echo "  desative esse pacote (pm disable-user --user 0 <pacote>) e rode de novo"
    exit 1
  fi
else
  echo "  [faria] ligar $SERVICO e conferir se continua ligada depois de 10 s"
fi

titulo "Painel"
faz "$ADB" shell am start -n $APP/.MainActivity

if (( DESLIGAR_ADB )); then
  titulo "Depuração"
  faz "$ADB" shell settings put global adb_enabled 0
fi

(( APLICAR )) || printf '\nNada foi alterado. Rode de novo com --aplicar.\n'
