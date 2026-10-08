package com.smarttvads.signage

import android.webkit.JavascriptInterface
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONArray
import org.json.JSONObject

/**
 * Ponte `window.SignageCache`. A cada feed o tv.html manda a lista de artes e
 * QR que a TV pode tocar sem internet (`baixar`); o app baixa para o disco,
 * uma de cada vez, numa thread própria. Também informa o espaço em disco
 * (`estado`), que a página manda ao servidor para o parque de TVs.
 *
 * Exposta a todo frame, como a SignageUpdate: o ArteCache só aceita arte do
 * nosso Blob e QR da nossa origem, então o pior caso de um iframe chamar
 * `baixar` é baixar arte nossa.
 */
class CachePelaPagina(
    private val cache: ArteCache,
    private val executor: Executor = Executors.newSingleThreadExecutor(),
) {
    // Cada lista nova vira uma geração; a tarefa de uma lista velha para no
    // próximo item. Assim a fila pendente é sempre a da última lista.
    private val geracao = AtomicInteger(0)

    @JavascriptInterface
    fun baixar(json: String) {
        val urls = try {
            val arr = JSONArray(json)
            (0 until arr.length()).mapNotNull { arr.optString(it, null) }.filter(cache::aceita)
        } catch (e: Exception) {
            return
        }
        cache.manterLista(urls)
        val minha = geracao.incrementAndGet()
        executor.execute {
            for (url in urls) {
                if (geracao.get() != minha) return@execute
                cache.baixarAntes(url)
            }
        }
    }

    @JavascriptInterface
    fun estado(): String {
        val e = cache.estado()
        return JSONObject()
            .put("livre", e.livre)
            .put("total", e.total)
            .put("cache", e.cache)
            .put("arquivos", e.arquivos)
            .toString()
    }

    companion object {
        /** Nome que o tv.html procura em `window`. */
        const val NOME_NA_PAGINA = "SignageCache"
    }
}
