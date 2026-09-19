package com.smarttvads.signage

import android.annotation.SuppressLint
import android.graphics.Color
import android.webkit.WebSettings
import android.webkit.WebView

/** Configuração da WebView que roda o tv.html. */
object TvWebViewConfig {
    /** O tv.html procura este marcador para saber que já está em tela cheia. */
    const val UA_MARKER = "SignageApp"

    fun userAgent(base: String, versionName: String): String = "$base $UA_MARKER/$versionName"

    @SuppressLint("SetJavaScriptEnabled")
    fun apply(webView: WebView, versionName: String = BuildConfig.VERSION_NAME) {
        webView.settings.apply {
            javaScriptEnabled = true
            // localStorage guarda a key da TV entre reinícios.
            domStorageEnabled = true
            // Vídeo e YouTube tocam sem ninguém apertar nada.
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = userAgent(userAgentString ?: "", versionName)
        }
        webView.setBackgroundColor(Color.BLACK)
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
    }
}
