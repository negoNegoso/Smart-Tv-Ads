package com.smarttvads.signage

import android.content.Intent
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.widget.TextView
import java.io.File
import java.time.Duration
import java.util.concurrent.Executor
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController

@RunWith(RobolectricTestRunner::class)
class MainActivityUpdateTest {
    private var checagens = 0
    private val controllers = mutableListOf<ActivityController<MainActivity>>()

    private val semVersaoNova = object : UpdateController.Downloader {
        override fun fetchManifest(): UpdateManifest? {
            checagens++
            return null
        }
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
        UpdateState.installed() // reseta pendingConfirmation/pendingVersion e activeSessionId
        UpdateState.listener = null
        MainActivity.updateControllerFactory = MainActivity.defaultUpdateControllerFactory
    }

    private fun passar(ms: Long) = shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms))

    private fun MainActivity.aviso(): TextView = findViewById(R.id.update_banner)

    private fun MainActivity.apertarOk(): Boolean {
        val down = dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER))
        val up = dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_CENTER))
        return down && up
    }

    @Test
    fun `checa 2 min depois de abrir e depois a cada 6 h`() {
        abrir()
        // Margem de 100 ms: o setup() do Robolectric consome alguns ms do
        // relógio simulado depois que o onCreate agenda a checagem.
        passar(MainActivity.UPDATE_FIRST_CHECK_MS - 100)
        assertEquals(0, checagens)
        passar(100)
        assertEquals(1, checagens)
        passar(MainActivity.UPDATE_INTERVAL_MS)
        assertEquals(2, checagens)
    }

    @Test
    fun `atualizacao pronta mostra o aviso com a versao`() {
        val a = abrir()
        UpdateState.ready("1.2.0", Intent("confirmar"))
        assertEquals(View.VISIBLE, a.aviso().visibility)
        assertTrue(a.aviso().text.contains("1.2.0"))
    }

    @Test
    fun `aviso aparece ao abrir se ja havia atualizacao pronta`() {
        UpdateState.ready("1.2.0", Intent("confirmar"))
        val a = abrir()
        assertEquals(View.VISIBLE, a.aviso().visibility)
    }

    @Test
    fun `ok com atualizacao pronta abre a confirmacao e some o aviso`() {
        val a = abrir()
        UpdateState.ready("1.2.0", Intent("confirmar"))
        assertTrue(a.apertarOk())
        assertEquals("confirmar", shadowOf(a).nextStartedActivity?.action)
        assertNull(UpdateState.pendingConfirmation)
        assertEquals(View.GONE, a.aviso().visibility)
    }

    @Test
    fun `ok sem atualizacao pronta nao abre nada`() {
        val a = abrir()
        a.apertarOk()
        assertNull(shadowOf(a).nextStartedActivity)
    }

    @Test
    fun `cancelado no dialogo refaz a checagem na hora`() {
        val a = abrir()
        val antes = checagens
        a.onUpdateFailed(aborted = true)
        assertEquals(antes + 1, checagens)
        assertEquals(View.GONE, a.aviso().visibility)
    }

    @Test
    fun `dois ABORTED seguidos nao geram duas checagens imediatas`() {
        // Um ABORTED vindo do sistema (sessão abandonada, ex.: I-2) não pode
        // virar laço quente de checagem + sessão nova a cada volta.
        val a = abrir()
        val antes = checagens
        a.onUpdateFailed(aborted = true)
        a.onUpdateFailed(aborted = true)
        assertEquals(antes + 1, checagens)
    }

    @Test
    fun `falha mostra aviso por 10 s`() {
        val a = abrir()
        a.onUpdateFailed(aborted = false)
        assertEquals(View.VISIBLE, a.aviso().visibility)
        assertEquals(a.getString(R.string.update_failed), a.aviso().text.toString())
        passar(MainActivity.UPDATE_FAILED_VISIBLE_MS)
        assertEquals(View.GONE, a.aviso().visibility)
    }

    @Test
    fun `nao checa enquanto ha sessao ativa mesmo sem confirmacao pendente`() {
        // Regressão do I-3: a pessoa apertou OK, pendingConfirmation já foi
        // limpo, mas o diálogo do sistema segue na tela com a sessão em
        // curso. Uma checagem nesse meio-tempo chamaria prepare() de novo, e
        // a varredura de sessões velhas mataria a que está sendo confirmada.
        abrir()
        UpdateState.sessionStarted(1)
        passar(MainActivity.UPDATE_FIRST_CHECK_MS)
        assertEquals(0, checagens)

        // Status final chega (sucesso ou falha): activeSessionId volta a
        // null e a checagem periódica passa a rodar de novo.
        UpdateState.installed()
        passar(MainActivity.UPDATE_INTERVAL_MS)
        assertEquals(1, checagens)
    }

    @Test
    fun `aviso nao recebe foco`() {
        assertFalse(abrir().aviso().isFocusable)
    }

    @Test
    fun `executor da checagem de atualizacao e encerrado ao destruir a Activity`() {
        // newSingleThreadExecutor() por onCreate sem shutdown: com LAUNCHER +
        // HOME (duas instâncias) sobrava thread viva a cada troca.
        MainActivity.updateControllerFactory = MainActivity.defaultUpdateControllerFactory
        val c = Robolectric.buildActivity(MainActivity::class.java).setup()
        val a = c.get()
        val executor = a.updateExecutor
        c.pause().stop().destroy()
        assertTrue(executor.isShutdown)
    }
}
