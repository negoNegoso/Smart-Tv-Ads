package com.smarttvads.signage

import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import java.io.File
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TvWebViewClientTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private class Eventos : TvWebViewClient.Listener {
        var falhas = 0
        var cargas = 0
        var rendererMorto = 0
        override fun onMainFrameFailed() { falhas++ }
        override fun onPageLoaded() { cargas++ }
        override fun onRendererGone() { rendererMorto++ }
    }

    private fun pedido(
        principal: Boolean,
        url: String = "https://smart-tv-ads.vercel.app/tv",
        metodo: String = "GET",
    ) = object : WebResourceRequest {
        override fun getUrl(): Uri = Uri.parse(url)
        override fun isForMainFrame() = principal
        override fun isRedirect() = false
        override fun hasGesture() = false
        override fun getMethod() = metodo
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

    @Test
    fun `arte de sub-recurso sai do cache em disco`() {
        TestHttpServer().use { server ->
            val base = "http://127.0.0.1:${server.port}/real/"
            server.put("a.jpg", "arte".toByteArray())
            val artes = ArteCache(tmp.root, allowCleartext = true, ehArte = { it.startsWith(base) })
            val comCache = TvWebViewClient(eventos, artes)

            repeat(2) {
                val resp = comCache.shouldInterceptRequest(webView, pedido(principal = false, url = base + "a.jpg"))
                assertArrayEquals("arte".toByteArray(), resp!!.data.readBytes())
            }
            assertEquals(listOf("/real/a.jpg"), server.pedidos.toList())
        }
    }

    @Test
    fun `pagina principal e metodo diferente de GET nao passam pelo cache`() {
        TestHttpServer().use { server ->
            val base = "http://127.0.0.1:${server.port}/real/"
            server.put("a.jpg", "arte".toByteArray())
            val comCache = TvWebViewClient(eventos, ArteCache(tmp.root, allowCleartext = true, ehArte = { true }))

            assertNull(comCache.shouldInterceptRequest(webView, pedido(principal = true, url = base + "a.jpg")))
            assertNull(
                comCache.shouldInterceptRequest(webView, pedido(principal = false, url = base + "a.jpg", metodo = "POST")),
            )
            assertEquals(emptyList<String>(), server.pedidos.toList())
        }
    }

    @Test
    fun `pagina principal GET sai da PaginaCache`() {
        TestHttpServer().use { server ->
            val url = "http://127.0.0.1:${server.port}/real/tv"
            server.put("tv", "<html>ok</html>".toByteArray())
            val pagina = PaginaCache(File(tmp.root, "pagina/tv.html"), url, allowCleartext = true)
            val comPagina = TvWebViewClient(eventos, pagina = pagina)

            val resp = comPagina.shouldInterceptRequest(webView, pedido(principal = true, url = url))
            assertEquals("<html>ok</html>", resp!!.data.readBytes().decodeToString())
        }
    }

    @Test
    fun `pagina principal sem PaginaCache deixa a WebView buscar`() {
        assertNull(client.shouldInterceptRequest(webView, pedido(principal = true)))
    }

    @Test
    fun `sub-recurso continua indo para as artes mesmo com PaginaCache`() {
        TestHttpServer().use { server ->
            val base = "http://127.0.0.1:${server.port}/real/"
            server.put("a.jpg", "arte".toByteArray())
            val artes = ArteCache(tmp.root, allowCleartext = true, ehArte = { it.startsWith(base) })
            val pagina = PaginaCache(File(tmp.root, "pagina/tv.html"), base + "tv", allowCleartext = true)
            val comAmbos = TvWebViewClient(eventos, artes, pagina)

            val resp = comAmbos.shouldInterceptRequest(webView, pedido(principal = false, url = base + "a.jpg"))
            assertArrayEquals("arte".toByteArray(), resp!!.data.readBytes())
        }
    }

    @Test
    fun `POST na pagina principal nao passa pela PaginaCache`() {
        TestHttpServer().use { server ->
            val url = "http://127.0.0.1:${server.port}/real/tv"
            server.put("tv", "x".toByteArray())
            val pagina = PaginaCache(File(tmp.root, "pagina/tv.html"), url, allowCleartext = true)
            val comPagina = TvWebViewClient(eventos, pagina = pagina)

            assertNull(comPagina.shouldInterceptRequest(webView, pedido(principal = true, url = url, metodo = "POST")))
            assertEquals(emptyList<String>(), server.pedidos.toList())
        }
    }

    @Test
    fun `sem cache configurado deixa a WebView buscar`() {
        assertNull(client.shouldInterceptRequest(webView, pedido(principal = false)))
    }
}
