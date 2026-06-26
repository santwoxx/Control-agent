package com.remotecontrol.agent.ui

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.accessibility.AccessibilityManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.remotecontrol.agent.R
import com.remotecontrol.agent.service.AgentService

class MainActivity : AppCompatActivity() {

    companion object {
        private const val REQUEST_CONTACTS_PERMISSION = 123
    }

    private lateinit var dotServer: View
    private lateinit var txtServer: TextView
    private lateinit var dotAccessibility: View
    private lateinit var txtAccessibility: TextView
    private lateinit var dotNotification: View
    private lateinit var txtNotification: TextView
    private lateinit var txtDeviceModel: TextView
    private lateinit var txtDeviceOS: TextView
    private lateinit var btnAccessibility: Button
    private lateinit var btnNotification: Button
    private lateinit var btnStop: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        dotServer = findViewById(R.id.dotServer)
        txtServer = findViewById(R.id.txtServer)
        dotAccessibility = findViewById(R.id.dotAccessibility)
        txtAccessibility = findViewById(R.id.txtAccessibility)
        dotNotification = findViewById(R.id.dotNotification)
        txtNotification = findViewById(R.id.txtNotification)
        txtDeviceModel = findViewById(R.id.txtDeviceModel)
        txtDeviceOS = findViewById(R.id.txtDeviceOS)
        btnAccessibility = findViewById(R.id.btnAccessibility)
        btnNotification = findViewById(R.id.btnNotification)
        btnStop = findViewById(R.id.btnStop)

        txtDeviceModel.text = "${Build.MANUFACTURER} ${Build.MODEL}"
        txtDeviceOS.text = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"

        btnAccessibility.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        btnNotification.setOnClickListener {
            startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"))
        }

        btnStop.setOnClickListener {
            stopService(Intent(this, AgentService::class.java))
            finish()
        }

        val serviceIntent = Intent(this, AgentService::class.java)
        ContextCompat.startForegroundService(this, serviceIntent)

        updateStatus()
        checkContactsPermission()
    }

    private fun checkContactsPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.READ_CONTACTS), REQUEST_CONTACTS_PERMISSION)
        }
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
    }

    private fun updateStatus() {
        val accessibilityEnabled = isAccessibilityEnabled()

        if (accessibilityEnabled) {
            dotAccessibility.setBackgroundColor(0xFF10b981.toInt())
            txtAccessibility.text = "Ativada"
            btnAccessibility.text = "✓ Acessibilidade Ativa"
            btnAccessibility.isEnabled = false
        } else {
            dotAccessibility.setBackgroundColor(0xFFef4444.toInt())
            txtAccessibility.text = "Desativada"
            btnAccessibility.text = "Ativar Acessibilidade"
            btnAccessibility.isEnabled = true
        }

        val notificationEnabled = isNotificationServiceEnabled()
        if (notificationEnabled) {
            dotNotification.setBackgroundColor(0xFF10b981.toInt())
            txtNotification.text = "Ativado"
            btnNotification.text = "✓ Notificações Ativas"
            btnNotification.isEnabled = false
        } else {
            dotNotification.setBackgroundColor(0xFFef4444.toInt())
            txtNotification.text = "Desativado"
            btnNotification.text = "Ativar Acesso Notificações"
            btnNotification.isEnabled = true
        }

        val isConnected = AgentService.isConnected
        if (isConnected) {
            dotServer.setBackgroundColor(0xFF10b981.toInt())
            txtServer.text = "Conectado"
        } else {
            dotServer.setBackgroundColor(0xFFef4444.toInt())
            txtServer.text = "Desconectado"
        }
    }

    private fun isAccessibilityEnabled(): Boolean {
        val am = getSystemService(ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
        return enabledServices.any { it.id.contains("com.remotecontrol.agent") }
    }

    private fun isNotificationServiceEnabled(): Boolean {
        val pkgName = packageName
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        return flat != null && flat.contains(pkgName)
    }
}
