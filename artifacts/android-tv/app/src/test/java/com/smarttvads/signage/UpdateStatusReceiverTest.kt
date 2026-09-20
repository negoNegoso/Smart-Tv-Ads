package com.smarttvads.signage

import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class UpdateStatusReceiverTest {
    private val eventos = mutableListOf<String>()

    private val ouvinte = object : UpdateState.Listener {
        override fun onUpdateReady(versionName: String) { eventos += "pronta $versionName" }
        override fun onUpdateFailed(aborted: Boolean) { eventos += "falhou aborted=$aborted" }
    }

    @After
    fun limpa() {
        UpdateState.clear()
        UpdateState.listener = null
    }

    private fun status(codigo: Int, confirmacao: Intent? = null, sessionId: Int = 1) =
        Intent().putExtra(UpdateStatusReceiver.EXTRA_VERSION, "1.2.0")
            .putExtra(PackageInstaller.EXTRA_STATUS, codigo)
            .putExtra(PackageInstaller.EXTRA_SESSION_ID, sessionId)
            .apply { confirmacao?.let { putExtra(Intent.EXTRA_INTENT, it) } }

    // A sessão do intent bate com a sessão ativa por padrão: o teste foca no
    // status, não na correlação (que tem teste dedicado abaixo).
    private fun recebe(intent: Intent, sessionId: Int = 1) {
        UpdateState.listener = ouvinte
        UpdateState.sessionStarted(sessionId)
        UpdateStatusReceiver().onReceive(ApplicationProvider.getApplicationContext(), intent)
    }

    @Test
    fun `aguardando usuario guarda a confirmacao sem abrir`() {
        val confirmacao = Intent("android.content.pm.action.CONFIRM_INSTALL")
        recebe(status(PackageInstaller.STATUS_PENDING_USER_ACTION, confirmacao))
        assertEquals("1.2.0", UpdateState.pendingVersion)
        assertEquals(confirmacao.action, UpdateState.pendingConfirmation?.action)
        assertEquals(listOf("pronta 1.2.0"), eventos)
    }

    @Test
    fun `cancelado no dialogo avisa abortado`() {
        recebe(status(PackageInstaller.STATUS_FAILURE_ABORTED))
        assertNull(UpdateState.pendingConfirmation)
        assertEquals(listOf("falhou aborted=true"), eventos)
    }

    @Test
    fun `falha de instalacao avisa falha`() {
        recebe(status(PackageInstaller.STATUS_FAILURE_INCOMPATIBLE))
        assertEquals(listOf("falhou aborted=false"), eventos)
    }

    @Test
    fun `sucesso limpa o estado`() {
        UpdateState.ready("1.2.0", Intent("x"))
        eventos.clear()
        recebe(status(PackageInstaller.STATUS_SUCCESS))
        assertNull(UpdateState.pendingConfirmation)
        assertEquals(emptyList<String>(), eventos)
    }

    @Test
    fun `aguardando usuario sem intent de confirmacao conta como falha`() {
        recebe(status(PackageInstaller.STATUS_PENDING_USER_ACTION))
        assertNull(UpdateState.pendingConfirmation)
        assertEquals(listOf("falhou aborted=false"), eventos)
    }

    @Test
    fun `status de sessao antiga nao mexe na confirmacao da sessao atual`() {
        // Reinício de processo perde o pendingConfirmation (UpdateState é
        // memória): a checagem de 2 min cria uma sessão nova (2) para o mesmo
        // APK. O ABORTED da sessão velha (1), abandonada pelo sistema, chega
        // depois e não pode apagar a confirmação válida da sessão atual.
        UpdateState.listener = ouvinte
        UpdateState.sessionStarted(2)
        UpdateState.ready("1.2.0", Intent("confirmar"))
        eventos.clear()
        UpdateStatusReceiver().onReceive(
            ApplicationProvider.getApplicationContext(),
            status(PackageInstaller.STATUS_FAILURE_ABORTED, sessionId = 1),
        )
        assertEquals("1.2.0", UpdateState.pendingVersion)
        assertEquals("confirmar", UpdateState.pendingConfirmation?.action)
        assertEquals(emptyList<String>(), eventos)
    }

    @Test
    fun `ready sem ouvinte so guarda`() {
        val confirmacao = Intent("x")
        UpdateState.ready("1.2.0", confirmacao)
        assertSame(confirmacao, UpdateState.pendingConfirmation)
    }

    @Test
    fun `falha ao preparar a instalacao nao lanca e avisa falha`() {
        UpdateState.listener = ouvinte
        // Arquivo inexistente: a leitura falha antes do commit, então o sistema
        // nunca manda status pro receiver — o próprio prepare() tem que avisar.
        UpdateInstaller(ApplicationProvider.getApplicationContext()).prepare(File("nao-existe.apk"), "1.2.0")
        shadowOf(Looper.getMainLooper()).idle()
        assertNull(UpdateState.pendingConfirmation)
        assertEquals(listOf("falhou aborted=false"), eventos)
    }
}
