package com.smarttvads.signage

/**
 * Decide se uma falha de carga deve cobrir a tela com o aviso de "sem conexão"
 * e quanto esperar antes de tentar de novo. Sem Android: testável na JVM pura.
 *
 * Só a página principal (`/tv`) conta. Falha de sub-recurso — arte, iframe do
 * YouTube, o 404 de `/api/display/<key>/slides` que leva à tela de QR — é
 * assunto do tv.html.
 */
class ConnectivityGuard {
    private var attempt = 0

    /** Espera antes da próxima tentativa: 5 s, 10 s, 20 s, 40 s e depois 60 s. */
    fun nextDelayMs(): Long {
        val delay = minOf(BASE_DELAY_MS shl attempt.coerceAtMost(4), MAX_DELAY_MS)
        attempt++
        return delay
    }

    /** Carga bem-sucedida: a próxima falha volta a esperar 5 s. */
    fun reset() {
        attempt = 0
    }

    companion object {
        const val BASE_DELAY_MS = 5_000L
        const val MAX_DELAY_MS = 60_000L

        /** `httpStatus == null` significa erro de rede (DNS, sem Wi-Fi, timeout). */
        fun isOfflineError(isMainFrame: Boolean, httpStatus: Int?): Boolean =
            isMainFrame && (httpStatus == null || httpStatus >= 400)
    }
}
