package com.smarttvads.signage

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.AttributeSet
import android.view.View

/**
 * Padrão de teste de nitidez: linhas de 1 px, verticais na metade esquerda e
 * horizontais na direita, dentro de uma moldura de 1 px na borda. Com cada
 * pixel do Android caindo num pixel do painel, de perto as linhas são nítidas
 * e de longe o fundo é um cinza liso. Se a box ou a TV reescalam a imagem, as
 * linhas batem com a grade do painel e aparecem faixas e ondas. Moldura
 * cortada é overscan da TV.
 */
object PadraoDeTeste {
    const val CLARO = 0xFFFFFFFF.toInt()
    const val ESCURO = 0xFF000000.toInt()

    /** Faixa escura entre a moldura e as linhas, para a moldura se destacar. */
    const val FOLGA_DA_MOLDURA = 7

    fun cor(x: Int, y: Int, largura: Int, altura: Int): Int {
        val distanciaDaBorda = minOf(minOf(x, y), minOf(largura - 1 - x, altura - 1 - y))
        if (distanciaDaBorda == 0) return CLARO
        if (distanciaDaBorda <= FOLGA_DA_MOLDURA) return ESCURO
        val posicao = if (x < largura / 2) x else y
        return if (posicao % 2 == 0) CLARO else ESCURO
    }
}

/** Desenha o [PadraoDeTeste] sem escala nem filtro: um pixel do bitmap por pixel da view. */
class PadraoDeTesteView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private var bitmap: Bitmap? = null

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (width == 0 || height == 0) return
        val atual = bitmap?.takeIf { it.width == width && it.height == height } ?: criar().also {
            bitmap?.recycle()
            bitmap = it
        }
        canvas.drawBitmap(atual, 0f, 0f, null)
    }

    // A tela de ajuste fica fechada quase sempre: não segura alguns MB de
    // bitmap ao lado da WebView numa box com pouca memória.
    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (!isShown) {
            bitmap?.recycle()
            bitmap = null
        }
    }

    private fun criar(): Bitmap {
        // RGB_565 guarda branco e preto exatos com metade da memória.
        val novo = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
        val linha = IntArray(width)
        for (y in 0 until height) {
            for (x in 0 until width) linha[x] = PadraoDeTeste.cor(x, y, width, height)
            novo.setPixels(linha, 0, width, 0, y, width, 1)
        }
        return novo
    }
}
