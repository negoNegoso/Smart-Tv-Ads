package com.smarttvads.signage

import android.graphics.Bitmap
import android.os.Build
import android.webkit.RenderProcessGoneDetail
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

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        failed = false
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

    internal fun onLoadResult(isMainFrame: Boolean, httpStatus: Int?) {
        if (failed || !ConnectivityGuard.isOfflineError(isMainFrame, httpStatus)) return
        failed = true
        listener.onMainFrameFailed()
    }
}
