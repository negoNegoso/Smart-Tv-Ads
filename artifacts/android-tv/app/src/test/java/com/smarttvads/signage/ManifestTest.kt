package com.smarttvads.signage

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ManifestTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun abreMainActivity(categoria: String): Boolean {
        val intent = Intent(Intent.ACTION_MAIN)
            .addCategory(categoria)
            .setPackage(context.packageName)
        return context.packageManager.queryIntentActivities(intent, 0)
            .any { it.activityInfo.name == MainActivity::class.java.name }
    }

    @Test
    fun `aparece no launcher de TV box com Android comum`() {
        assertTrue(abreMainActivity(Intent.CATEGORY_LAUNCHER))
    }

    @Test
    fun `aparece no launcher do Android TV`() {
        assertTrue(abreMainActivity(Intent.CATEGORY_LEANBACK_LAUNCHER))
    }

    @Test
    fun `pode ser escolhido como tela inicial`() {
        assertTrue(abreMainActivity(Intent.CATEGORY_HOME))
    }

    @Test
    fun `debug tambem aponta para producao`() {
        assertEquals("https://smart-tv-ads.vercel.app/tv", BuildConfig.TV_URL)
    }

    @Test
    fun `backup desligado para nao clonar a key da TV`() {
        val flags = context.applicationInfo.flags
        assertEquals(0, flags and ApplicationInfo.FLAG_ALLOW_BACKUP)
    }

    @Test
    fun `atualizacao vem da API do painel`() {
        assertEquals(
            "https://smart-tv-ads.vercel.app/api/tv-app/",
            BuildConfig.UPDATE_BASE_URL,
        )
    }

    @Test
    fun `pode instalar a propria atualizacao`() {
        val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
        assertTrue(info.requestedPermissions!!.contains("android.permission.REQUEST_INSTALL_PACKAGES"))
    }

    // Sem esta permissão o Android 12+ ignora o USER_ACTION_NOT_REQUIRED do
    // UpdateInstaller e toda atualização para na confirmação.
    @Test
    fun `pode atualizar a si mesmo sem confirmacao no Android 12 ou mais novo`() {
        val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
        assertTrue(info.requestedPermissions!!.contains("android.permission.UPDATE_PACKAGES_WITHOUT_USER_ACTION"))
    }

    // Sem a permissão BIND_ACCESSIBILITY_SERVICE qualquer app poderia se
    // ligar ao serviço; o sistema também não o lista em Acessibilidade.
    @Test
    fun `servico de confirmacao automatica protegido pela permissao do sistema`() {
        val info = context.packageManager.getServiceInfo(
            android.content.ComponentName(context, ConfirmaAtualizacaoService::class.java), 0,
        )
        assertEquals("android.permission.BIND_ACCESSIBILITY_SERVICE", info.permission)
    }

    @Test
    fun `receiver do instalador registrado e nao exportado`() {
        val info = context.packageManager.getReceiverInfo(
            android.content.ComponentName(context, UpdateStatusReceiver::class.java), 0,
        )
        assertEquals(false, info.exported)
    }
}
