package com.smarttvads.signage

import org.json.JSONException
import org.json.JSONObject

/** Conteúdo do update.json que a pipeline anexa a cada release. */
data class UpdateManifest(
    val versionName: String,
    val versionCode: Int,
    val apk: String,
    val sha256: String,
) {
    companion object {
        // Só nome de arquivo: o APK é baixado da mesma pasta da release e
        // gravado no cache; um caminho aqui escaparia dos dois.
        private val APK_NAME = Regex("^[A-Za-z0-9._-]+\\.apk$")
        private val SHA256_HEX = Regex("^[0-9a-f]{64}$")

        /** JSON quebrado ou campo fora do formato → null: a checagem é ignorada. */
        fun parse(json: String): UpdateManifest? = try {
            val o = JSONObject(json)
            UpdateManifest(
                versionName = o.getString("versionName"),
                versionCode = o.getInt("versionCode"),
                apk = o.getString("apk"),
                sha256 = o.getString("sha256"),
            ).takeIf {
                it.versionName.isNotBlank() && it.versionCode > 0 &&
                    APK_NAME.matches(it.apk) && SHA256_HEX.matches(it.sha256)
            }
        } catch (e: JSONException) {
            null
        }
    }
}
