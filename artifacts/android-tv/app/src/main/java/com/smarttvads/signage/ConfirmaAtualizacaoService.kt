package com.smarttvads.signage

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Aperta "Instalar" no diálogo do sistema quando é a atualização do próprio
 * app (regras em [ConfirmaAtualizacao]). Ligado uma vez por box em
 * Configurações → Acessibilidade, ou pelo adb (ver README). Roda no mesmo
 * processo e na main thread, então lê o [UpdateState] direto.
 */
class ConfirmaAtualizacaoService : AccessibilityService() {
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val raiz = rootInActiveWindow ?: return
        val pacote = raiz.packageName?.toString() ?: return
        val temNomeDoApp = raiz.findAccessibilityNodeInfosByText(getString(R.string.app_name)).isNotEmpty()
        val agora = SystemClock.elapsedRealtime()
        if (!ConfirmaAtualizacao.deveConfirmar(pacote, agora, UpdateState.confirmacaoAutomaticaAte, temNomeDoApp)) return
        val id = ConfirmaAtualizacao.idDoBotao(pacote) ?: return
        // O botão nasce desabilitado (proteção contra toque por cima); o
        // evento de conteúdo seguinte, já com ele habilitado, tenta de novo.
        raiz.findAccessibilityNodeInfosByViewId(id)
            .firstOrNull { it.isEnabled }
            ?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    override fun onInterrupt() {}

    companion object {
        fun ligado(context: Context): Boolean = ConfirmaAtualizacao.ligadoNaLista(
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES),
            ComponentName(context, ConfirmaAtualizacaoService::class.java).flattenToString(),
        )
    }
}
