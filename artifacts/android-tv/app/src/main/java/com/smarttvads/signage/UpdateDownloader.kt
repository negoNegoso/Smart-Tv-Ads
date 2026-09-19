package com.smarttvads.signage

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Baixa o update.json e o APK da release. Síncrono: quem chama roda fora da
 * main thread. Qualquer falha vira null — atualizar é sempre opcional e nunca
 * pode atrapalhar o painel.
 */
class UpdateDownloader(private val baseUrl: String, private val dir: File) : UpdateController.Downloader {

    override fun fetchManifest(): UpdateManifest? = try {
        UpdateManifest.parse(open(baseUrl + MANIFEST).use { it.readBytes().toString(Charsets.UTF_8) })
    } catch (e: IOException) {
        null
    }

    /** APK conferido pelo SHA-256, ou null. Reaproveita o já baixado se o hash bate. */
    override fun downloadApk(manifest: UpdateManifest): File? {
        dir.mkdirs()
        val target = File(dir, manifest.apk)
        if (target.exists() && Sha256.hex(target) == manifest.sha256) return target
        target.delete()
        val part = File(dir, manifest.apk + ".part")
        return try {
            open(baseUrl + manifest.apk).use { input ->
                part.outputStream().use { out -> input.copyTo(out) }
            }
            if (Sha256.hex(part) == manifest.sha256 && part.renameTo(target)) {
                target
            } else {
                part.delete()
                null
            }
        } catch (e: IOException) {
            part.delete()
            null
        }
    }

    // Segue redirecionamento no mesmo protocolo (o GitHub manda de https para https).
    private fun open(url: String): InputStream {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        conn.instanceFollowRedirects = true
        val code = conn.responseCode
        if (code != HttpURLConnection.HTTP_OK) {
            conn.disconnect()
            throw IOException("HTTP $code em $url")
        }
        return conn.inputStream
    }

    companion object {
        const val MANIFEST = "update.json"
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 60_000
    }
}
