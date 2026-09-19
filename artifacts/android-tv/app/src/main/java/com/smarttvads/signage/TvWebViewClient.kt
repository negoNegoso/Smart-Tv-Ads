package com.smarttvads.signage

import android.graphics.Bitmap
import android.net.http.SslError
import android.os.Build
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Traduz os callbacks da WebView em três eventos que a Activity entende.
 * A navegação fica dentro da WebView (comportamento padrão de WebViewClient).
 */
class TvWebViewClient(private val listener: Listener) : WebViewClient() {

    interface Listener {
        /** A página principal (`/tv`) não carregou: rede ou HTTP >= 400. */
        fun onMainFrameFailed()

        /** A página principal terminou de carregar sem falha. */
        fun onPageLoaded()

        /** O processo de renderização morreu; a WebView não serve mais. */
        fun onRendererGone()
    }

    private var failed = false

    /** URL da página principal que está carregando agora (para o erro de SSL). */
    private var loadingUrl: String? = null

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        failed = false
        loadingUrl = url
    }

    override fun onPageFinished(view: WebView, url: String?) {
        if (!failed) listener.onPageLoaded()
    }

    // API 23+.
    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        onLoadResult(request.isForMainFrame, httpStatus = null)
    }

    // API 21–22: só é chamado para a página principal.
    @Deprecated("Substituído pela versão com WebResourceRequest a partir da API 23")
    override fun onReceivedError(view: WebView, errorCode: Int, description: String?, failingUrl: String?) {
        if (Build.VERSION.SDK_INT < 23) onLoadResult(isMainFrame = true, httpStatus = null)
    }

    override fun onReceivedHttpError(
        view: WebView,
        request: WebResourceRequest,
        errorResponse: WebResourceResponse,
    ) {
        onLoadResult(request.isForMainFrame, errorResponse.statusCode)
    }

    // API 26+. Devolver true evita que o app inteiro caia junto.
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        listener.onRendererGone()
        return true
    }

    // TV box sem RTC sobe com a data errada e a validação do certificado
    // falha até o NTP sincronizar. Nunca confia num certificado inválido —
    // handler.cancel() sempre, nunca handler.proceed().
    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.cancel()
        onSslErrorUrl(error.url)
    }

    internal fun onLoadResult(isMainFrame: Boolean, httpStatus: Int?) {
        if (failed || !ConnectivityGuard.isOfflineError(isMainFrame, httpStatus)) return
        failed = true
        listener.onMainFrameFailed()
    }

    /** Só entra no retry se o erro de SSL for da página principal sendo carregada. */
    internal fun onSslErrorUrl(errorUrl: String?) {
        if (errorUrl != null && errorUrl == loadingUrl) onLoadResult(isMainFrame = true, httpStatus = null)
    }
}
