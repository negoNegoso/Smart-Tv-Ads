package com.smarttvads.signage

import java.io.File
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ArteCacheTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var server: TestHttpServer
    private lateinit var dir: File

    /** Nos testes, "arte" é qualquer coisa servida pelo servidor local. */
    private fun cache(
        limite: Long = 1_000_000,
        allowCleartext: Boolean = true,
        livre: () -> Long = { 10L * 1024 * 1024 * 1024 },
    ) = ArteCache(
        dir, limite, allowCleartext,
        ehArte = { it.startsWith("http://127.0.0.1:${server.port}/real/") },
        livre = livre,
    )

    private fun url(nome: String) = "http://127.0.0.1:${server.port}/real/$nome"

    @Before
    fun sobe() {
        server = TestHttpServer()
        dir = File(tmp.root, "artes")
    }

    @After
    fun desce() {
        server.close()
    }

    @Test
    fun `baixa a arte uma vez e serve do disco nas seguintes`() {
        val bytes = "jpeg de mentira".toByteArray()
        server.put("a.jpg", bytes)
        val c = cache()

        repeat(3) {
            val resp = c.resposta(url("a.jpg"))
            assertNotNull(resp)
            assertEquals("image/jpeg", resp!!.mimeType)
            assertArrayEquals(bytes, resp.data.readBytes())
        }
        assertEquals(listOf("/real/a.jpg"), server.pedidos.toList())
    }

    @Test
    fun `sobrevive a reinicio do app`() {
        server.put("a.png", "png".toByteArray())
        cache().resposta(url("a.png"))
        server.pedidos.clear()

        assertNotNull(cache().resposta(url("a.png")))
        assertTrue(server.pedidos.isEmpty())
    }

    @Test
    fun `url que nao e arte nao passa pelo cache`() {
        server.put("a.jpg", "x".toByteArray())
        val c = ArteCache(dir, 1_000_000, allowCleartext = true, ehArte = { false })
        assertNull(c.resposta(url("a.jpg")))
        assertTrue(server.pedidos.isEmpty())
    }

    @Test
    fun `arte que falha devolve null e nao grava nada`() {
        // null = a WebView busca sozinha e o onerror do tv.html segue valendo.
        assertNull(cache().resposta(url("sumiu.jpg")))
        assertTrue(dir.list().isNullOrEmpty())
    }

    @Test
    fun `passou do limite apaga a arte usada ha mais tempo`() {
        server.put("a.jpg", ByteArray(10))
        server.put("b.jpg", ByteArray(10))
        server.put("c.jpg", ByteArray(10))
        val c = cache(limite = 25)

        c.resposta(url("a.jpg"))
        c.resposta(url("b.jpg"))
        // Usa a "a" de novo: a mais antiga em uso passa a ser a "b".
        envelhece()
        c.resposta(url("a.jpg"))
        c.resposta(url("c.jpg"))
        server.pedidos.clear()

        c.resposta(url("a.jpg"))
        c.resposta(url("c.jpg"))
        assertTrue(server.pedidos.isEmpty())
        c.resposta(url("b.jpg"))
        assertEquals(listOf("/real/b.jpg"), server.pedidos.toList())
    }

    @Test
    fun `recusa http fora de debug sem nem tentar`() {
        server.put("a.jpg", "x".toByteArray())
        assertNull(cache(allowCleartext = false).resposta(url("a.jpg")))
        assertTrue(server.pedidos.isEmpty())
    }

    @Test
    fun `so artes do blob com extensao de imagem e sem query entram por padrao`() {
        val base = "https://abc123.public.blob.vercel-storage.com/announcements/"
        assertTrue(ArteCache.ehArteDoBlob(base + "1a58.jpeg"))
        assertTrue(ArteCache.ehArteDoBlob(base + "1a58.PNG"))
        // Retentativa do tv.html fura o cache de propósito: deixa ir para a rede.
        assertFalse(ArteCache.ehArteDoBlob(base + "1a58.jpg?r=123"))
        assertFalse(ArteCache.ehArteDoBlob("http://abc123.public.blob.vercel-storage.com/announcements/1a58.jpg"))
        assertFalse(ArteCache.ehArteDoBlob("https://smart-tv-ads.vercel.app/api/uploads/1a58.jpg"))
        assertFalse(ArteCache.ehArteDoBlob("https://evil.com/x.blob.vercel-storage.com/1a58.jpg"))
        assertFalse(ArteCache.ehArteDoBlob(base + "video.mp4"))
    }

    @Test
    fun `qr da origem da tv entra, outro caminho da origem nao`() {
        val tv = "https://smart-tv-ads.vercel.app/tv"
        assertTrue(ArteCache.ehQrDaTv("https://smart-tv-ads.vercel.app/api/qr/abc_12-X.png", tv))
        assertFalse(ArteCache.ehQrDaTv("https://smart-tv-ads.vercel.app/api/qr/pair/abc.png", tv))
        assertFalse(ArteCache.ehQrDaTv("https://smart-tv-ads.vercel.app/api/uploads/a.png", tv))
        assertFalse(ArteCache.ehQrDaTv("https://outro.app/api/qr/abc.png", tv))
        assertFalse(ArteCache.ehQrDaTv("https://smart-tv-ads.vercel.app/api/qr/abc.png?r=1", tv))
        assertTrue(ArteCache.ehArteAceita("https://smart-tv-ads.vercel.app/api/qr/abc.png", tv))
        assertTrue(ArteCache.ehArteAceita("https://ab12.public.blob.vercel-storage.com/announcements/x.png", tv))
    }

    @Test
    fun `nao baixa se sobrariam menos de 500 MB livres`() {
        server.put("a.png", ByteArray(10))
        val c = cache(livre = { ArteCache.RESERVA_BYTES + 5 })
        assertNull(c.resposta(url("a.png")))
        assertFalse(c.baixarAntes(url("a.png")))
        assertTrue(dir.listFiles().orEmpty().none { it.isFile && !it.name.endsWith(".part") })
    }

    @Test
    fun `disco apertado libera o que saiu da lista antes de desistir`() {
        // Disco realista: o livre cai conforme o cache cresce.
        val base = ArteCache.RESERVA_BYTES + 130
        server.put("a.png", ByteArray(60))
        server.put("b.png", ByteArray(60))
        server.put("c.png", ByteArray(60))
        val c = cache(limite = 1_000_000, livre = { base - tamanhoDoCache() })
        assertTrue(c.baixarAntes(url("a.png")))
        Thread.sleep(10)
        assertTrue(c.baixarAntes(url("b.png")))
        // Sobram 10 bytes acima da reserva: "c" só cabe se "a" (fora da lista) sair.
        c.manterLista(listOf(url("b.png"), url("c.png")))
        assertTrue(c.baixarAntes(url("c.png")))
        server.pedidos.clear()
        c.resposta(url("b.png"))
        assertTrue("b ficou", server.pedidos.isEmpty())
        assertEquals(2, dir.listFiles().orEmpty().count { it.isFile && !it.name.endsWith(".part") })
    }

    @Test
    fun `disco apertado e tudo na lista atual, nao baixa`() {
        val base = ArteCache.RESERVA_BYTES + 70
        server.put("a.png", ByteArray(60))
        server.put("b.png", ByteArray(60))
        val c = cache(limite = 1_000_000, livre = { base - tamanhoDoCache() })
        c.manterLista(listOf(url("a.png"), url("b.png")))
        assertTrue(c.baixarAntes(url("a.png")))
        assertFalse(c.baixarAntes(url("b.png")))
        server.pedidos.clear()
        c.resposta(url("a.png"))
        assertTrue("a ficou", server.pedidos.isEmpty())
    }

    private val LIVRE = 10L * 1024 * 1024 * 1024

    private fun tamanhoDoCache(): Long =
        dir.listFiles().orEmpty().filter { it.isFile && !it.name.endsWith(".part") }.sumOf { it.length() }

    @Test
    fun `limpeza tira primeiro o que saiu da lista atual`() {
        server.put("a.png", ByteArray(40))
        server.put("b.png", ByteArray(40))
        server.put("c.png", ByteArray(40))
        val c = cache(limite = 100)
        c.baixarAntes(url("a.png"))
        Thread.sleep(10)
        c.baixarAntes(url("b.png"))
        // "a" é a mais antiga, mas está na lista; "b" saiu.
        c.manterLista(listOf(url("a.png"), url("c.png")))
        Thread.sleep(10)
        c.baixarAntes(url("c.png"))
        server.pedidos.clear()
        assertNotNull(c.resposta(url("a.png")))
        assertTrue("a ficou no disco", server.pedidos.isEmpty())
        c.resposta(url("b.png"))
        assertEquals("b saiu e foi baixada de novo", listOf("/real/b.png"), server.pedidos.toList())
    }

    @Test
    fun `baixarAntes nao repete download do que ja tem`() {
        server.put("a.png", ByteArray(5))
        val c = cache()
        assertTrue(c.baixarAntes(url("a.png")))
        assertTrue(c.baixarAntes(url("a.png")))
        assertEquals(listOf("/real/a.png"), server.pedidos.toList())
    }

    @Test
    fun `estado soma o cache e le o disco`() {
        // Livre acima da reserva, senão nada seria baixado.
        server.put("a.png", ByteArray(30))
        server.put("b.png", ByteArray(20))
        val c = ArteCache(dir, 1_000_000, true, { it.startsWith("http://127.0.0.1:${server.port}/real/") }, { LIVRE }, { 20_000_000_000L })
        c.baixarAntes(url("a.png"))
        c.baixarAntes(url("b.png"))
        assertEquals(ArteCache.Estado(livre = LIVRE, total = 20_000_000_000L, cache = 50L, arquivos = 2), c.estado())
    }

    /** lastModified tem resolução de segundo em alguns sistemas de arquivo. */
    private fun envelhece() {
        dir.listFiles()!!.forEach { it.setLastModified(it.lastModified() - 10_000) }
    }
}
