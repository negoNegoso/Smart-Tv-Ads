package com.smarttvads.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Abre a TV quando o aparelho liga. Até o Android 9 isso basta; do 10 em
 * diante o sistema bloqueia abrir Activity daqui em segundo plano — em TV
 * box com Android comum (AOSP) quem garante é o app ser a tela inicial (ver
 * README). Em Android TV / Google TV certificado, ser a tela inicial não
 * basta: o launcher da Google fica na frente mesmo assim (ver README, seção
 * "Android TV certificado").
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        // Se a tela inicial (HOME) já abriu uma instância, não inicia outra
        // aqui: seria uma segunda instância viva contando telemetria em dobro.
        if (MainActivity.hasLiveInstance) return
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
