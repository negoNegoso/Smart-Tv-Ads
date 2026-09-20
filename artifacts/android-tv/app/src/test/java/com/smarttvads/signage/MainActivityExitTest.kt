package com.smarttvads.signage

import android.content.Intent
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.widget.Button
import java.io.File
import java.time.Duration
import java.util.concurrent.Executor
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController

/**
 * Botão de sair da tela cheia: aparece ao mexer no controle, some sozinho e,
 * quando está com o foco, o OK devolve a TV ao menu do sistema em vez de abrir
 * a confirmação de atualização.
 */
@RunWith(RobolectricTestRunner::class)
class MainActivityExitTest {
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

    private fun MainActivity.tecla(keyCode: Int) {
        dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
        dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
    }

    @Test
    fun `painel comeca sem o botao`() {
        assertEquals(View.GONE, abrir().sair().visibility)
    }

    @Test
    fun `tecla do controle mostra o botao com foco`() {
        val a = abrir()
        a.tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        assertEquals(View.VISIBLE, a.sair().visibility)
        assertTrue(a.sair().isFocused)
    }

    @Test
    fun `botao some sozinho depois de 8 s`() {
        val a = abrir()
        a.tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        passar(MainActivity.EXIT_BUTTON_VISIBLE_MS - 100)
        assertEquals(View.VISIBLE, a.sair().visibility)
        passar(100)
        assertEquals(View.GONE, a.sair().visibility)
    }

    @Test
    fun `ok com o botao em foco sai do app e mostra as barras`() {
        val a = abrir()
        a.tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        a.tecla(KeyEvent.KEYCODE_DPAD_CENTER)
        assertTrue(a.movedToBack)
        @Suppress("DEPRECATION")
        assertEquals(0, a.window.decorView.systemUiVisibility and View.SYSTEM_UI_FLAG_HIDE_NAVIGATION)
        assertEquals(View.GONE, a.sair().visibility)
    }

    @Test
    fun `com o botao em foco o ok nao abre a atualizacao`() {
        val a = abrir()
        UpdateState.ready("1.2.0", Intent("confirmar"))
        a.tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        a.tecla(KeyEvent.KEYCODE_DPAD_CENTER)
        assertNull(shadowOf(a).nextStartedActivity)
        assertNotNull(UpdateState.pendingConfirmation)
    }

    @Test
    fun `sem o botao visivel o ok continua abrindo a atualizacao`() {
        val a = abrir()
        UpdateState.ready("1.2.0", Intent("confirmar"))
        a.tecla(KeyEvent.KEYCODE_DPAD_CENTER)
        assertEquals("confirmar", shadowOf(a).nextStartedActivity?.action)
        assertFalse(a.movedToBack)
    }

    @Test
    fun `voltar segurado continua abrindo as configuracoes`() {
        val a = abrir()
        a.tecla(KeyEvent.KEYCODE_DPAD_DOWN)
        val inicio = 1_000L
        a.dispatchKeyEvent(KeyEvent(inicio, inicio, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK, 0))
        a.dispatchKeyEvent(
            KeyEvent(inicio, inicio + MainActivity.BACK_HOLD_TO_SETTINGS_MS, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK, 0),
        )
        assertEquals(android.provider.Settings.ACTION_SETTINGS, shadowOf(a).nextStartedActivity?.action)
    }
}
