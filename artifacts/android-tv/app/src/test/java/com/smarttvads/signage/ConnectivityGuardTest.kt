package com.smarttvads.signage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectivityGuardTest {

    @Test
    fun `espera dobra a cada falha ate o teto de 60 s`() {
        val guard = ConnectivityGuard()
        val esperas = List(7) { guard.nextDelayMs() }
        assertEquals(listOf(5_000L, 10_000L, 20_000L, 40_000L, 60_000L, 60_000L, 60_000L), esperas)
    }

    @Test
    fun `reset volta a espera para 5 s`() {
        val guard = ConnectivityGuard()
        repeat(4) { guard.nextDelayMs() }
        guard.reset()
        assertEquals(5_000L, guard.nextDelayMs())
    }

    @Test
    fun `erro de rede na pagina principal cobre a tela`() {
        assertTrue(ConnectivityGuard.isOfflineError(isMainFrame = true, httpStatus = null))
    }

    @Test
    fun `HTTP 400 ou mais na pagina principal cobre a tela`() {
        assertTrue(ConnectivityGuard.isOfflineError(isMainFrame = true, httpStatus = 404))
        assertTrue(ConnectivityGuard.isOfflineError(isMainFrame = true, httpStatus = 503))
    }

    @Test
    fun `HTTP abaixo de 400 na pagina principal nao cobre a tela`() {
        assertFalse(ConnectivityGuard.isOfflineError(isMainFrame = true, httpStatus = 304))
    }

    @Test
    fun `falha de sub-recurso nunca cobre a tela`() {
        // Imagem, iframe do YouTube ou /api/display/<key>/slides (404 = TV sem
        // vínculo): quem trata é o tv.html.
        assertFalse(ConnectivityGuard.isOfflineError(isMainFrame = false, httpStatus = null))
        assertFalse(ConnectivityGuard.isOfflineError(isMainFrame = false, httpStatus = 404))
        assertFalse(ConnectivityGuard.isOfflineError(isMainFrame = false, httpStatus = 500))
    }
}
