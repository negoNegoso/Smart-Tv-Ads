package com.smarttvads.signage

import java.io.File
import java.security.MessageDigest
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Servidor HTTP local imita o GitHub: /rel/<arquivo> redireciona (302) para
 * /real/<arquivo>, como `releases/latest/download/` faz.
 */
@RunWith(RobolectricTestRunner::class)
class UpdateDownloaderTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var server: TestHttpServer
    private lateinit var dir: File
    private lateinit var downloader: UpdateDownloader

    private val apkBytes = "conteudo do apk".toByteArray()
    private val apkSha = MessageDigest.getInstance("SHA-256").digest(apkBytes)
        .joinToString("") { "%02x".format(it) }

    private fun manifesto(sha: String = apkSha) =
        """{"versionName":"1.2.0","versionCode":1002000,"apk":"signage-tv-1.2.0.apk","sha256":"$sha"}"""

    @Before
    fun sobe() {
        server = TestHttpServer()
        dir = File(tmp.root, "updates")
        downloader = UpdateDownloader(server.baseUrl, dir)
    }

    @After
    fun desce() {
        server.close()
    }

    @Test
    fun `le o manifesto seguindo o redirecionamento`() {
        server.put("update.json", manifesto().toByteArray())
        assertEquals(1002000, downloader.fetchManifest()?.versionCode)
    }

    @Test
    fun `manifesto ausente ou invalido da null`() {
        assertNull(downloader.fetchManifest())
        server.put("update.json", "{ quebrado".toByteArray())
        assertNull(downloader.fetchManifest())
    }

    @Test
    fun `baixa o apk conferido sem deixar parcial`() {
        server.put("signage-tv-1.2.0.apk", apkBytes)
        val apk = downloader.downloadApk(UpdateManifest.parse(manifesto())!!)
        assertNotNull(apk)
        assertArrayEquals(apkBytes, apk!!.readBytes())
        assertEquals(listOf("signage-tv-1.2.0.apk"), dir.list()!!.toList())
    }

    @Test
    fun `hash diferente apaga e da null`() {
        server.put("signage-tv-1.2.0.apk", apkBytes)
        val apk = downloader.downloadApk(UpdateManifest.parse(manifesto(sha = "b".repeat(64)))!!)
        assertNull(apk)
        assertTrue(dir.list().isNullOrEmpty())
    }

    @Test
    fun `reaproveita apk ja conferido sem baixar de novo`() {
        server.put("signage-tv-1.2.0.apk", apkBytes)
        val m = UpdateManifest.parse(manifesto())!!
        downloader.downloadApk(m)
        server.pedidos.clear()
        assertNotNull(downloader.downloadApk(m))
        assertTrue(server.pedidos.isEmpty())
    }

    @Test
    fun `apk inexistente no servidor da null`() {
        assertNull(downloader.downloadApk(UpdateManifest.parse(manifesto())!!))
        assertTrue(dir.list().isNullOrEmpty())
    }

    @Test
    fun `recusa http fora de debug sem nem tentar`() {
        // usesCleartextTraffic=false só vale de API 23 em diante e o minSdk é
        // 21: sem essa recusa no código, um build de release aceitaria
        // qualquer esquema.
        server.put("update.json", manifesto().toByteArray())
        val semCleartext = UpdateDownloader(server.baseUrl, dir, allowCleartext = false)
        assertNull(semCleartext.fetchManifest())
        assertTrue(server.pedidos.isEmpty())
    }
}
