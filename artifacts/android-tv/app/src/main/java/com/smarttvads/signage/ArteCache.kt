package com.smarttvads.signage

import android.webkit.WebResourceResponse
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/**
 * Cache em disco das artes dos slides, servido à WebView pelo
 * `shouldInterceptRequest`.
 *
 * Sem ele a TV depende do cache HTTP da WebView — pequeno, limpo pelo
 * sistema quando quer, e em box barato pouco confiável. Se ele falha, cada
 * volta do rodízio baixa as artes de novo do Vercel Blob: com uma dezena de
 * artes de alguns MB, uma TV sozinha passa de 10 GB por mês, o limite que
 * fez o Blob gratuito pausar o store.
 *
 * Toda arte enviada ganha uma URL nova (UUID) e nunca é sobrescrita, então a
 * cópia em disco vale para sempre: cada TV baixa cada arte uma vez só.
 *
 * Síncrono: o `shouldInterceptRequest` já roda fora da main thread. Qualquer
 * falha vira null — a WebView então busca sozinha, como antes, e o `onerror`
 * do tv.html (retentativa e pular o slide) continua valendo.
 */
class ArteCache(
    private val dir: File,
    private val limiteBytes: Long = LIMITE_PADRAO_BYTES,
    // Mesmo motivo do UpdateDownloader: usesCleartextTraffic só vale de API 23
    // em diante e o minSdk é 21.
    private val allowCleartext: Boolean = BuildConfig.DEBUG,
    private val ehArte: (String) -> Boolean = ::ehArteDoBlob,
) {
    // Preload do próximo slide e a exibição podem pedir a mesma arte ao mesmo
    // tempo: um download por URL, o segundo pedido espera e lê do disco.
    private val travas = ConcurrentHashMap<String, Any>()

    fun resposta(url: String): WebResourceResponse? {
        if (!ehArte(url)) return null
        val mime = mimeDaExtensao(url) ?: return null
        val arquivo = abrir(url) ?: return null
        return try {
            WebResourceResponse(mime, null, arquivo.inputStream())
        } catch (e: IOException) {
            null
        }
    }

    private fun abrir(url: String): File? = synchronized(travas.getOrPut(url) { Any() }) {
        val alvo = File(dir, nomeDoArquivo(url))
        if (alvo.exists()) {
            // lastModified marca o último uso: é por ele que o limite escolhe quem sai.
            alvo.setLastModified(System.currentTimeMillis())
            return alvo
        }
        val baixado = baixar(url, alvo) ?: return null
        respeitarLimite(manter = baixado)
        baixado
    }

    private fun baixar(url: String, alvo: File): File? {
        if (!allowCleartext && !url.startsWith("https://")) return null
        dir.mkdirs()
        val parte = File(dir, alvo.name + ".part")
        var conn: HttpURLConnection? = null
        return try {
            conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            if (conn.responseCode != HttpURLConnection.HTTP_OK) return null
            conn.inputStream.use { input -> parte.outputStream().use { out -> input.copyTo(out) } }
            if (parte.renameTo(alvo)) alvo else null
        } catch (e: IOException) {
            null
        } finally {
            conn?.disconnect()
            parte.delete()
        }
    }

    /** Apaga as artes usadas há mais tempo até caber no limite (a recém-baixada fica). */
    private fun respeitarLimite(manter: File) {
        val artes = dir.listFiles { f -> f.isFile && !f.name.endsWith(".part") } ?: return
        var total = artes.sumOf { it.length() }
        for (f in artes.sortedBy { it.lastModified() }) {
            if (total <= limiteBytes) break
            if (f == manter) continue
            val tamanho = f.length()
            if (f.delete()) total -= tamanho
        }
    }

    companion object {
        /** Folga para centenas de artes sem encher o armazenamento de um box de 8 GB. */
        const val LIMITE_PADRAO_BYTES = 300L * 1024 * 1024
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 60_000

        private val BLOB = Regex("""^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/[^?#]+$""")

        /**
         * Só artes do nosso Blob: URL https, sem query (a retentativa do
         * tv.html acrescenta `?r=` justamente para furar cache) e com extensão
         * de imagem — vídeo e o resto seguem o caminho normal da WebView.
         */
        fun ehArteDoBlob(url: String): Boolean = BLOB.matches(url) && mimeDaExtensao(url) != null

        private fun mimeDaExtensao(url: String): String? =
            when (url.substringAfterLast('.', "").lowercase()) {
                "jpg", "jpeg" -> "image/jpeg"
                "png" -> "image/png"
                "gif" -> "image/gif"
                else -> null
            }

        private fun nomeDoArquivo(url: String): String =
            MessageDigest.getInstance("SHA-256").digest(url.toByteArray())
                .joinToString("") { "%02x".format(it) }
    }
}
