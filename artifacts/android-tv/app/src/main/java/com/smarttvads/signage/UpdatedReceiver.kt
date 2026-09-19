package com.smarttvads.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.io.File

/**
 * Depois que o Android instala a versão nova, o processo antigo morre. Apaga
 * os APKs baixados e reforça a reabertura do painel.
 *
 * **Ressalva**: o sistema costuma reabrir a tela inicial automaticamente depois
 * da troca de pacote. Este `startActivity` é um reforço que pode ser bloqueado
 * pelo sistema (Android 10+) quando quer evitar abertura de Activities em
 * segundo plano; em Android TV ou Google TV certificado, o launcher da Google
 * pode ficar na frente mesmo com o app como tela inicial. A limpeza dos APKs
 * acontece de qualquer forma. Ver também [BootReceiver].
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
