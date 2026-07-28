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
import androidx.activity.result.contract.ActivityResultContracts
import android.Manifest
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.remotecontrol.agent.R
import com.remotecontrol.agent.service.AgentService
import com.remotecontrol.agent.service.Preferences
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class MainActivity : AppCompatActivity() {

    companion object {
        private const val REQUEST_CONTACTS_PERMISSION = 123
    }

    private lateinit var dotServer: View
    private lateinit var txtServer: TextView
    private lateinit var txtServerUrl: TextView
    private lateinit var dotAccessibility: View
    private lateinit var txtAccessibility: TextView
    private lateinit var dotNotification: View
    private lateinit var txtNotification: TextView
    private lateinit var txtDeviceModel: TextView
    private lateinit var txtDeviceOS: TextView
    private lateinit var btnScanQr: Button
    private lateinit var btnAccessibility: Button
    private lateinit var btnNotification: Button
    private lateinit var btnStop: Button

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            val scannedUrl = result.contents.trim()
            if (scannedUrl.startsWith("ws://") || scannedUrl.startsWith("wss://")) {
                Preferences.serverUrl = scannedUrl
                txtServerUrl.text = scannedUrl
                restartService()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        Preferences.init(this)

        dotServer = findViewById(R.id.dotServer)
        txtServer = findViewById(R.id.txtServer)
        txtServerUrl = findViewById(R.id.txtServerUrl)
        dotAccessibility = findViewById(R.id.dotAccessibility)
        txtAccessibility = findViewById(R.id.txtAccessibility)
        dotNotification = findViewById(R.id.dotNotification)
        txtNotification = findViewById(R.id.txtNotification)
        txtDeviceModel = findViewById(R.id.txtDeviceModel)
        txtDeviceOS = findViewById(R.id.txtDeviceOS)
        btnScanQr = findViewById(R.id.btnScanQr)
        btnAccessibility = findViewById(R.id.btnAccessibility)
        btnNotification = findViewById(R.id.btnNotification)
        btnStop = findViewById(R.id.btnStop)

        txtDeviceModel.text = "${Build.MANUFACTURER} ${Build.MODEL}"
        txtDeviceOS.text = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"

        val savedUrl = Preferences.serverUrl
        txtServerUrl.text = if (savedUrl.isNotBlank()) savedUrl else "Não configurado"

        btnScanQr.setOnClickListener {
            val options = ScanOptions()
            options.setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            options.setPrompt("Escaneie o QR Code do Painel de Controle")
            options.setBeepEnabled(false)
            options.setOrientationLocked(true)
            scanLauncher.launch(options)
        }

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

    private fun restartService() {
        stopService(Intent(this, AgentService::class.java))
        val serviceIntent = Intent(this, AgentService::class.java)
        ContextCompat.startForegroundService(this, serviceIntent)
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
        val successColor = ColorStateList.valueOf(0xFF10b981.toInt())
        val dangerColor = ColorStateList.valueOf(0xFFef4444.toInt())

        if (accessibilityEnabled) {
            dotAccessibility.backgroundTintList = successColor
            txtAccessibility.text = "Ativada"
            txtAccessibility.setTextColor(0xFF10b981.toInt())
            btnAccessibility.text = "✓ Acessibilidade Ativa"
            btnAccessibility.isEnabled = false
        } else {
            dotAccessibility.backgroundTintList = dangerColor
            txtAccessibility.text = "Desativada"
            txtAccessibility.setTextColor(0xFF64748b.toInt())
            btnAccessibility.text = "Ativar Acessibilidade"
            btnAccessibility.isEnabled = true
        }

        val notificationEnabled = isNotificationServiceEnabled()
        if (notificationEnabled) {
            dotNotification.backgroundTintList = successColor
            txtNotification.text = "Ativado"
            txtNotification.setTextColor(0xFF10b981.toInt())
            btnNotification.text = "✓ Notificações Ativas"
            btnNotification.isEnabled = false
        } else {
            dotNotification.backgroundTintList = dangerColor
            txtNotification.text = "Desativado"
            txtNotification.setTextColor(0xFF64748b.toInt())
            btnNotification.text = "Ativar Acesso Notificações"
            btnNotification.isEnabled = true
        }

        val isConnected = AgentService.isConnected
        if (isConnected) {
            dotServer.backgroundTintList = successColor
            txtServer.text = "Conectado"
            txtServer.setTextColor(0xFF10b981.toInt())
        } else {
            dotServer.backgroundTintList = dangerColor
            txtServer.text = "Desconectado"
            txtServer.setTextColor(0xFFef4444.toInt())
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
