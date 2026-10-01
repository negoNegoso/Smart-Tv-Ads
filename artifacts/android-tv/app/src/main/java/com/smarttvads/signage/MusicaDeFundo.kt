package com.smarttvads.signage

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.webkit.JavascriptInterface

/**
 * Devolve o play à música de fundo (Spotify rodando em segundo plano na box)
 * depois de uma peça com som.
 *
 * O vídeo com som na WebView pede o áudio da TV de forma permanente; o Spotify
 * entende que perdeu a vez de vez e não volta sozinho quando a peça acaba.
 * O tv.html avisa por `window.SignageNative` quando o som da peça começa e
 * quando termina, e daqui sai o play. Só se havia música antes: quem pausou o
 * Spotify de propósito não quer que o painel o ligue de novo.
 */
class MusicaDeFundo(context: Context) {
    private val app = context.applicationContext
    private val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val handler = Handler(Looper.getMainLooper())

    private var haviaMusica = false

    /**
     * Há uma retomada em curso: play agendado, ou enviado e ainda não
     * conferido. Peça com som que começa nesse intervalo encontra a TV em
     * silêncio por nossa causa, não porque não havia música.
     */
    private var retomando = false

    private val retomar = Runnable {
        mandarPlay()
        handler.postDelayed(conferir, CONFERIR_APOS_MS)
    }

    // A tecla de mídia vai para a última sessão de mídia ativa, que pode ser a
    // da própria WebView. Se a música não voltou, fala direto com o Spotify.
    // Uma tentativa só: se nem assim voltar, o painel segue sem música.
    private val conferir = Runnable {
        retomando = false
        if (!audio.isMusicActive) mandarPlayAoSpotify()
    }

    // Chamados pelo tv.html numa thread da WebView; o trabalho vai para a
    // principal, onde estão os timers.

    @JavascriptInterface
    fun somIniciou() {
        handler.post {
            handler.removeCallbacks(retomar)
            handler.removeCallbacks(conferir)
            if (!retomando) haviaMusica = audio.isMusicActive
            retomando = false
        }
    }

    @JavascriptInterface
    fun somTerminou() {
        handler.post {
            if (!haviaMusica) return@post
            handler.removeCallbacks(retomar)
            retomando = true
            // Dá tempo de a WebView soltar o áudio antes do play.
            handler.postDelayed(retomar, RETOMAR_APOS_MS)
        }
    }

    /** Painel fechando: nada de play depois. */
    fun cancelar() {
        handler.removeCallbacksAndMessages(null)
        retomando = false
    }

    // PLAY, nunca PLAY_PAUSE: se a música já estiver tocando, não a pausa.
    private fun mandarPlay() {
        audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY))
        audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY))
    }

    private fun mandarPlayAoSpotify() {
        for (acao in intArrayOf(KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP)) {
            val intent = Intent(Intent.ACTION_MEDIA_BUTTON)
                .setPackage(SPOTIFY)
                .putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(acao, KeyEvent.KEYCODE_MEDIA_PLAY))
            try {
                app.sendBroadcast(intent)
            } catch (e: RuntimeException) {
                // Box que recusa o envio: o painel segue sem música.
            }
        }
    }

    companion object {
        /** Nome que o tv.html procura em `window`. */
        const val NOME_NA_PAGINA = "SignageNative"

        const val RETOMAR_APOS_MS = 1_000L
        const val CONFERIR_APOS_MS = 2_000L
        private const val SPOTIFY = "com.spotify.music"
    }
}
