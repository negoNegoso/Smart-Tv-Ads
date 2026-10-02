package com.smarttvads.signage

import android.os.Handler
import android.webkit.JavascriptInterface

/**
 * Ponte `window.SignageUpdate`: o tv.html chama `check()` quando o feed do
 * servidor avisa que há versão nova do app (ou que o admin pediu a checagem).
 * É o que faz a box se atualizar em minutos em vez de esperar a checagem
 * periódica de 6 horas.
 *
 * A página só pede a checagem. De onde baixar e o que instalar seguem fixos
 * no build (UPDATE_BASE_URL) e conferidos por SHA-256, então expor isto a
 * qualquer frame da página — inclusive o iframe do YouTube — não deixa
 * ninguém instalar nada: o pior caso é uma checagem a mais.
 */
class AtualizacaoPelaPagina(
    private val handler: Handler,
    private val pedir: () -> Unit,
) {
    // Chamado pelo tv.html numa thread da WebView; o UpdateState e os timers
    // da Activity só podem ser tocados na principal.
    @JavascriptInterface
    fun check() {
        handler.post { pedir() }
    }

    companion object {
        /** Nome que o tv.html procura em `window`. */
        const val NOME_NA_PAGINA = "SignageUpdate"
    }
}
