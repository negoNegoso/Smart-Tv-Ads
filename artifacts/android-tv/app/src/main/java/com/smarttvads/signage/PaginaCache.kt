package com.smarttvads.signage

import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Última cópia boa da tv.html, servida à WebView quando a Vercel não
 * responde. Sem ela, TV que liga sem internet fica na tela de "sem conexão";
 * com ela, a página abre e toca a lista salva no localStorage.
 *
 * Sempre tenta a rede primeiro (10 s no total): página nova chega assim que
 * a internet volta. Falha → cópia. Sem cópia → null, e a WebView segue o
 * caminho de hoje (erro, aviso de sem conexão, retentativas).
 *
 * Síncrono: o `shouldInterceptRequest` já roda fora da main thread.
 */
class PaginaCache(
    private val arquivo: File,
    private val tvUrl: String = BuildConfig.TV_URL,
    // Mesmo motivo do ArteCache: usesCleartextTraffic só vale de API 23 em diante.
    private val allowCleartext: Boolean = BuildConfig.DEBUG,
) {
    fun resposta(url: String): WebResourceResponse? {
        if (url != tvUrl) return null
        val nova = baixar()
        if (nova != null) {
            // Captive portal (Wi-Fi de loja) responde 200 com o próprio HTML:
            // gravado, a próxima vez sem rede abriria o portal em vez da TV.
            // Só a tv.html de verdade tem a marca; o resto vai para a WebView
            // (pode ser o login do Wi-Fi), mas não substitui a cópia boa.
            if (temMarca(nova)) gravar(nova)
            return html(nova)
        }
        return try {
            if (arquivo.exists()) html(arquivo.readBytes()) else null
        } catch (e: IOException) {
            null
        }
    }

    private fun baixar(): ByteArray? {
        if (!allowCleartext && !tvUrl.startsWith("https://")) return null
        var conn: HttpURLConnection? = null
        return try {
            conn = URL(tvUrl).openConnection() as HttpURLConnection
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            if (conn.responseCode != HttpURLConnection.HTTP_OK) return null
            // Página vazia (proxy, captive portal) nunca substitui a cópia boa.
            conn.inputStream.use { it.readBytes() }.takeIf { it.isNotEmpty() }
        } catch (e: IOException) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    // .part + rename: queda de energia no meio não deixa cópia pela metade.
    private fun gravar(corpo: ByteArray) {
        try {
            arquivo.parentFile?.mkdirs()
            val parte = File(arquivo.parentFile, arquivo.name + ".part")
            parte.writeBytes(corpo)
            if (!parte.renameTo(arquivo)) parte.delete()
        } catch (e: IOException) {
            // Sem disco: entrega a página igual, só não guarda.
        }
    }

    private fun temMarca(corpo: ByteArray) = corpo.decodeToString().contains(MARCA)

    private fun html(corpo: ByteArray) = WebResourceResponse("text/html", "utf-8", ByteArrayInputStream(corpo))

    companion object {
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 10_000

        // Chave do localStorage da lista sem internet, na tv.html. Um teste do
        // web (tv-html.test.ts) garante que ela continua lá.
        private const val MARCA = "signage-offline"
    }
}
