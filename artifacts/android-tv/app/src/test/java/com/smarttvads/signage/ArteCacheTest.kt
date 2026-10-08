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
    private fun cache(limite: Long = 1_000_000, allowCleartext: Boolean = true) =
        ArteCache(dir, limite, allowCleartext) { it.startsWith("http://127.0.0.1:${server.port}/real/") }

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
        val c = ArteCache(dir, 1_000_000, allowCleartext = true) { false }
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

    /** lastModified tem resolução de segundo em alguns sistemas de arquivo. */
    private fun envelhece() {
        dir.listFiles()!!.forEach { it.setLastModified(it.lastModified() - 10_000) }
    }
}
