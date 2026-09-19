package com.smarttvads.signage

import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import java.time.Duration
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class MainActivityTest {

    @After
    fun restauraFabrica() {
        MainActivity.webViewFactory = { WebView(it) }
    }

    private fun abrir(): MainActivity =
        Robolectric.buildActivity(MainActivity::class.java).setup().get()

    private fun passar(ms: Long) {
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms))
    }

    private fun MainActivity.overlay(): View = findViewById(R.id.offline_overlay)

    @Test
    fun `abre a tela da TV`() {
        val a = abrir()
        assertEquals(BuildConfig.TV_URL, shadowOf(a.webView!!).lastLoadedUrl)
    }

    @Test
    fun `tela sempre ligada e sem barras do sistema`() {
        val a = abrir()
        assertTrue(a.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0)
        @Suppress("DEPRECATION")
        val ui = a.window.decorView.systemUiVisibility
        @Suppress("DEPRECATION")
        assertTrue(ui and View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY != 0)
        @Suppress("DEPRECATION")
        assertTrue(ui and View.SYSTEM_UI_FLAG_HIDE_NAVIGATION != 0)
    }

    @Test
    fun `voltar nao sai do painel`() {
        val a = abrir()
        val consumiu = a.onKeyDown(KeyEvent.KEYCODE_BACK, KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK))
        assertTrue(consumiu)
        assertFalse(a.isFinishing)
    }

    @Test
    fun `falha na carga cobre a tela e tenta de novo com backoff`() {
        val a = abrir()
        a.onMainFrameFailed()
        assertEquals(View.VISIBLE, a.overlay().visibility)

        val antes = a.loadAttempts
        passar(4_999)
        assertEquals(antes, a.loadAttempts)
        passar(1)
        assertEquals(antes + 1, a.loadAttempts)

        a.onMainFrameFailed()
        passar(9_999)
        assertEquals(antes + 1, a.loadAttempts)
        passar(1)
        assertEquals(antes + 2, a.loadAttempts)
    }

    @Test
    fun `carga ok tira o aviso e reinicia o backoff`() {
        val a = abrir()
        a.onMainFrameFailed()
        passar(5_000)
        a.onPageLoaded()
        assertEquals(View.GONE, a.overlay().visibility)

        val antes = a.loadAttempts
        a.onMainFrameFailed()
        passar(5_000)
        assertEquals(antes + 1, a.loadAttempts)
    }

    @Test
    fun `renderer morto recria a WebView e recarrega`() {
        val a = abrir()
        val velha = a.webView
        a.onRendererGone()
        passar(0)
        assertNotNull(a.webView)
        assertNotSame(velha, a.webView)
        assertEquals(BuildConfig.TV_URL, shadowOf(a.webView!!).lastLoadedUrl)
    }

    @Test
    fun `segunda instancia da tela da TV fecha a primeira`() {
        // Android 9+ mantém tarefas separadas para o launcher e para a tela
        // inicial (HOME); sem isso as duas ficam vivas e cada uma repete a
        // telemetria de exibição.
        val primeira = abrir()
        assertFalse(primeira.isFinishing)

        val segunda = abrir()
        assertTrue(primeira.isFinishing)
        assertFalse(segunda.isFinishing)
    }

    @Test
    fun `sem WebView no sistema mostra aviso em vez de fechar`() {
        MainActivity.webViewFactory = { throw RuntimeException("MissingWebViewPackageException") }
        val a = abrir()
        assertEquals(View.VISIBLE, a.findViewById<View>(R.id.webview_missing).visibility)
        assertNull(a.webView)
        assertFalse(a.isFinishing)
    }
}
