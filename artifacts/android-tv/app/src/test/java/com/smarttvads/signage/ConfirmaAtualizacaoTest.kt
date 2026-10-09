package com.smarttvads.signage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConfirmaAtualizacaoTest {
    private val instalador = "com.android.packageinstaller"

    @Test
    fun `confirma no instalador do sistema, dentro da janela, com o nome do app na tela`() {
        assertTrue(ConfirmaAtualizacao.deveConfirmar(instalador, agora = 1_000, esperandoAte = 2_000, temNomeDoApp = true))
    }

    @Test
    fun `confirma tambem no instalador da Google`() {
        assertTrue(
            ConfirmaAtualizacao.deveConfirmar(
                "com.google.android.packageinstaller", agora = 1_000, esperandoAte = 2_000, temNomeDoApp = true,
            ),
        )
    }

    // Sem a janela, qualquer app que abrisse um diálogo de instalação seria
    // aprovado sozinho pelo nosso serviço.
    @Test
    fun `nao confirma sem o app ter aberto a confirmacao`() {
        assertFalse(ConfirmaAtualizacao.deveConfirmar(instalador, agora = 1_000, esperandoAte = null, temNomeDoApp = true))
    }

    @Test
    fun `nao confirma depois que a janela venceu`() {
        assertFalse(ConfirmaAtualizacao.deveConfirmar(instalador, agora = 2_001, esperandoAte = 2_000, temNomeDoApp = true))
    }

    @Test
    fun `nao confirma diálogo de outro pacote`() {
        assertFalse(ConfirmaAtualizacao.deveConfirmar("com.exemplo.loja", agora = 1_000, esperandoAte = 2_000, temNomeDoApp = true))
    }

    // Outro app pedindo instalação no mesmo minuto: o nome na tela não é o nosso.
    @Test
    fun `nao confirma instalacao de outro app`() {
        assertFalse(ConfirmaAtualizacao.deveConfirmar(instalador, agora = 1_000, esperandoAte = 2_000, temNomeDoApp = false))
    }

    @Test
    fun `botao de confirmar e o ok_button do proprio instalador`() {
        assertEquals("com.android.packageinstaller:id/ok_button", ConfirmaAtualizacao.idDoBotao(instalador))
        assertNull(ConfirmaAtualizacao.idDoBotao("com.exemplo.loja"))
    }

    @Test
    fun `servico ligado so quando o componente esta na lista do sistema`() {
        val nosso = "com.smarttvads.signage/com.smarttvads.signage.ConfirmaAtualizacaoService"
        assertTrue(ConfirmaAtualizacao.ligadoNaLista("outro/.X:$nosso", nosso))
        assertTrue(ConfirmaAtualizacao.ligadoNaLista(nosso.uppercase(), nosso))
        assertFalse(ConfirmaAtualizacao.ligadoNaLista("outro/.X", nosso))
        assertFalse(ConfirmaAtualizacao.ligadoNaLista(null, nosso))
    }
}
