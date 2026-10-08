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
 * Também guarda o QR das campanhas (`/api/qr/<código>.png` da origem da TV,
 * resposta `immutable`) e recebe da página, pela ponte `SignageCache`, a lista
 * do que baixar antes (prefetch), para a TV tocar sem internet. Nunca deixa o
 * disco com menos de [RESERVA_BYTES] livres: box/stick cheio trava.
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
    private val ehArte: (String) -> Boolean = ::ehArteAceita,
    private val livre: () -> Long = { espacoLivre(dir) },
    private val total: () -> Long = { espacoTotal(dir) },
) {
    // Preload do próximo slide e a exibição podem pedir a mesma arte ao mesmo
    // tempo: um download por URL, o segundo pedido espera e lê do disco.
    private val travas = ConcurrentHashMap<String, Any>()

    // Nomes em disco (sha) da última lista que a página mandou baixar. Na
    // limpeza, o que saiu dela vai primeiro.
    @Volatile private var naLista: Set<String> = emptySet()

    fun aceita(url: String): Boolean = ehArte(url) && mimeDaExtensao(url) != null

    fun manterLista(urls: Collection<String>) {
        naLista = urls.filter(::aceita).map(::nomeDoArquivo).toSet()
    }

    fun baixarAntes(url: String): Boolean = aceita(url) && abrir(url) != null

    data class Estado(val livre: Long, val total: Long, val cache: Long, val arquivos: Int)

    fun estado(): Estado {
        val artes = artesEmDisco()
        return Estado(livre = livre(), total = total(), cache = artes.sumOf { it.length() }, arquivos = artes.size)
    }

    private fun artesEmDisco(): List<File> =
        dir.listFiles { f -> f.isFile && !f.name.endsWith(".part") }?.toList() ?: emptyList()

    fun resposta(url: String): WebResourceResponse? {
        if (!aceita(url)) return null
        val mime = mimeDaExtensao(url)!!
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
        if (!liberarPara(0)) return null
        dir.mkdirs()
        val parte = File(dir, alvo.name + ".part")
        var conn: HttpURLConnection? = null
        return try {
            conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            if (conn.responseCode != HttpURLConnection.HTTP_OK) return null
            val tamanho = conn.contentLengthLong.coerceAtLeast(0)
            if (!liberarPara(tamanho)) return null
            conn.inputStream.use { input -> parte.outputStream().use { out -> input.copyTo(out) } }
            if (parte.renameTo(alvo)) alvo else null
        } catch (e: IOException) {
            null
        } finally {
            conn?.disconnect()
            parte.delete()
        }
    }

    /**
     * Garante `precisa` bytes acima da reserva, apagando arte do cache: primeiro
     * o que saiu da lista atual, depois o usado há mais tempo, nunca o que está
     * na lista atual nem `manter`. Box/stick cheio trava — nessa hora a arte
     * fica na rede, como antes do cache.
     */
    private fun liberarPara(precisa: Long, manter: File? = null): Boolean {
        if (livre() - precisa >= RESERVA_BYTES) return true
        val candidatas = artesEmDisco()
            .filter { it != manter && it.name !in naLista }
            .sortedBy { it.lastModified() }
        for (f in candidatas) {
            f.delete()
            if (livre() - precisa >= RESERVA_BYTES) return true
        }
        return false
    }

    /** Passou do limite: sai primeiro o que não está na lista atual, depois o usado há mais tempo (a recém-baixada fica). */
    private fun respeitarLimite(manter: File) {
        val artes = artesEmDisco()
        var total = artes.sumOf { it.length() }
        val ordem = artes.sortedWith(compareBy<File>({ it.name in naLista }, { it.lastModified() }))
        for (f in ordem) {
            if (total <= limiteBytes) break
            if (f == manter) continue
            val tamanho = f.length()
            if (f.delete()) total -= tamanho
        }
    }

    companion object {
        /** Teto do cache num box de 8 GB; encolhe sozinho quando o disco aperta. */
        const val LIMITE_PADRAO_BYTES = 1024L * 1024 * 1024
        /** Espaço que o cache nunca ocupa: abaixo disso o Android do box trava. */
        const val RESERVA_BYTES = 500L * 1024 * 1024
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 60_000

        private val BLOB = Regex("""^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/[^?#]+$""")

        /**
         * Só artes do nosso Blob: URL https, sem query (a retentativa do
         * tv.html acrescenta `?r=` justamente para furar cache) e com extensão
         * de imagem — vídeo e o resto seguem o caminho normal da WebView.
         */
        fun ehArteDoBlob(url: String): Boolean = BLOB.matches(url) && mimeDaExtensao(url) != null

        /** Artes do Blob ou QR das campanhas servido pela origem da TV. */
        fun ehArteAceita(url: String, tvUrl: String = BuildConfig.TV_URL): Boolean =
            ehArteDoBlob(url) || ehQrDaTv(url, tvUrl)

        /** `<origem do TV_URL>/api/qr/<código>.png`, sem query (o QR de pareamento fica de fora). */
        fun ehQrDaTv(url: String, tvUrl: String = BuildConfig.TV_URL): Boolean {
            val origem = Regex("""^(https?://[^/]+)""").find(tvUrl)?.groupValues?.get(1) ?: return false
            return Regex("^" + Regex.escape(origem) + """/api/qr/[A-Za-z0-9_-]+\.png$""").matches(url)
        }

        fun espacoLivre(dir: File): Long = existente(dir).usableSpace
        fun espacoTotal(dir: File): Long = existente(dir).totalSpace

        // O diretório do cache só existe depois do primeiro download.
        private fun existente(dir: File): File = generateSequence(dir) { it.parentFile }.first { it.exists() }

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
