package com.smarttvads.signage

/**
 * Regras do [ConfirmaAtualizacaoService]. Box com Android 9–11 (muitas
 * chinesas se apresentam como "Android 13" mas rodam API 28) sempre pede
 * confirmação para instalar, e não há ninguém na loja para apertar OK. O
 * serviço aperta por ele, mas só no diálogo que o próprio app abriu: um
 * serviço de acessibilidade que aprovasse qualquer instalação seria porta
 * aberta para qualquer app instalar o que quisesse na box.
 */
object ConfirmaAtualizacao {
    /** Quanto tempo depois de abrir a confirmação o serviço ainda aperta o botão. */
    const val JANELA_MS = 120_000L

    private val INSTALADORES = setOf("com.android.packageinstaller", "com.google.android.packageinstaller")

    fun deveConfirmar(pacote: String, agora: Long, esperandoAte: Long?, temNomeDoApp: Boolean): Boolean =
        pacote in INSTALADORES && esperandoAte != null && agora <= esperandoAte && temNomeDoApp

    /** No AOSP o mesmo botão vira "Próximo" (permissões novas) e depois "Instalar". */
    fun idDoBotao(pacote: String): String? = if (pacote in INSTALADORES) "$pacote:id/ok_button" else null

    /** Lista de Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, separada por ':'. */
    fun ligadoNaLista(lista: String?, componente: String): Boolean =
        lista?.split(':')?.any { it.equals(componente, ignoreCase = true) } == true
}
