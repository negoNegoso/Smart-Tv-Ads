package com.smarttvads.signage

import android.os.Looper
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.widget.Button
import android.widget.TextView
import java.io.File
import java.time.Duration
import java.util.concurrent.Executor
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController

/**
 * Tela de ajuste de imagem: abre pelo botão que aparece junto do de sair,
 * mostra a resolução e o padrão de teste, leva às configurações de tela e
 * fecha sozinha para não ficar cobrindo os anúncios.
 */
@RunWith(RobolectricTestRunner::class)
class MainActivityAjusteTest {
    private val controllers = mutableListOf<ActivityController<MainActivity>>()

    private val semVersaoNova = object : UpdateController.Downloader {
        override fun fetchManifest(): UpdateManifest? = null
        override fun downloadApk(manifest: UpdateManifest): File? = null
    }

    private fun abrir(): MainActivity {
        MainActivity.updateControllerFactory = {
            UpdateController(1, semVersaoNova, UpdateController.Installer { _, _ -> }, Executor { it.run() })
        }
        val c = Robolectric.buildActivity(MainActivity::class.java).setup()
        controllers += c
        return c.get()
    }

    @After
    fun limpa() {
        controllers.forEach { it.pause().stop().destroy() }
        UpdateState.installed()
        UpdateState.listener = null
        MainActivity.updateControllerFactory = MainActivity.defaultUpdateControllerFactory
    }

    private fun passar(ms: Long) = shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms))

    private fun MainActivity.sair(): Button = findViewById(R.id.exit_fullscreen)
    private fun MainActivity.ajustar(): Button = findViewById(R.id.ajustar_imagem)
    private fun MainActivity.ajuste(): View = findViewById(R.id.ajuste_overlay)

    private fun MainActivity.tecla(keyCode: Int) {
        dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
        dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
    }

    /** Mexe no controle, vai para "Ajustar imagem" e aperta OK. */
    private fun MainActivity.abrirAjuste() {
        tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        tecla(KeyEvent.KEYCODE_DPAD_RIGHT)
        tecla(KeyEvent.KEYCODE_DPAD_CENTER)
    }

    @Test
    fun `painel comeca sem o botao de ajustar e sem a tela de ajuste`() {
        val a = abrir()
        assertEquals(View.GONE, a.ajustar().visibility)
        assertEquals(View.GONE, a.ajuste().visibility)
    }

    @Test
    fun `tecla do controle mostra o botao de ajustar ao lado do de sair`() {
        val a = abrir()
        a.tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        assertEquals(View.VISIBLE, a.ajustar().visibility)
        // O foco inicial continua no de sair, como antes.
        assertTrue(a.sair().isFocused)
    }

    @Test
    fun `direita passa o foco para ajustar e esquerda devolve`() {
        val a = abrir()
        a.tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        a.tecla(KeyEvent.KEYCODE_DPAD_RIGHT)
        assertTrue(a.ajustar().isFocused)
        a.tecla(KeyEvent.KEYCODE_DPAD_LEFT)
        assertTrue(a.sair().isFocused)
    }

    @Test
    fun `os dois botoes somem juntos depois de 8 s`() {
        val a = abrir()
        a.tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        passar(MainActivity.EXIT_BUTTON_VISIBLE_MS)
        assertEquals(View.GONE, a.sair().visibility)
        assertEquals(View.GONE, a.ajustar().visibility)
    }

    @Test
    fun `ok com ajustar em foco abre a tela de ajuste sem sair do app`() {
        val a = abrir()
        a.abrirAjuste()
        assertEquals(View.VISIBLE, a.ajuste().visibility)
        assertFalse(a.movedToBack)
        assertEquals(View.GONE, a.sair().visibility)
        assertEquals(View.GONE, a.ajustar().visibility)
        assertTrue(a.findViewById<View>(R.id.ajuste_fechar).isFocused)
    }

    @Test
    fun `tela de ajuste mostra a resolucao em que o android desenha`() {
        val a = abrir()
        a.abrirAjuste()
        @Suppress("DEPRECATION")
        val atual = TelaInfo.ler(a.windowManager.defaultDisplay).atual
        val texto = a.findViewById<TextView>(R.id.ajuste_info).text.toString()
        assertTrue(texto, texto.contains(atual.rotulo))
    }

    @Test
    fun `botao de configuracoes abre as configuracoes de tela`() {
        val a = abrir()
        a.abrirAjuste()
        a.findViewById<View>(R.id.ajuste_configuracoes).performClick()
        assertEquals(Settings.ACTION_DISPLAY_SETTINGS, shadowOf(a).nextStartedActivity?.action)
    }

    @Test
    fun `fechar esconde a tela de ajuste`() {
        val a = abrir()
        a.abrirAjuste()
        a.findViewById<View>(R.id.ajuste_fechar).performClick()
        assertEquals(View.GONE, a.ajuste().visibility)
    }

    @Test
    fun `voltar fecha a tela de ajuste`() {
        val a = abrir()
        a.abrirAjuste()
        a.tecla(KeyEvent.KEYCODE_BACK)
        assertEquals(View.GONE, a.ajuste().visibility)
    }

    @Test
    fun `com a tela de ajuste aberta as teclas nao trazem o botao de sair`() {
        val a = abrir()
        a.abrirAjuste()
        a.tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        assertEquals(View.GONE, a.sair().visibility)
        assertEquals(View.VISIBLE, a.ajuste().visibility)
    }

    @Test
    fun `tela de ajuste fecha sozinha se ninguem mexer`() {
        val a = abrir()
        a.abrirAjuste()
        passar(MainActivity.AJUSTE_VISIBLE_MS - 100)
        assertEquals(View.VISIBLE, a.ajuste().visibility)
        passar(100)
        assertEquals(View.GONE, a.ajuste().visibility)
    }

    @Test
    fun `mexer no controle adia o fechamento da tela de ajuste`() {
        val a = abrir()
        a.abrirAjuste()
        passar(MainActivity.AJUSTE_VISIBLE_MS - 100)
        a.tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        passar(200)
        assertEquals(View.VISIBLE, a.ajuste().visibility)
    }
}
