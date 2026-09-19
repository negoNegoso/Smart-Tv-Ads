package com.smarttvads.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Abre a TV quando o aparelho liga. Até o Android 9 isso basta; do 10 em
 * diante o sistema bloqueia abrir Activity daqui e quem garante é o app ser a
 * tela inicial (ver README).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
