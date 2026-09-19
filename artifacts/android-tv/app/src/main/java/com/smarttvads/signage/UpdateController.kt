package com.smarttvads.signage

import java.io.File
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Checagem de versão nova: manifesto → política → APK conferido → sessão do
 * instalador. Roda no executor (fora da main thread), uma por vez, e nunca
 * propaga erro: atualizar é opcional.
 */
class UpdateController(
    private val installedVersionCode: Int,
    private val downloader: Downloader,
    private val installer: Installer,
    private val executor: Executor,
) {
    interface Downloader {
        fun fetchManifest(): UpdateManifest?
        fun downloadApk(manifest: UpdateManifest): File?
    }

    fun interface Installer {
        fun prepare(apk: File, versionName: String)
    }

    private val running = AtomicBoolean(false)

    fun check() {
        if (!running.compareAndSet(false, true)) return
        executor.execute {
            try {
                val manifest = downloader.fetchManifest() ?: return@execute
                if (!UpdatePolicy.shouldUpdate(manifest.versionCode, installedVersionCode)) return@execute
                val apk = downloader.downloadApk(manifest) ?: return@execute
                installer.prepare(apk, manifest.versionName)
            } catch (e: Exception) {
                // Sem rede, disco cheio, instalador recusou: tenta na próxima checagem.
            } finally {
                running.set(false)
            }
        }
    }
}
