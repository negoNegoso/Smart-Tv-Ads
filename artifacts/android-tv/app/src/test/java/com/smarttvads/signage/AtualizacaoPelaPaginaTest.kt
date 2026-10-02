package com.smarttvads.signage

import android.os.Handler
import android.os.Looper
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/**
 * O tv.html chama `window.SignageUpdate.check()` quando o feed avisa de uma
 * versão nova. A chamada chega numa thread da WebView; o pedido só pode ser
 * entregue na principal, onde vivem o UpdateState e os timers da Activity.
 */
@RunWith(RobolectricTestRunner::class)
class AtualizacaoPelaPaginaTest {
    private var pedidos = 0
    private val handler = Handler(Looper.getMainLooper())
    private val ponte = AtualizacaoPelaPagina(handler) { pedidos++ }

    private fun rodarPrincipal() = shadowOf(Looper.getMainLooper()).idle()

    @Test
    fun `nome que o tv html procura em window`() {
        assertEquals("SignageUpdate", AtualizacaoPelaPagina.NOME_NA_PAGINA)
    }

    @Test
    fun `check entrega o pedido na thread principal, nao na da chamada`() {
        ponte.check()
        // O looper do Robolectric só roda quando mandado: ainda não entregou.
        assertEquals(0, pedidos)
        rodarPrincipal()
        assertEquals(1, pedidos)
    }

    @Test
    fun `cada chamada vira um pedido`() {
        ponte.check()
        ponte.check()
        rodarPrincipal()
        assertEquals(2, pedidos)
    }

    @Test
    fun `pedido pendente some quando a Activity limpa o handler`() {
        ponte.check()
        handler.removeCallbacksAndMessages(null)
        rodarPrincipal()
        assertEquals(0, pedidos)
    }
}
