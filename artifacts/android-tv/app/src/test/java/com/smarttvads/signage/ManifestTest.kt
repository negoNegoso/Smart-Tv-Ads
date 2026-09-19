package com.smarttvads.signage

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
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
}
