package com.smarttvads.signage

import android.webkit.WebSettings
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TvWebViewConfigTest {

    @Test
    fun `user agent ganha o marcador do app com a versao`() {
        assertEquals(
            "Mozilla/5.0 Chrome/74 SignageApp/1.0.0",
            TvWebViewConfig.userAgent("Mozilla/5.0 Chrome/74", "1.0.0"),
        )
    }

    @Test
    fun `configura a WebView para a TV`() {
        val webView = WebView(ApplicationProvider.getApplicationContext())
        TvWebViewConfig.apply(webView, versionName = "1.0.0")
        val s = webView.settings
        assertTrue(s.javaScriptEnabled)
        assertTrue(s.domStorageEnabled)
        assertFalse(s.mediaPlaybackRequiresUserGesture)
        assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW, s.mixedContentMode)
        assertTrue(s.userAgentString.endsWith(" SignageApp/1.0.0"))
    }
}
