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
     *
     * Também lido por UpdateInstaller.prepare() na thread de fundo do executor
     * (pra nunca abandonar a sessão ativa, e pra MainActivity não checar de
     * novo enquanto ela está em andamento): @Volatile garante que a escrita
     * feita aqui (sempre na main thread) seja visível lá sem sincronização
     * extra.
     */
    @Volatile
    var activeSessionId: Int? = null
        private set
    var listener: Listener? = null

    fun sessionStarted(sessionId: Int) {
        activeSessionId = sessionId
    }

    /**
     * Sessão chegou a um estado terminal (sucesso ou falha): libera o id
     * ativo. Diferente de clear(), que só esconde a confirmação — chamado
     * também quando a pessoa aperta OK e a sessão ainda está em andamento no
     * diálogo do sistema, esperando o status final chegar.
     */
    private fun sessionEnded() {
        activeSessionId = null
    }

    fun ready(versionName: String, confirmation: Intent) {
        pendingVersion = versionName
        pendingConfirmation = confirmation
        listener?.onUpdateReady(versionName)
    }

    fun installed() {
        clear()
        sessionEnded()
    }

    fun failed(aborted: Boolean) {
        clear()
        sessionEnded()
        listener?.onUpdateFailed(aborted)
    }

    fun clear() {
        pendingConfirmation = null
        pendingVersion = null
    }
}
