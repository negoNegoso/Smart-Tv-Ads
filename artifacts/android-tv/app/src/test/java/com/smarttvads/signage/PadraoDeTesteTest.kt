package com.smarttvads.signage

import org.junit.Assert.assertEquals
import org.junit.Test

class PadraoDeTesteTest {
    private val l = 1920
    private val a = 1080

    private fun cor(x: Int, y: Int) = PadraoDeTeste.cor(x, y, l, a)

    @Test
    fun `moldura clara de 1 px nas quatro bordas`() {
        assertEquals(PadraoDeTeste.CLARO, cor(0, 500))
        assertEquals(PadraoDeTeste.CLARO, cor(l - 1, 500))
        assertEquals(PadraoDeTeste.CLARO, cor(700, 0))
        assertEquals(PadraoDeTeste.CLARO, cor(700, a - 1))
    }

    @Test
    fun `faixa escura separa a moldura das linhas`() {
        for (d in 1..PadraoDeTeste.FOLGA_DA_MOLDURA) {
            assertEquals(PadraoDeTeste.ESCURO, cor(d, 500))
            assertEquals(PadraoDeTeste.ESCURO, cor(700, a - 1 - d))
        }
    }

    @Test
    fun `metade esquerda alterna colunas de 1 px`() {
        assertEquals(PadraoDeTeste.CLARO, cor(100, 300))
        assertEquals(PadraoDeTeste.ESCURO, cor(101, 300))
        // A linha de baixo repete: as colunas são contínuas na vertical.
        assertEquals(PadraoDeTeste.CLARO, cor(100, 301))
        assertEquals(PadraoDeTeste.ESCURO, cor(101, 301))
    }

    @Test
    fun `metade direita alterna linhas de 1 px`() {
        assertEquals(PadraoDeTeste.CLARO, cor(1500, 300))
        assertEquals(PadraoDeTeste.ESCURO, cor(1500, 301))
        assertEquals(PadraoDeTeste.CLARO, cor(1501, 300))
        assertEquals(PadraoDeTeste.ESCURO, cor(1501, 301))
    }
}
