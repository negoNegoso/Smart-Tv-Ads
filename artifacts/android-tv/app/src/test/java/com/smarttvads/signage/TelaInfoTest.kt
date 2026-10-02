package com.smarttvads.signage

import org.junit.Assert.assertEquals
import org.junit.Test

class TelaInfoTest {
    private val hd = ModoDeTela(1280, 720, 60f)
    private val fullHd = ModoDeTela(1920, 1080, 60f)
    private val quatroK = ModoDeTela(3840, 2160, 30f)

    @Test
    fun `aparelho que oferece modo maior que o atual recomenda o maior`() {
        val d = TelaInfo.diagnosticar(hd, listOf(hd, fullHd))
        assertEquals(SituacaoDaTela.HA_MODO_MAIOR, d.situacao)
        assertEquals(fullHd, d.melhor)
    }

    @Test
    fun `entre varios modos maiores o recomendado e o de mais pixels`() {
        val d = TelaInfo.diagnosticar(hd, listOf(fullHd, quatroK, hd))
        assertEquals(quatroK, d.melhor)
    }

    @Test
    fun `abaixo de full hd sem modo maior exposto avisa para conferir nas configuracoes`() {
        val d = TelaInfo.diagnosticar(hd, listOf(hd))
        assertEquals(SituacaoDaTela.ABAIXO_DE_FULL_HD, d.situacao)
        assertEquals(hd, d.melhor)
    }

    @Test
    fun `full hd sem modo maior esta ok`() {
        val d = TelaInfo.diagnosticar(fullHd, listOf(hd, fullHd))
        assertEquals(SituacaoDaTela.RESOLUCAO_OK, d.situacao)
        assertEquals(fullHd, d.melhor)
    }

    @Test
    fun `mesma resolucao em outra taxa nao conta como modo maior`() {
        val d = TelaInfo.diagnosticar(fullHd, listOf(ModoDeTela(1920, 1080, 50f), fullHd))
        assertEquals(SituacaoDaTela.RESOLUCAO_OK, d.situacao)
        assertEquals(fullHd, d.melhor)
    }

    @Test
    fun `lista de modos vazia vale como so o modo atual`() {
        val d = TelaInfo.diagnosticar(fullHd, emptyList())
        assertEquals(SituacaoDaTela.RESOLUCAO_OK, d.situacao)
        assertEquals(fullHd, d.melhor)
    }

    @Test
    fun `rotulo mostra largura por altura`() {
        assertEquals("1920x1080", fullHd.rotulo)
    }
}
