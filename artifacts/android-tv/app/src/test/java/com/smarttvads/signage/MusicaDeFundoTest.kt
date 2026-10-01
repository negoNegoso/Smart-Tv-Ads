package com.smarttvads.signage

import android.app.Application
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Looper
import android.view.KeyEvent
import androidx.test.core.app.ApplicationProvider
import java.time.Duration
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/**
 * Música de fundo (Spotify em segundo plano na box): a peça com som toma o
 * áudio, o Spotify para e não volta sozinho. Quem dá o play de volta é o app.
 */
@RunWith(RobolectricTestRunner::class)
class MusicaDeFundoTest {
    private val app: Application = ApplicationProvider.getApplicationContext()
    private val audio = shadowOf(app.getSystemService(Context.AUDIO_SERVICE) as AudioManager)
    private val musica = MusicaDeFundo(app)

    private fun passar(ms: Long) = shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms))

    /** Teclas de mídia mandadas ao sistema, como "ação:tecla". */
    private fun teclas(): List<String> = audio.dispatchedMediaKeyEvents.map { "${it.action}:${it.keyCode}" }

    /** Comandos mandados direto a um app, como "pacote ação:tecla". */
    private fun comandosDiretos(): List<String> = shadowOf(app).broadcastIntents
        .filter { it.action == Intent.ACTION_MEDIA_BUTTON }
        .map {
            @Suppress("DEPRECATION")
            val tecla = it.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT)!!
            "${it.`package`} ${tecla.action}:${tecla.keyCode}"
        }

    private val play = listOf(
        "${KeyEvent.ACTION_DOWN}:${KeyEvent.KEYCODE_MEDIA_PLAY}",
        "${KeyEvent.ACTION_UP}:${KeyEvent.KEYCODE_MEDIA_PLAY}",
    )

    /** Peça com som inteira: havia (ou não) música, o vídeo a calou, a peça acabou. */
    private fun pecaComSom(haviaMusica: Boolean) {
        audio.setIsMusicActive(haviaMusica)
        musica.somIniciou()
        passar(0)
        audio.setIsMusicActive(false)
        musica.somTerminou()
    }

    @Test
    fun `havia musica - manda play 1 s depois que a peca com som acaba`() {
        pecaComSom(haviaMusica = true)
        passar(999)
        assertEquals(emptyList<String>(), teclas())
        passar(1)
        assertEquals(play, teclas())
    }

    @Test
    fun `nao havia musica - nao manda nada`() {
        pecaComSom(haviaMusica = false)
        passar(60_000)
        assertEquals(emptyList<String>(), teclas())
        assertEquals(emptyList<String>(), comandosDiretos())
    }

    @Test
    fun `musica voltou com o play - nao incomoda o Spotify de novo`() {
        pecaComSom(haviaMusica = true)
        passar(1_000)
        audio.setIsMusicActive(true)
        passar(60_000)
        assertEquals(play, teclas())
        assertEquals(emptyList<String>(), comandosDiretos())
    }

    @Test
    fun `play nao trouxe a musica - 2 s depois manda o play direto ao Spotify`() {
        pecaComSom(haviaMusica = true)
        passar(1_000 + 1_999)
        assertEquals(emptyList<String>(), comandosDiretos())
        passar(1)
        assertEquals(
            listOf(
                "com.spotify.music ${KeyEvent.ACTION_DOWN}:${KeyEvent.KEYCODE_MEDIA_PLAY}",
                "com.spotify.music ${KeyEvent.ACTION_UP}:${KeyEvent.KEYCODE_MEDIA_PLAY}",
            ),
            comandosDiretos(),
        )
    }

    @Test
    fun `nenhum dos dois funcionou - desiste sem ficar tentando`() {
        pecaComSom(haviaMusica = true)
        passar(600_000)
        assertEquals(play, teclas())
        assertEquals(2, comandosDiretos().size)
    }

    @Test
    fun `duas pecas com som seguidas - um play so, depois da ultima`() {
        pecaComSom(haviaMusica = true)
        passar(500)
        // A segunda começa antes do play: a música segue calada, mas havia.
        pecaComSom(haviaMusica = false)
        passar(999)
        assertEquals(emptyList<String>(), teclas())
        passar(1)
        assertEquals(play, teclas())
    }

    @Test
    fun `peca com som comeca logo depois do play - nao manda o play direto por cima dela`() {
        pecaComSom(haviaMusica = true)
        passar(1_000)
        musica.somIniciou()
        passar(60_000)
        assertEquals(emptyList<String>(), comandosDiretos())
    }

    @Test
    fun `peca com som comeca antes de a musica voltar do play - retoma de novo no fim dela`() {
        pecaComSom(haviaMusica = true)
        passar(1_000)
        // O Spotify ainda não tinha voltado quando a peça seguinte começou:
        // não é sinal de que não havia música.
        pecaComSom(haviaMusica = false)
        passar(1_000)
        assertEquals(play + play, teclas())
    }

    @Test
    fun `depois de retomar esquece - peca seguinte sem musica nao manda play`() {
        pecaComSom(haviaMusica = true)
        passar(60_000)
        audio.clearDispatchedMediaKeyEvents()
        pecaComSom(haviaMusica = false)
        passar(60_000)
        assertEquals(emptyList<String>(), teclas())
    }

    @Test
    fun `cancelar desiste do play pendente`() {
        pecaComSom(haviaMusica = true)
        musica.cancelar()
        passar(60_000)
        assertEquals(emptyList<String>(), teclas())
    }
}
