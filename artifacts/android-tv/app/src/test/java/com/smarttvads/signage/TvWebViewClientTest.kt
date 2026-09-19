package com.smarttvads.signage

import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TvWebViewClientTest {
    private class Eventos : TvWebViewClient.Listener {
        var falhas = 0
        var cargas = 0
        var rendererMorto = 0
        override fun onMainFrameFailed() { falhas++ }
        override fun onPageLoaded() { cargas++ }
        override fun onRendererGone() { rendererMorto++ }
    }

    private fun pedido(principal: Boolean) = object : WebResourceRequest {
        override fun getUrl(): Uri = Uri.parse("https://smart-tv-ads.vercel.app/tv")
        override fun isForMainFrame() = principal
        override fun isRedirect() = false
        override fun hasGesture() = false
        override fun getMethod() = "GET"
        override fun getRequestHeaders(): Map<String, String> = emptyMap()
    }

    private fun resposta(status: Int) =
        WebResourceResponse("text/html", "utf-8", status, "Erro", emptyMap(), null)

    private lateinit var eventos: Eventos
    private lateinit var client: TvWebViewClient
    private lateinit var webView: WebView

    @Before
    fun prepara() {
        eventos = Eventos()
        client = TvWebViewClient(eventos)
        webView = WebView(ApplicationProvider.getApplicationContext())
    }

    @Test
    fun `carga ok avisa pagina carregada`() {
        client.onPageStarted(webView, "https://x/tv", null)
        client.onPageFinished(webView, "https://x/tv")
        assertEquals(1, eventos.cargas)
        assertEquals(0, eventos.falhas)
    }

    @Test
    fun `HTTP 503 na pagina principal avisa falha uma vez por carga`() {
        client.onPageStarted(webView, "https://x/tv", null)
        client.onReceivedHttpError(webView, pedido(principal = true), resposta(503))
        client.onReceivedHttpError(webView, pedido(principal = true), resposta(503))
        client.onPageFinished(webView, "https://x/tv")
        assertEquals(1, eventos.falhas)
        assertEquals(0, eventos.cargas)
    }

    @Test
    fun `erro de rede na pagina principal avisa falha`() {
        client.onPageStarted(webView, "https://x/tv", null)
        client.onLoadResult(isMainFrame = true, httpStatus = null)
        assertEquals(1, eventos.falhas)
    }

    @Test
    fun `404 de sub-recurso nao e falha`() {
        // Ex.: /api/display/<key>/slides de TV sem vínculo — o tv.html mostra o QR.
        client.onPageStarted(webView, "https://x/tv", null)
        client.onReceivedHttpError(webView, pedido(principal = false), resposta(404))
        client.onPageFinished(webView, "https://x/tv")
        assertEquals(0, eventos.falhas)
        assertEquals(1, eventos.cargas)
    }

    @Test
    fun `erro de SSL na pagina principal entra no retry`() {
        // TV box sem relógio (RTC): sobe com a data errada e a validação do
        // certificado falha até o NTP sincronizar. Precisa entrar no retry
        // para tentar de novo quando o relógio ajustar.
        client.onPageStarted(webView, "https://x/tv", null)
        client.onSslErrorUrl("https://x/tv")
        assertEquals(1, eventos.falhas)
    }

    @Test
    fun `erro de SSL em sub-recurso nao entra no retry`() {
        client.onPageStarted(webView, "https://x/tv", null)
        client.onSslErrorUrl("https://x/outro-recurso")
        assertEquals(0, eventos.falhas)
    }

    @Test
    fun `nova carga depois de falha pode dar certo`() {
        client.onPageStarted(webView, "https://x/tv", null)
        client.onLoadResult(isMainFrame = true, httpStatus = null)
        client.onPageFinished(webView, "https://x/tv")
        client.onPageStarted(webView, "https://x/tv", null)
        client.onPageFinished(webView, "https://x/tv")
        assertEquals(1, eventos.falhas)
        assertEquals(1, eventos.cargas)
    }
}
