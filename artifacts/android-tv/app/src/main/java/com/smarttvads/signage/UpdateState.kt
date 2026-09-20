package com.smarttvads.signage

import android.content.Intent

/**
 * Atualização pronta para confirmar, compartilhada entre o receiver do
 * instalador (que recebe o Intent do sistema) e a Activity (que só o abre
 * quando alguém aperta OK). Usado só na main thread.
 */
object UpdateState {
    interface Listener {
        fun onUpdateReady(versionName: String)

        /** aborted = a pessoa cancelou o diálogo; a sessão morreu e pode ser refeita. */
        fun onUpdateFailed(aborted: Boolean)
    }

    var pendingConfirmation: Intent? = null
        private set
    var pendingVersion: String? = null
        private set

    /**
     * Sessão do PackageInstaller que este processo criou por último. O
     * UpdateStatusReceiver usa isso para ignorar status de uma sessão antiga:
     * sem isso, o ABORTED de uma sessão abandonada pelo sistema (ex.: depois de
     * um reinício de processo, que perde pendingConfirmation e faz a checagem
     * criar uma sessão nova) apaga a confirmação válida da sessão atual.
     */
    var activeSessionId: Int? = null
        private set
    var listener: Listener? = null

    fun sessionStarted(sessionId: Int) {
        activeSessionId = sessionId
    }

    fun ready(versionName: String, confirmation: Intent) {
        pendingVersion = versionName
        pendingConfirmation = confirmation
        listener?.onUpdateReady(versionName)
    }

    fun failed(aborted: Boolean) {
        clear()
        listener?.onUpdateFailed(aborted)
    }

    fun clear() {
        pendingConfirmation = null
        pendingVersion = null
    }
}
