package com.smarttvads.signage

import android.app.Application
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class UpdatedReceiverTest {
    private val app: Application = ApplicationProvider.getApplicationContext()

    @Test
    fun `depois de atualizar reabre o painel e apaga os apks`() {
        val dir = File(app.cacheDir, "updates").apply { mkdirs() }
        File(dir, "signage-tv-1.2.0.apk").writeText("x")
        UpdatedReceiver().onReceive(app, Intent(Intent.ACTION_MY_PACKAGE_REPLACED))
        assertEquals(MainActivity::class.java.name, shadowOf(app).nextStartedActivity?.component?.className)
        assertFalse(dir.exists())
    }

    @Test
    fun `com o painel ja aberto nao abre outro`() {
        val c = Robolectric.buildActivity(MainActivity::class.java).setup()
        try {
            shadowOf(app).clearNextStartedActivities()
            UpdatedReceiver().onReceive(app, Intent(Intent.ACTION_MY_PACKAGE_REPLACED))
            assertNull(shadowOf(app).nextStartedActivity)
        } finally {
            c.pause().stop().destroy()
        }
    }

    @Test
    fun `outra acao nao faz nada`() {
        UpdatedReceiver().onReceive(app, Intent(Intent.ACTION_BOOT_COMPLETED))
        assertNull(shadowOf(app).nextStartedActivity)
    }

    @Test
    fun `registrado para MY_PACKAGE_REPLACED`() {
        val intent = Intent(Intent.ACTION_MY_PACKAGE_REPLACED).setPackage(app.packageName)
        val receivers = app.packageManager.queryBroadcastReceivers(intent, 0)
        assertTrue(receivers.any { it.activityInfo.name == UpdatedReceiver::class.java.name })
    }
}
