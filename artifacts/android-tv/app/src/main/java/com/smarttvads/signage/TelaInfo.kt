package com.smarttvads.signage

import android.annotation.TargetApi
import android.graphics.Point
import android.os.Build
import android.view.Display

/** Um modo de vídeo do aparelho, sempre deitado (largura >= altura). */
data class ModoDeTela(val largura: Int, val altura: Int, val hz: Float) {
    val pixels: Long get() = largura.toLong() * altura
    val rotulo: String get() = "${largura}x$altura"
}

enum class SituacaoDaTela {
    /** O aparelho oferece resolução maior que a atual. */
    HA_MODO_MAIOR,

    /** Abaixo de Full HD e o aparelho não diz ter modo maior. */
    ABAIXO_DE_FULL_HD,

    RESOLUCAO_OK,
}

data class DiagnosticoDeTela(
    val atual: ModoDeTela,
    /** Maior resolução conhecida; é o próprio `atual` quando não há maior. */
    val melhor: ModoDeTela,
    val situacao: SituacaoDaTela,
)

/**
 * Resolução em que o Android desenha e se dá para melhorar. Em TV box
 * genérica isso é o framebuffer, não a saída HDMI: a box pode desenhar em
 * 1080p e mandar outra coisa para a TV. Por isso a tela de ajuste mostra
 * também o [PadraoDeTeste], que denuncia a reescala a olho.
 */
object TelaInfo {
    const val ALTURA_FULL_HD = 1080

    fun diagnosticar(atual: ModoDeTela, disponiveis: List<ModoDeTela>): DiagnosticoDeTela {
        // Só troca por modo com mais pixels: mesma resolução em outra taxa
        // não melhora a nitidez.
        val melhor = disponiveis.filter { it.pixels > atual.pixels }.maxByOrNull { it.pixels } ?: atual
        val situacao = when {
            melhor != atual -> SituacaoDaTela.HA_MODO_MAIOR
            atual.altura < ALTURA_FULL_HD -> SituacaoDaTela.ABAIXO_DE_FULL_HD
            else -> SituacaoDaTela.RESOLUCAO_OK
        }
        return DiagnosticoDeTela(atual, melhor, situacao)
    }

    fun ler(display: Display): DiagnosticoDeTela {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return diagnosticar(modo(display.mode), display.supportedModes.map(::modo))
        }
        // Android 5: sem lista de modos, só o tamanho real da tela.
        val tamanho = Point()
        @Suppress("DEPRECATION")
        display.getRealSize(tamanho)
        return diagnosticar(deitado(tamanho.x, tamanho.y, display.refreshRate), emptyList())
    }

    @TargetApi(Build.VERSION_CODES.M)
    private fun modo(m: Display.Mode) = deitado(m.physicalWidth, m.physicalHeight, m.refreshRate)

    private fun deitado(a: Int, b: Int, hz: Float) = ModoDeTela(maxOf(a, b), minOf(a, b), hz)
}
