package com.smarttvads.signage

import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Sem isto, TV que liga sem internet fica na tela de "sem conexão": a
 * tv.html vem da Vercel. Com isto, o app entrega a última cópia boa e a
 * página toca a lista salva.
 */
@RunWith(RobolectricTestRunner::class)
class PaginaCacheTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var server: TestHttpServer
    private lateinit var arquivo: File
    private val tvUrl get() = "http://127.0.0.1:${server.port}/real/tv"

    private fun pagina() = PaginaCache(arquivo, tvUrl, allowCleartext = true)

    // A tv.html de verdade tem a chave do localStorage "signage-offline"; o
    // cache só guarda página que tenha essa marca.
    private val V1 = "<html><script>var OFFLINE_KEY = 'signage-offline';</script>v1</html>"

    @Before
    fun sobe() {
        server = TestHttpServer()
        arquivo = File(tmp.root, "pagina/tv.html")
    }

    @After
    fun desce() { server.close() }

    @Test
    fun `com rede entrega a pagina nova e grava a copia`() {
        server.put("tv", V1.toByteArray())
        val resp = pagina().resposta(tvUrl)
        assertNotNull(resp)
        assertEquals("text/html", resp!!.mimeType)
        assertEquals("utf-8", resp.encoding.lowercase())
        assertEquals(V1, resp.data.readBytes().decodeToString())
        assertEquals(V1, arquivo.readText())
    }

    @Test
    fun `sem rede entrega a copia gravada`() {
        server.put("tv", V1.toByteArray())
        pagina().resposta(tvUrl)
        server.close()
        val resp = pagina().resposta(tvUrl)
        assertEquals(V1, resp!!.data.readBytes().decodeToString())
    }

    @Test
    fun `erro HTTP da Vercel entrega a copia`() {
        // Cópia já gravada; a URL não existe no servidor de teste, que responde 404.
        arquivo.parentFile!!.mkdirs()
        arquivo.writeText(V1)
        val urlQueDa404 = "http://127.0.0.1:${server.port}/real/sumiu"
        val resp = PaginaCache(arquivo, urlQueDa404, allowCleartext = true).resposta(urlQueDa404)
        assertEquals(V1, resp!!.data.readBytes().decodeToString())
    }

    @Test
    fun `sem rede e sem copia devolve null (fluxo de sem conexao de hoje)`() {
        server.close()
        assertNull(pagina().resposta(tvUrl))
    }

    @Test
    fun `outra url nao passa por aqui`() {
        server.put("tv", "x".toByteArray())
        assertNull(pagina().resposta("http://127.0.0.1:${server.port}/real/outra"))
    }

    @Test
    fun `captive portal com 200 e entregue mas nao substitui a copia boa`() {
        server.put("tv", V1.toByteArray())
        pagina().resposta(tvUrl)
        val portal = "<html>Faça login no Wi-Fi da loja</html>"
        server.put("tv", portal.toByteArray())
        val resp = pagina().resposta(tvUrl)
        // A WebView recebe o que veio (pode ser a tela de login do Wi-Fi)...
        assertEquals(portal, resp!!.data.readBytes().decodeToString())
        // ...mas a próxima vez sem rede ainda abre a tv.html boa.
        assertEquals(V1, arquivo.readText())
    }

    @Test
    fun `pagina vazia nao substitui a copia boa`() {
        server.put("tv", V1.toByteArray())
        pagina().resposta(tvUrl)
        server.put("tv", ByteArray(0))
        pagina().resposta(tvUrl)
        assertEquals(V1, arquivo.readText())
    }
}
