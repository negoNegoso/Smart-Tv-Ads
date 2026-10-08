package com.smarttvads.signage

import java.io.File
import java.util.concurrent.Executor
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * O tv.html chama `window.SignageCache.baixar(json)` a cada feed com as artes
 * da lista sem internet, e `estado()` para mandar o espaço em disco ao
 * servidor. Executor manual: o teste decide quando a fila anda.
 */
@RunWith(RobolectricTestRunner::class)
class CachePelaPaginaTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var server: TestHttpServer
    private lateinit var cache: ArteCache
    private val tarefas = ArrayDeque<Runnable>()
    private val manual = Executor { tarefas.addLast(it) }

    private fun url(nome: String) = "http://127.0.0.1:${server.port}/real/$nome"
    private fun rodarFila() { while (tarefas.isNotEmpty()) tarefas.removeFirst().run() }

    @Before
    fun sobe() {
        server = TestHttpServer()
        cache = ArteCache(File(tmp.root, "artes"), 1_000_000, true, { it.startsWith("http://127.0.0.1:${server.port}/real/") }, { 10L shl 30 }, { 20L shl 30 })
    }

    @After
    fun desce() { server.close() }

    @Test
    fun `nome na pagina`() {
        assertEquals("SignageCache", CachePelaPagina.NOME_NA_PAGINA)
    }

    @Test
    fun `baixa a lista em segundo plano e pula o que nao e arte`() {
        server.put("a.png", ByteArray(3))
        server.put("b.png", ByteArray(3))
        val ponte = CachePelaPagina(cache, manual)
        ponte.baixar("""["${url("a.png")}","https://evil.example/x.png","${url("b.png")}"]""")
        assertTrue(server.pedidos.isEmpty())
        rodarFila()
        assertEquals(listOf("/real/a.png", "/real/b.png"), server.pedidos.toList())
    }

    @Test
    fun `lista nova troca a fila pendente`() {
        server.put("a.png", ByteArray(3))
        server.put("b.png", ByteArray(3))
        server.put("c.png", ByteArray(3))
        val ponte = CachePelaPagina(cache, manual)
        ponte.baixar("""["${url("a.png")}","${url("b.png")}"]""")
        ponte.baixar("""["${url("c.png")}"]""")
        rodarFila()
        assertEquals(listOf("/real/c.png"), server.pedidos.toList())
    }

    @Test
    fun `encerrar cancela o que estava na fila`() {
        server.put("a.png", ByteArray(3))
        val ponte = CachePelaPagina(cache, manual)
        ponte.baixar("""["${url("a.png")}"]""")
        ponte.encerrar()
        rodarFila()
        assertTrue(server.pedidos.isEmpty())
    }

    @Test
    fun `encerrar desliga o executor`() {
        val real = java.util.concurrent.Executors.newSingleThreadExecutor()
        CachePelaPagina(cache, real).encerrar()
        assertTrue(real.isShutdown)
    }

    @Test
    fun `json invalido e ignorado`() {
        val ponte = CachePelaPagina(cache, manual)
        ponte.baixar("lixo")
        rodarFila()
        assertTrue(server.pedidos.isEmpty())
    }

    @Test
    fun `estado no formato que o tv html le`() {
        server.put("a.png", ByteArray(7))
        cache.baixarAntes(url("a.png"))
        val e = JSONObject(CachePelaPagina(cache, manual).estado())
        assertEquals(10L shl 30, e.getLong("livre"))
        assertEquals(20L shl 30, e.getLong("total"))
        assertEquals(7L, e.getLong("cache"))
        assertEquals(1, e.getInt("arquivos"))
    }
}
