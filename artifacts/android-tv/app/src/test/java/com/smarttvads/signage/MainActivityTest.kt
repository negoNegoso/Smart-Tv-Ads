package com.smarttvads.signage

import android.app.Application
import android.content.Context
import android.media.AudioManager
import android.os.Looper
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
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

    private fun MainActivity.segurarVoltar(ms: Long) {
        val inicio = 1_000L
        dispatchKeyEvent(KeyEvent(inicio, inicio, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK, 0))
        dispatchKeyEvent(KeyEvent(inicio, inicio + ms, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK, 0))
    }

    @Test
    fun `segurar voltar por 5 s abre as configuracoes da TV`() {
        val a = abrir()
        a.segurarVoltar(5_000)
        val aberta = shadowOf(a).nextStartedActivity
        assertEquals(Settings.ACTION_SETTINGS, aberta?.action)
        assertFalse(a.isFinishing)
    }

    @Test
    fun `voltar curto nao abre as configuracoes`() {
        val a = abrir()
        a.segurarVoltar(4_999)
        assertNull(shadowOf(a).nextStartedActivity)
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

    private fun audio() = shadowOf(
        ApplicationProvider.getApplicationContext<Application>()
            .getSystemService(Context.AUDIO_SERVICE) as AudioManager,
    )

    /** O que o tv.html enxerga como `window.SignageNative`. */
    private fun MainActivity.ponte() =
        shadowOf(webView!!).getJavascriptInterface("SignageNative") as MusicaDeFundo

    /** Peça com som do começo ao fim, com música tocando antes dela. */
    private fun MainActivity.pecaComSomSobreMusica() {
        audio().setIsMusicActive(true)
        ponte().somIniciou()
        passar(0)
        audio().setIsMusicActive(false)
        ponte().somTerminou()
    }

    private fun playsMandados() = audio().dispatchedMediaKeyEvents.map { it.keyCode }

    @Test
    fun `tv html retoma a musica de fundo pela ponte SignageNative`() {
        val a = abrir()
        a.pecaComSomSobreMusica()
        passar(1_000)
        assertEquals(listOf(KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PLAY), playsMandados())
    }

    @Test
    fun `WebView recriada continua com a ponte da musica de fundo`() {
        val a = abrir()
        a.onRendererGone()
        passar(0)
        a.pecaComSomSobreMusica()
        passar(1_000)
        assertEquals(listOf(KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PLAY), playsMandados())
    }

    @Test
    fun `painel fechado nao manda play depois`() {
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        controller.get().pecaComSomSobreMusica()
        controller.pause().stop().destroy()
        passar(60_000)
        assertEquals(emptyList<Int>(), playsMandados())
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
    fun `renderer morto durante pausa recria a WebView ja pausada`() {
        // Se a WebView nova ficar sem onPause() com a Activity em segundo
        // plano, o JS do tv.html continua rodando escondido (mesmo problema
        // de telemetria em dobro do achado I-1).
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        val a = controller.get()
        controller.pause()
        a.onRendererGone()
        passar(0)
        assertNotNull(a.webView)
        assertTrue(shadowOf(a.webView!!).wasOnPauseCalled())
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
