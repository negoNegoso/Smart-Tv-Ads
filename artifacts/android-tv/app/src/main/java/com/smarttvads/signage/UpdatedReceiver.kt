package com.smarttvads.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.io.File

/**
 * Depois que o Android instala a versão nova, o processo antigo morre. Apaga
 * os APKs baixados e tenta reabrir o painel.
 *
 * **Ressalva**: o `startActivity` aqui é só uma tentativa, não uma garantia. O
 * E2E mostrou o sistema recusando com "Abort background activity starts" em
 * Android 12 — este processo está em estado RECEIVER, sem janela visível, e
 * o Android 10+ pode bloquear `startActivity` nessa condição de forma geral
 * (não é peculiaridade de launcher certificado). O único caminho confiável de
 * volta é o Signage TV estar configurado como tela inicial (HOME): aí quem
 * traz o painel de volta é o próprio sistema relançando o HOME, não este
 * receiver. Em Android TV ou Google TV certificado, o launcher da Google fica
 * na frente mesmo assim (ver README). A limpeza dos APKs acontece de qualquer
 * forma. Ver também [BootReceiver].
 */
class UpdatedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        try {
            File(context.cacheDir, "updates").deleteRecursively()
            if (MainActivity.hasLiveInstance) return
            context.startActivity(
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } catch (_: Exception) {
            // Nenhum erro de atualização derruba o app.
        }
    }
}
