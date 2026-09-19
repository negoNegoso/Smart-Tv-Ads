package com.smarttvads.signage

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import java.io.File

/**
 * Entrega o APK conferido ao PackageInstaller. O sistema responde no
 * UpdateStatusReceiver: no Android 10/11 sempre pede confirmação; no 12+
 * pode instalar sem perguntar quando o próprio app instalou a versão atual.
 */
class UpdateInstaller(private val context: Context) {

    fun prepare(apk: File, versionName: String) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(context.packageName)
        if (Build.VERSION.SDK_INT >= 31) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("base.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val status = Intent(context, UpdateStatusReceiver::class.java)
                .putExtra(UpdateStatusReceiver.EXTRA_VERSION, versionName)
            // O sistema preenche o status no Intent: no Android 12+ precisa ser mutável.
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val pending = PendingIntent.getBroadcast(context, sessionId, status, flags)
            session.commit(pending.intentSender)
        }
    }
}
