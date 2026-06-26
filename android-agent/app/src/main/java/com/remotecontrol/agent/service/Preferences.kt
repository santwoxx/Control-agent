package com.remotecontrol.agent.service

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

object Preferences {
    private const val PREFS_NAME = "remote_control_prefs"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_DEVICE_ID = "device_id"

    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value).apply()

    val deviceId: String
        get() {
            val existing = prefs.getString(KEY_DEVICE_ID, "")
            if (!existing.isNullOrEmpty()) return existing
            val newId = "android-${UUID.randomUUID().toString().take(8)}"
            prefs.edit().putString(KEY_DEVICE_ID, newId).apply()
            return newId
        }

    val hasServerUrl: Boolean
        get() = serverUrl.isNotBlank()
}
