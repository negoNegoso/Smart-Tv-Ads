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
import java.util.concurrent.ExecutorService
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
    private lateinit var exitButton: android.widget.Button
    private lateinit var ajustarButton: android.widget.Button
    private lateinit var ajusteOverlay: View
    private lateinit var ajusteInfo: android.widget.TextView
    private lateinit var ajusteFechar: View

    /** Saiu para o menu da TV. Existe para os testes conferirem a saída. */
    internal var movedToBack = false
        private set
    private lateinit var updateController: UpdateController
    private lateinit var musica: MusicaDeFundo
    internal lateinit var atualizacaoPelaPagina: AtualizacaoPelaPagina
    // Um cache só para a WebView (servir) e para a ponte (baixar antes).
    private lateinit var artes: ArteCache
    private lateinit var cachePelaPagina: CachePelaPagina

    /**
     * Executor da checagem de atualização, um por instância. Sem shutdown no
     * onDestroy ele vazava: com LAUNCHER + HOME (duas instâncias) sobrava
     * thread viva a cada troca.
     */
    internal val updateExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    internal var webView: WebView? = null
        private set

    /** Usado ao recriar a WebView depois de onRendererGone(). */
    private var resumed = false

    /** Quantas vezes `/tv` foi pedido. Existe para os testes medirem o retry. */
    internal var loadAttempts = 0
        private set

    // Aviso da página pode chegar depois do onDestroy (thread da WebView):
    // sem isto, entraria no handler já limpo e checaria numa Activity morta.
    private var destruida = false

    // Depois de uma falha de instalação (disco cheio, assinatura diferente) o
    // sinal do feed continua, e a página repete o aviso a cada 10 min: sem
    // este freio a box refaria download e sessão nesse ritmo, em vez de a cada
    // 6 h. Só a checagem periódica volta a liberar os avisos da página.
    private var avisoDaPaginaSuspenso = false

    private val retry = Runnable { loadTv() }
    private val dailyReload = Runnable {
        loadTv()
        scheduleDailyReload()
    }

    // Não refaz a sessão enquanto já há uma atualização esperando o OK nem
    // enquanto uma sessão já comitada está em andamento (ex.: a pessoa apertou
    // OK e o diálogo do sistema está na tela; pendingConfirmation já foi
    // limpo, mas o status final ainda não chegou) — senão a checagem chamaria
    // prepare() de novo e a varredura de sessões velhas mataria a que está
    // sendo confirmada.
    private val updateCheck = object : Runnable {
        override fun run() {
            avisoDaPaginaSuspenso = false
            checarAtualizacao()
            handler.postDelayed(this, UPDATE_INTERVAL_MS)
        }
    }

    /** Um caminho só para a checagem periódica e para o aviso da página. */
    private fun checarAtualizacao() {
        if (destruida) return
        if (UpdateState.canCheck()) updateController.check()
    }
    private val hideUpdateBanner = Runnable { updateBanner.visibility = View.GONE }
    private val hideExitButton = Runnable {
        hideMenu()
        // Sem o menu, o foco volta para a página.
        webView?.requestFocus()
    }
    private val fecharAjuste = Runnable { closeAjuste() }

    /**
     * Freio do retry após cancelamento (I-4): sem isso, um ABORTED vindo do
     * sistema (sessão abandonada, pouco espaço) vira laço quente de checagem +
     * sessão nova a cada volta. Só a primeira ABORTED de uma sequência refaz a
     * checagem na hora; as seguintes esperam a checagem periódica normal
     * (os avisos da página ficam suspensos até ela, ver avisoDaPaginaSuspenso).
     * Reseta quando uma atualização fica pronta de novo (a checagem funcionou).
     */
    private var retryImediatoUsado = false

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
        exitButton = findViewById(R.id.exit_fullscreen)
        exitButton.setOnClickListener { exitFullscreen() }
        ajustarButton = findViewById(R.id.ajustar_imagem)
        ajustarButton.setOnClickListener { openAjuste() }
        ajusteOverlay = findViewById(R.id.ajuste_overlay)
        ajusteInfo = findViewById(R.id.ajuste_info)
        ajusteFechar = findViewById(R.id.ajuste_fechar)
        ajusteFechar.setOnClickListener { closeAjuste() }
        findViewById<View>(R.id.ajuste_configuracoes).setOnClickListener { openDisplaySettings() }
        updateController = updateControllerFactory(this)
        musica = MusicaDeFundo(this)
        // filesDir, não cacheDir: o sistema esvazia o cacheDir quando falta
        // espaço, e cache que some é a TV baixando as artes de novo. O
        // ArteCache tem limite e reserva de disco próprios.
        artes = ArteCache(File(filesDir, "artes"))
        cachePelaPagina = CachePelaPagina(artes)
        atualizacaoPelaPagina = AtualizacaoPelaPagina(handler) {
            if (!avisoDaPaginaSuspenso) checarAtualizacao()
        }
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
        // Voltou das configurações de tela: a resolução pode ter mudado.
        if (ajusteOverlay.visibility == View.VISIBLE) {
            showDiagnostico()
            adiarFechamentoDoAjuste()
        }
    }

    override fun onPause() {
        resumed = false
        webView?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        destruida = true
        if (live?.get() === this) live = null
        if (UpdateState.listener === this) UpdateState.listener = null
        handler.removeCallbacksAndMessages(null)
        musica.cancelar()
        updateExecutor.shutdown()
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
        // Tela de ajuste aberta: as teclas são dos botões dela e Voltar fecha.
        if (ajusteOverlay.visibility == View.VISIBLE) {
            adiarFechamentoDoAjuste()
            if (event.keyCode != KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(event)
            if (event.action == KeyEvent.ACTION_UP) closeAjuste()
            return true
        }
        val menuVisivel = exitButton.visibility == View.VISIBLE
        // Com o menu na tela, o OK é do botão em foco; a atualização espera o
        // menu sumir para voltar a responder ao OK.
        if (isOkKey(event.keyCode) && menuVisivel) {
            if (event.action == KeyEvent.ACTION_UP) {
                if (ajustarButton.isFocused) openAjuste() else exitFullscreen()
            }
            return true
        }
        // Esquerda/direita alternam entre os dois botões. Feito aqui porque a
        // busca de foco do sistema poderia levar o foco para a WebView.
        if (menuVisivel && isSideKey(event.keyCode)) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                (if (ajustarButton.isFocused) exitButton else ajustarButton).requestFocus()
            } else {
                showExitButton()
            }
            return true
        }
        if (isOkKey(event.keyCode) && UpdateState.pendingConfirmation != null) {
            if (event.action == KeyEvent.ACTION_UP) openUpdateConfirmation()
            return true
        }
        // Qualquer outra tecla do controle traz o menu de volta.
        if (event.action == KeyEvent.ACTION_UP && event.keyCode != KeyEvent.KEYCODE_BACK) {
            showExitButton()
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

    private fun isSideKey(keyCode: Int) = keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
        keyCode == KeyEvent.KEYCODE_DPAD_RIGHT

    private fun showExitButton() {
        handler.removeCallbacks(hideExitButton)
        exitButton.visibility = View.VISIBLE
        ajustarButton.visibility = View.VISIBLE
        // Não tira o foco de "Ajustar imagem" se a pessoa já foi até ele.
        if (!ajustarButton.isFocused) exitButton.requestFocus()
        handler.postDelayed(hideExitButton, EXIT_BUTTON_VISIBLE_MS)
    }

    private fun hideMenu() {
        handler.removeCallbacks(hideExitButton)
        exitButton.visibility = View.GONE
        ajustarButton.visibility = View.GONE
    }

    /**
     * Tela de ajuste de imagem, para o técnico acertar a resolução da box e o
     * formato de imagem da TV na instalação. Fecha sozinha: esquecida aberta,
     * ficaria cobrindo os anúncios.
     */
    private fun openAjuste() {
        hideMenu()
        showDiagnostico()
        ajusteOverlay.visibility = View.VISIBLE
        // Foco no Fechar: um OK a mais não joga a pessoa nas configurações.
        ajusteFechar.requestFocus()
        adiarFechamentoDoAjuste()
    }

    private fun closeAjuste() {
        handler.removeCallbacks(fecharAjuste)
        ajusteOverlay.visibility = View.GONE
        webView?.requestFocus()
    }

    private fun adiarFechamentoDoAjuste() {
        handler.removeCallbacks(fecharAjuste)
        handler.postDelayed(fecharAjuste, AJUSTE_VISIBLE_MS)
    }

    private fun showDiagnostico() {
        @Suppress("DEPRECATION")
        val d = TelaInfo.ler(windowManager.defaultDisplay)
        val conselho = when (d.situacao) {
            SituacaoDaTela.HA_MODO_MAIOR -> getString(R.string.ajuste_ha_modo_maior, d.melhor.rotulo)
            SituacaoDaTela.ABAIXO_DE_FULL_HD -> getString(R.string.ajuste_abaixo_de_full_hd)
            SituacaoDaTela.RESOLUCAO_OK -> getString(R.string.ajuste_resolucao_ok)
        }
        ajusteInfo.text = getString(R.string.ajuste_resolucao, d.atual.rotulo, conselho)
    }

    private fun openDisplaySettings() {
        try {
            startActivity(Intent(Settings.ACTION_DISPLAY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            // Box sem atalho para a tela de vídeo: cai nas Configurações gerais.
            openSystemSettings()
        }
    }

    /**
     * Devolve as barras do sistema e manda o painel para segundo plano, para
     * a pessoa chegar ao menu da TV. Numa box onde o Signage TV é a tela
     * inicial, o sistema traz o painel de volta na hora: ali o caminho é
     * segurar Voltar por 5 s (ver README).
     */
    private fun exitFullscreen() {
        hideMenu()
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
        movedToBack = moveTaskToBack(true)
    }

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
        retryImediatoUsado = false
        handler.removeCallbacks(hideUpdateBanner)
        updateBanner.text = getString(R.string.update_ready, versionName)
        updateBanner.visibility = View.VISIBLE
    }

    override fun onUpdateFailed(aborted: Boolean) {
        avisoDaPaginaSuspenso = true
        handler.removeCallbacks(hideUpdateBanner)
        if (aborted) {
            updateBanner.visibility = View.GONE
            if (!retryImediatoUsado) {
                retryImediatoUsado = true
                updateController.check()
            }
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
        view.webViewClient = TvWebViewClient(this, artes)
        // Antes do loadUrl: a ponte só existe em página carregada depois dela.
        view.addJavascriptInterface(musica, MusicaDeFundo.NOME_NA_PAGINA)
        view.addJavascriptInterface(atualizacaoPelaPagina, AtualizacaoPelaPagina.NOME_NA_PAGINA)
        view.addJavascriptInterface(cachePelaPagina, CachePelaPagina.NOME_NA_PAGINA)
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

        /** Quanto o botão de sair fica na tela sem ninguém usar. */
        const val EXIT_BUTTON_VISIBLE_MS = 8_000L

        /** Quanto a tela de ajuste fica aberta sem ninguém mexer no controle. */
        const val AJUSTE_VISIBLE_MS = 300_000L

        const val UPDATE_FIRST_CHECK_MS = 120_000L
        const val UPDATE_INTERVAL_MS = 21_600_000L
        const val UPDATE_FAILED_VISIBLE_MS = 10_000L

        internal val defaultUpdateControllerFactory: (MainActivity) -> UpdateController = { a ->
            UpdateController(
                installedVersionCode = BuildConfig.VERSION_CODE,
                downloader = UpdateDownloader(BuildConfig.UPDATE_BASE_URL, File(a.cacheDir, "updates")),
                installer = UpdateInstaller(a.applicationContext),
                executor = a.updateExecutor,
            )
        }

        /** Os testes trocam para não ir à rede. */
        internal var updateControllerFactory: (MainActivity) -> UpdateController = defaultUpdateControllerFactory

        /** Os testes trocam para simular aparelho sem WebView. */
        internal var webViewFactory: (Context) -> WebView = { WebView(it) }

        private var live: WeakReference<MainActivity>? = null

        /**
         * Existe uma instância viva da tela da TV. Usado pelo [BootReceiver]
         * (não relança se o painel já está na tela) e pelo [UpdatedReceiver]
         * (não tenta reabrir depois de atualizar se já há uma instância viva).
         */
        internal val hasLiveInstance: Boolean
            get() = live?.get() != null
    }
}
