package com.smarttvads.signage

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import android.widget.FrameLayout
import java.util.Calendar

/**
 * Casca da TV: tela cheia nativa com a WebView em `/tv`. Quem decide entre a
 * tela de vínculo (QR) e o painel é o tv.html; aqui só cuidamos de manter a
 * página no ar — sem rede no boot, renderer morto, vazamento de memória.
 */
class MainActivity : Activity(), TvWebViewClient.Listener {

    private val handler = Handler(Looper.getMainLooper())
    private val guard = ConnectivityGuard()
    private lateinit var container: FrameLayout
    private lateinit var offlineOverlay: View
    private lateinit var webViewMissing: View

    internal var webView: WebView? = null
        private set

    /** Quantas vezes `/tv` foi pedido. Existe para os testes medirem o retry. */
    internal var loadAttempts = 0
        private set

    private val retry = Runnable { loadTv() }
    private val dailyReload = Runnable {
        loadTv()
        scheduleDailyReload()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)
        container = findViewById(R.id.web_container)
        offlineOverlay = findViewById(R.id.offline_overlay)
        webViewMissing = findViewById(R.id.webview_missing)
        hideSystemBars()

        if (createWebView()) {
            loadTv()
            scheduleDailyReload()
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Diálogo do sistema ou toast podem trazer as barras de volta.
        if (hasFocus) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
    }

    override fun onPause() {
        webView?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        destroyWebView()
        super.onDestroy()
    }

    // Voltar não sai do painel nem navega o histórico da WebView.
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean =
        if (keyCode == KeyEvent.KEYCODE_BACK) true else super.onKeyDown(keyCode, event)

    @Deprecated("Voltar não sai do painel")
    override fun onBackPressed() {
        // Intencionalmente vazio.
    }

    override fun onMainFrameFailed() {
        offlineOverlay.visibility = View.VISIBLE
        handler.removeCallbacks(retry)
        handler.postDelayed(retry, guard.nextDelayMs())
    }

    override fun onPageLoaded() {
        offlineOverlay.visibility = View.GONE
        guard.reset()
    }

    override fun onRendererGone() {
        // Fora do callback da WebView que está morrendo.
        handler.post {
            destroyWebView()
            if (createWebView()) loadTv()
        }
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }

    /** Sem WebView no sistema, mostra o aviso em vez de derrubar o app. */
    private fun createWebView(): Boolean {
        val view = try {
            webViewFactory(this)
        } catch (e: Throwable) {
            webViewMissing.visibility = View.VISIBLE
            return false
        }
        TvWebViewConfig.apply(view)
        view.webViewClient = TvWebViewClient(this)
        container.addView(
            view,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        view.requestFocus()
        webView = view
        return true
    }

    private fun destroyWebView() {
        webView?.let {
            container.removeView(it)
            it.destroy()
        }
        webView = null
    }

    private fun loadTv() {
        handler.removeCallbacks(retry)
        loadAttempts++
        webView?.loadUrl(BuildConfig.TV_URL)
    }

    private fun scheduleDailyReload() {
        handler.removeCallbacks(dailyReload)
        handler.postDelayed(dailyReload, WatchdogReload.delayUntilNextReloadMs(Calendar.getInstance()))
    }

    companion object {
        /** Os testes trocam para simular aparelho sem WebView. */
        internal var webViewFactory: (Context) -> WebView = { WebView(it) }
    }
}
