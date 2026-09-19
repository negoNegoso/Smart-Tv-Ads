package com.smarttvads.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.io.File

/**
 * Depois que o Android instala a versão nova, o processo antigo morre. Reabre
 * o painel (se o sistema não reabriu a tela inicial sozinho) e apaga os APKs
 * baixados.
 */
class UpdatedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        File(context.cacheDir, "updates").deleteRecursively()
        if (MainActivity.hasLiveInstance) return
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
