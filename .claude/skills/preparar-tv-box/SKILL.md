---
name: preparar-tv-box
description: Use when a TV box or TV stick needs to be set up for the Smart Vale TV signage app, when a box keeps asking "aperte OK para instalar" on every update, when a cheap Android box claims "Android 13" or huge storage, or when asked to clean bloatware/suspicious apps from a store TV box over adb.
---

# Preparar TV box

## Visão geral

O script `artifacts/android-tv/scripts/preparar-tv-box.sh` faz os passos fixos
(diagnóstico, app na última release, limpeza, confirmação automática). Você
cuida do que exige julgamento: apps desconhecidos e falhas. O porquê de cada
passo está em `artifacts/android-tv/docs/preparar-tv-box.md`; leia ao
encontrar algo fora do roteiro.

## Roteiro

1. **IP da box.** Peça o IPv4 (Configurações → Rede → Status) e confirme que
   a depuração por rede está ligada. Ignore os endereços IPv6.
2. **Diagnóstico** (não muda nada), na raiz do repositório:
   `bash artifacts/android-tv/scripts/preparar-tv-box.sh <ip>`
3. **Revise a saída antes de aplicar:**
   - "API real" é o que vale; o "Android na tela" pode ser falso.
   - Mostre ao usuário o que será desinstalado (terceiros) antes de aplicar.
   - **Apps de sistema desconhecidos:** investigue cada um (`dumpsys package`,
     rótulo, assinatura com `apksigner verify --print-certs` após `adb pull`).
     Suspeito ou inútil → adicione em `SISTEMA_DESATIVAR` no script, com o
     motivo na tabela do doc. Na dúvida sobre algo que pareça essencial,
     pergunte; nunca desative WebView, instalador, SystemUI, configurações,
     launcher, teclado, Play Store/GMS ou o OTA do fabricante.
4. **Aplicar:** `bash artifacts/android-tv/scripts/preparar-tv-box.sh <ip> --aplicar`
5. **Conferir:** `adb reboot`, espere subir e confira painel na frente
   (`dumpsys activity activities | grep mResumedActivity`) e, com API ≤ 30,
   o serviço ainda em `enabled_accessibility_services`.
6. **Depuração:** avise o usuário se aparecer `ro.adb.secure=0` e pergunte se
   desliga (`--desligar-adb` corta o acesso remoto). Não desligue sem ele
   responder.

## Falhas comuns

| Sintoma | Causa | O que fazer |
|---|---|---|
| `No route to host` com ping ok | servidor adb do Mac sem Rede Local | o script já reinicia; se persistir, `adb kill-server` e tente de novo |
| "desligada de novo por outro app" | app do fabricante regrava a acessibilidade | o script mostra o `pkg:` que gravou; desative-o, inclua em `SISTEMA_DESATIVAR`, rode de novo |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | app instalado com outra assinatura (build debug) | desinstalar perde a key da TV: pergunte antes |
| Conexão adb cai entre comandos | box derruba o transporte | conecte e rode os comandos na mesma chamada |
| Serviço desligado depois de um tempo | alguém deu "Forçar parada" no app | rode o script de novo |

## Ao terminar

Relate: API real, versão do app, o que foi removido/desativado, apps
desconhecidos e a decisão sobre cada um, estado da confirmação automática e
da depuração. Mudou o script ou o doc → branch + PR (`docs(android-tv): …`).
