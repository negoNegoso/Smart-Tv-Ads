package com.smarttvads.signage

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import android.widget.FrameLayout
import java.io.File
import java.lang.ref.WeakReference
import java.util.Calendar
import java.util.concurrent.Executors

/**
 * Casca da TV: tela cheia nativa com a WebView em `/tv`. Quem decide entre a
 * tela de vínculo (QR) e o painel é o tv.html; aqui só cuidamos de manter a
 * página no ar — sem rede no boot, renderer morto, vazamento de memória.
 */
class MainActivity : Activity(), TvWebViewClient.Listener, UpdateState.Listener {

    private val handler = Handler(Looper.getMainLooper())
    private val guard = ConnectivityGuard()
    private lateinit var container: FrameLayout
    private lateinit var offlineOverlay: View
    private lateinit var webViewMissing: View
    private lateinit var updateBanner: android.widget.TextView
    private lateinit var updateController: UpdateController

    internal var webView: WebView? = null
        private set

    /** Usado ao recriar a WebView depois de onRendererGone(). */
    private var resumed = false

    /** Quantas vezes `/tv` foi pedido. Existe para os testes medirem o retry. */
    internal var loadAttempts = 0
        private set

    private val retry = Runnable { loadTv() }
    private val dailyReload = Runnable {
        loadTv()
        scheduleDailyReload()
    }

    // Não refaz a sessão enquanto já há uma atualização esperando o OK.
    private val updateCheck = object : Runnable {
        override fun run() {
            if (UpdateState.pendingConfirmation == null) updateController.check()
            handler.postDelayed(this, UPDATE_INTERVAL_MS)
        }
    }
    private val hideUpdateBanner = Runnable { updateBanner.visibility = View.GONE }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Android 9+ não junta a tarefa do launcher com a da tela inicial
        // (HOME): sem isso ficam duas instâncias vivas, cada uma repetindo a
        // telemetria de exibição. A escondida some da tela mas o WebView
        // continua rodando (onPause não para os timers de JS).
        live?.get()?.let { outra -> if (outra !== this) outra.finish() }
        live = WeakReference(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)
        container = findViewById(R.id.web_container)
        offlineOverlay = findViewById(R.id.offline_overlay)
        webViewMissing = findViewById(R.id.webview_missing)
        updateBanner = findViewById(R.id.update_banner)
        updateController = updateControllerFactory(this)
        UpdateState.listener = this
        UpdateState.pendingVersion?.let { onUpdateReady(it) }
        handler.postDelayed(updateCheck, UPDATE_FIRST_CHECK_MS)
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
        resumed = true
        webView?.onResume()
    }

    override fun onPause() {
        resumed = false
        webView?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        if (live?.get() === this) live = null
        if (UpdateState.listener === this) UpdateState.listener = null
        handler.removeCallbacksAndMessages(null)
        destroyWebView()
        super.onDestroy()
    }

    /**
     * Saída do técnico: segurar Voltar por 5 s e soltar abre as Configurações
     * da TV, de onde se chega ao menu nativo e à troca da tela inicial. Mede
     * do aperto ao soltar porque nem todo controle IR repete a tecla segurada.
     * Interceptado aqui, antes da WebView, que tem o foco.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (isOkKey(event.keyCode) && UpdateState.pendingConfirmation != null) {
            if (event.action == KeyEvent.ACTION_UP) openUpdateConfirmation()
            return true
        }
        if (event.keyCode != KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(event)
        if (event.action == KeyEvent.ACTION_UP &&
            event.eventTime - event.downTime >= BACK_HOLD_TO_SETTINGS_MS
        ) {
            openSystemSettings()
        }
        return true
    }

    private fun openSystemSettings() {
        try {
            startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            // Box sem tela de Configurações: segue no painel.
        }
    }

    private fun isOkKey(keyCode: Int) = keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
        keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER

    private fun openUpdateConfirmation() {
        val confirmation = UpdateState.pendingConfirmation ?: return
        // A sessão só vale uma vez: se a pessoa cancelar, chega ABORTED e a
        // checagem refaz a sessão com o APK já baixado.
        UpdateState.clear()
        updateBanner.visibility = View.GONE
        try {
            startActivity(confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            onUpdateFailed(aborted = false)
        }
    }

    override fun onUpdateReady(versionName: String) {
        handler.removeCallbacks(hideUpdateBanner)
        updateBanner.text = getString(R.string.update_ready, versionName)
        updateBanner.visibility = View.VISIBLE
    }

    override fun onUpdateFailed(aborted: Boolean) {
        handler.removeCallbacks(hideUpdateBanner)
        if (aborted) {
            updateBanner.visibility = View.GONE
            updateController.check()
            return
        }
        updateBanner.text = getString(R.string.update_failed)
        updateBanner.visibility = View.VISIBLE
        handler.postDelayed(hideUpdateBanner, UPDATE_FAILED_VISIBLE_MS)
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
            if (createWebView()) {
                loadTv()
                // Se a Activity estava em segundo plano, a WebView nova
                // nasce sem pausar sozinha; sem isso o JS do tv.html
                // continua rodando escondido até o próximo onResume().
                if (!resumed) webView?.onPause()
            }
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
        /** Quanto tempo segurar Voltar para abrir as Configurações da TV. */
        const val BACK_HOLD_TO_SETTINGS_MS = 5_000L

        const val UPDATE_FIRST_CHECK_MS = 120_000L
        const val UPDATE_INTERVAL_MS = 21_600_000L
        const val UPDATE_FAILED_VISIBLE_MS = 10_000L

        internal val defaultUpdateControllerFactory: (MainActivity) -> UpdateController = { a ->
            UpdateController(
                installedVersionCode = BuildConfig.VERSION_CODE,
                downloader = UpdateDownloader(BuildConfig.UPDATE_BASE_URL, File(a.cacheDir, "updates")),
                installer = UpdateInstaller(a.applicationContext),
                executor = Executors.newSingleThreadExecutor(),
            )
        }

        /** Os testes trocam para não ir à rede. */
        internal var updateControllerFactory: (MainActivity) -> UpdateController = defaultUpdateControllerFactory

        /** Os testes trocam para simular aparelho sem WebView. */
        internal var webViewFactory: (Context) -> WebView = { WebView(it) }

        private var live: WeakReference<MainActivity>? = null

        /** Existe uma instância viva da tela da TV (usado pelo BootReceiver). */
        internal val hasLiveInstance: Boolean
            get() = live?.get() != null
    }
}
