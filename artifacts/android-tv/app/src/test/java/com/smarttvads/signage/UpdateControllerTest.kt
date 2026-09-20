package com.smarttvads.signage

import java.io.File
import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadows.ShadowLog

@RunWith(RobolectricTestRunner::class)
class UpdateControllerTest {
    private val instalada = 1_000_001
    private val nova = UpdateManifest("1.2.0", 1_002_000, "signage-tv-1.2.0.apk", "a".repeat(64))
    private val apk = File("signage-tv-1.2.0.apk")

    private class FakeDownloader(
        var manifest: UpdateManifest?,
        var apk: File?,
        var erro: RuntimeException? = null,
    ) : UpdateController.Downloader {
        var manifestos = 0
        var downloads = 0
        override fun fetchManifest(): UpdateManifest? {
            manifestos++
            erro?.let { throw it }
            return manifest
        }
        override fun downloadApk(manifest: UpdateManifest): File? {
            downloads++
            return apk
        }
    }

    private val preparados = mutableListOf<Pair<File, String>>()
    private val installer = UpdateController.Installer { f, v -> preparados += f to v }
    private val imediato = Executor { it.run() }

    @Test
    fun `versao nova baixa e prepara a instalacao`() {
        val d = FakeDownloader(nova, apk)
        UpdateController(instalada, d, installer, imediato).check()
        assertEquals(listOf(apk to "1.2.0"), preparados)
    }

    @Test
    fun `mesma versao nem baixa`() {
        val d = FakeDownloader(nova.copy(versionCode = instalada), apk)
        UpdateController(instalada, d, installer, imediato).check()
        assertEquals(0, d.downloads)
        assertEquals(emptyList<Pair<File, String>>(), preparados)
    }

    @Test
    fun `sem manifesto nao faz nada`() {
        val d = FakeDownloader(null, apk)
        UpdateController(instalada, d, installer, imediato).check()
        assertEquals(0, d.downloads)
    }

    @Test
    fun `download falhou nao prepara`() {
        val d = FakeDownloader(nova, null)
        UpdateController(instalada, d, installer, imediato).check()
        assertEquals(emptyList<Pair<File, String>>(), preparados)
    }

    @Test
    fun `erro inesperado nao derruba e a proxima checagem roda`() {
        val d = FakeDownloader(nova, apk, erro = IllegalStateException("boom"))
        val c = UpdateController(instalada, d, installer, imediato)
        c.check()
        d.erro = null
        c.check()
        assertEquals(2, d.manifestos)
        assertEquals(listOf(apk to "1.2.0"), preparados)
    }

    @Test
    fun `so uma checagem por vez`() {
        val fila = mutableListOf<Runnable>()
        val d = FakeDownloader(nova, apk)
        val c = UpdateController(instalada, d, installer, Executor { fila += it })
        c.check()
        c.check()
        assertEquals(1, fila.size)
        fila.single().run()
        c.check()
        assertEquals(2, fila.size)
    }

    @Test
    fun `erro inesperado loga um aviso`() {
        // Frota sem ninguém olhando: hoje um atualizador quebrado é invisível.
        ShadowLog.clear()
        val d = FakeDownloader(nova, apk, erro = IllegalStateException("boom"))
        UpdateController(instalada, d, installer, imediato).check()
        assertTrue(ShadowLog.getLogs().any { it.type == android.util.Log.WARN && it.tag == UpdateController.TAG })
    }

    @Test
    fun `executor que recusa loga um aviso`() {
        ShadowLog.clear()
        val d = FakeDownloader(nova, apk)
        val executor = Executor { throw java.util.concurrent.RejectedExecutionException("saturado") }
        UpdateController(instalada, d, installer, executor).check()
        assertTrue(ShadowLog.getLogs().any { it.type == android.util.Log.WARN && it.tag == UpdateController.TAG })
    }

    @Test
    fun `executor que recusa libera a flag e proxima checagem roda`() {
        var tentativas = 0
        val d = FakeDownloader(nova, apk)
        val executor = Executor {
            tentativas++
            if (tentativas == 1) {
                throw java.util.concurrent.RejectedExecutionException("saturado")
            }
            it.run()
        }
        val c = UpdateController(instalada, d, installer, executor)
        c.check()
        c.check()
        assertEquals(1, d.manifestos)
        assertEquals(listOf(apk to "1.2.0"), preparados)
    }
}
