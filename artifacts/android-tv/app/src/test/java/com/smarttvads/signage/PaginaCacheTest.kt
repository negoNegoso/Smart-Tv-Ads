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

    @Before
    fun sobe() {
        server = TestHttpServer()
        arquivo = File(tmp.root, "pagina/tv.html")
    }

    @After
    fun desce() { server.close() }

    @Test
    fun `com rede entrega a pagina nova e grava a copia`() {
        server.put("tv", "<html>v1</html>".toByteArray())
        val resp = pagina().resposta(tvUrl)
        assertNotNull(resp)
        assertEquals("text/html", resp!!.mimeType)
        assertEquals("utf-8", resp.encoding.lowercase())
        assertEquals("<html>v1</html>", resp.data.readBytes().decodeToString())
        assertEquals("<html>v1</html>", arquivo.readText())
    }

    @Test
    fun `sem rede entrega a copia gravada`() {
        server.put("tv", "<html>v1</html>".toByteArray())
        pagina().resposta(tvUrl)
        server.close()
        val resp = pagina().resposta(tvUrl)
        assertEquals("<html>v1</html>", resp!!.data.readBytes().decodeToString())
    }

    @Test
    fun `erro HTTP da Vercel entrega a copia`() {
        // Cópia já gravada; a URL não existe no servidor de teste, que responde 404.
        arquivo.parentFile!!.mkdirs()
        arquivo.writeText("<html>v1</html>")
        val urlQueDa404 = "http://127.0.0.1:${server.port}/real/sumiu"
        val resp = PaginaCache(arquivo, urlQueDa404, allowCleartext = true).resposta(urlQueDa404)
        assertEquals("<html>v1</html>", resp!!.data.readBytes().decodeToString())
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
    fun `pagina vazia nao substitui a copia boa`() {
        server.put("tv", "<html>v1</html>".toByteArray())
        pagina().resposta(tvUrl)
        server.put("tv", ByteArray(0))
        pagina().resposta(tvUrl)
        assertEquals("<html>v1</html>", arquivo.readText())
    }
}
