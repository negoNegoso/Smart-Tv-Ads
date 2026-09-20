package com.smarttvads.signage

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.io.File

/**
 * Entrega o APK conferido ao PackageInstaller. O sistema responde no
 * UpdateStatusReceiver: no Android 10/11 sempre pede confirmação; no 12+
 * pode instalar sem perguntar quando o próprio app instalou a versão atual.
 */
class UpdateInstaller(private val context: Context) : UpdateController.Installer {

    override fun prepare(apk: File, versionName: String) {
        val installer = context.packageManager.packageInstaller
        var sessionId: Int? = null
        try {
            // Sessão comitada e não confirmada nunca é limpa sozinha, e o guard em
            // memória da Activity some a cada reinício de processo (frequente numa
            // box 24/7): sem isso, cada checagem empilha sessão + cópia do APK em
            // /data. Abandona as sessões deste pacote antes de abrir a nova, exceto
            // a sessão ativa: se a pessoa apertou OK, o diálogo do sistema está com
            // ela na tela nesse momento (pendingConfirmation já foi limpo, mas o
            // status final ainda não chegou) — abandoná-la mataria em silêncio a
            // instalação que a pessoa está confirmando.
            installer.mySessions
                .filter { it.appPackageName == context.packageName && it.sessionId != UpdateState.activeSessionId }
                .forEach { info ->
                    try {
                        installer.abandonSession(info.sessionId)
                    } catch (abandonError: Exception) {
                        // Sessão pode já ter sido descartada pelo sistema; ignora.
                    }
                }
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(context.packageName)
            if (Build.VERSION.SDK_INT >= 31) {
                params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            val newSessionId = installer.createSession(params)
            sessionId = newSessionId
            // Guarda a sessão ativa antes do commit: o UpdateStatusReceiver usa isso
            // pra ignorar status de uma sessão velha (posta pois UpdateState só pode
            // ser tocado na main thread e prepare() roda no executor de fundo).
            Handler(Looper.getMainLooper()).post { UpdateState.sessionStarted(newSessionId) }
            installer.openSession(newSessionId).use { session ->
                session.openWrite("base.apk", 0, apk.length()).use { out ->
                    apk.inputStream().use { it.copyTo(out) }
                    session.fsync(out)
                }
                val status = Intent(context, UpdateStatusReceiver::class.java)
                    .putExtra(UpdateStatusReceiver.EXTRA_VERSION, versionName)
                // O sistema preenche o status no Intent: no Android 12+ precisa ser mutável.
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                val pending = PendingIntent.getBroadcast(context, newSessionId, status, flags)
                session.commit(pending.intentSender)
            }
        } catch (e: Exception) {
            // Qualquer falha antes do commit (E/S, disco cheio, arquivo sumiu, sessão
            // recusada): descarta a sessão, senão os bytes já gravados ficam órfãos no
            // disco até o sistema recolher, e tentativas seguintes acumulam sessões.
            sessionId?.let { id ->
                try {
                    installer.abandonSession(id)
                } catch (abandonError: Exception) {
                    // Sessão pode já ter sido descartada pelo sistema; ignora.
                }
            }
            // Sem commit, o sistema nunca manda status pro UpdateStatusReceiver, então
            // ninguém avisaria a falha. prepare() roda numa thread de fundo, mas
            // UpdateState só pode ser tocado na main thread — posta o aviso lá.
            Handler(Looper.getMainLooper()).post { UpdateState.failed(aborted = false) }
        }
    }
}
