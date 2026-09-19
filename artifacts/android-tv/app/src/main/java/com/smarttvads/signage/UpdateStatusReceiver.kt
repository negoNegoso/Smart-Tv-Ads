package com.smarttvads.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller

/** Resposta do PackageInstaller à sessão aberta pelo UpdateInstaller. */
class UpdateStatusReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val version = intent.getStringExtra(EXTRA_VERSION) ?: return
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirmation = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirmation == null) UpdateState.failed(aborted = false)
                // Guarda sem abrir: o diálogo cobriria o painel até alguém responder.
                else UpdateState.ready(version, confirmation)
            }
            PackageInstaller.STATUS_SUCCESS -> UpdateState.clear()
            PackageInstaller.STATUS_FAILURE_ABORTED -> UpdateState.failed(aborted = true)
            else -> UpdateState.failed(aborted = false)
        }
    }

    companion object {
        const val EXTRA_VERSION = "com.smarttvads.signage.UPDATE_VERSION"
    }
}
