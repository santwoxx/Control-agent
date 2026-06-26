package com.remotecontrol.agent.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import com.remotecontrol.agent.service.AgentService

/**
 * RemoteAccessibilityService
 *
 * This service allows gesture injection (tap, swipe, scroll) and
 * action injection (press back, home, recents, type text) without root.
 *
 * It must be enabled manually by the user in:
 * Settings → Accessibility → RemoteControl Agent → Enable
 */
class RemoteAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "RemoteAccessibility"
        @Volatile
        var instance: RemoteAccessibilityService? = null
            private set

        @Volatile
        var pendingReplyNumber: String? = null
        @Volatile
        var pendingReplyText: String? = null
        @Volatile
        var foregroundAutoReplyEnabled: Boolean = false
        @Volatile
        var lastProcessedMessageSignature: String? = null
        @Volatile
        var shouldCloseAppAfterReply: Boolean = true
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "AccessibilityService connected ✓")
        // Notify AgentService that accessibility is ready
        sendBroadcast(Intent("com.remotecontrol.ACCESSIBILITY_CONNECTED"))
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString()
        if (pkg == "com.whatsapp" || pkg == "com.whatsapp.w4b") {
            if (pendingReplyText != null) {
                checkAndExecutePendingReply()
            } else if (foregroundAutoReplyEnabled && event != null) {
                handleForegroundAutoReply(event)
            }
        }
    }

    private fun checkAndExecutePendingReply() {
        val replyText = pendingReplyText ?: return
        val rootNode = rootInActiveWindow ?: return

        // 1. Tenta encontrar a caixa de texto (input de mensagem) do WhatsApp ou WhatsApp Business
        val inputs = rootNode.findAccessibilityNodeInfosByViewId("com.whatsapp:id/entry")
        val businessInputs = rootNode.findAccessibilityNodeInfosByViewId("com.whatsapp.w4b:id/entry")
        
        val activeInput = when {
            inputs != null && inputs.isNotEmpty() -> inputs[0]
            businessInputs != null && businessInputs.isNotEmpty() -> businessInputs[0]
            else -> null
        }

        if (activeInput != null) {
            // Garante foco na caixa de texto
            if (!activeInput.isFocused) {
                activeInput.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_FOCUS)
            }
            
            // Digita o texto
            val args = Bundle().apply {
                putCharSequence(
                    android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    replyText
                )
            }
            val textTyped = activeInput.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            
            if (textTyped) {
                Log.i(TAG, "Sucesso ao digitar o texto pendente")
                
                // Aguarda um pequeno delay e clica em enviar
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    val clicked = clickWhatsAppSendButton()
                    if (clicked) {
                        Log.i(TAG, "Mensagem enviada com sucesso via acessibilidade!")
                        // Limpa os estados pendentes
                        pendingReplyText = null
                        pendingReplyNumber = null
                        
                        // Retorna para a tela anterior (fecha o WhatsApp) se necessário
                        if (shouldCloseAppAfterReply) {
                            pressBack()
                            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                                pressBack()
                            }, 500)
                        }
                    }
                }, 150)
            } else {
                Log.w(TAG, "Falhou ao digitar o texto na caixa do WhatsApp")
            }
        }
    }

    private var lastScanTime = 0L

    private fun handleForegroundAutoReply(event: AccessibilityEvent) {
        val now = System.currentTimeMillis()
        if (now - lastScanTime < 1500) return
        lastScanTime = now

        val rootNode = rootInActiveWindow ?: return
        val pkg = event.packageName?.toString() ?: return

        // Detecta se estamos na tela de conversa ou na lista de conversas
        // 1. Caso: Tela de conversa aberta
        val chatTitleNode = rootNode.findAccessibilityNodeInfosByViewId("com.whatsapp:id/conversation_contact_name")
            ?: rootNode.findAccessibilityNodeInfosByViewId("com.whatsapp.w4b:id/conversation_contact_name")
            ?: rootNode.findAccessibilityNodeInfosByViewId("com.whatsapp:id/chat_name")
            ?: rootNode.findAccessibilityNodeInfosByViewId("com.whatsapp.w4b:id/chat_name")

        if (chatTitleNode != null && chatTitleNode.isNotEmpty()) {
            val contactName = chatTitleNode[0].text?.toString()
            if (!contactName.isNullOrEmpty()) {
                // Encontra as bolhas de texto da conversa
                val textNodes = rootNode.findAccessibilityNodeInfosByViewId("com.whatsapp:id/message_text")
                    ?: rootNode.findAccessibilityNodeInfosByViewId("com.whatsapp.w4b:id/message_text")
                
                if (textNodes != null && textNodes.isNotEmpty()) {
                    // Pega o último nó de texto (o mais abaixo na tela)
                    val lastNode = textNodes.last()
                    val msgText = lastNode.text?.toString()
                    if (!msgText.isNullOrEmpty()) {
                        // Verifica se é uma mensagem recebida (alinhada à esquerda da tela)
                        val rect = android.graphics.Rect()
                        lastNode.getBoundsInScreen(rect)
                        val isIncoming = rect.right < resources.displayMetrics.widthPixels * 0.8

                        if (isIncoming) {
                            val signature = "${contactName}_${msgText}"
                            if (signature != lastProcessedMessageSignature) {
                                lastProcessedMessageSignature = signature
                                Log.i(TAG, "Nova mensagem recebida no chat em primeiro plano: [$contactName]: $msgText")
                                
                                // Configura para NÃO fechar o WhatsApp após a resposta
                                shouldCloseAppAfterReply = false
                                
                                // Envia para o backend para avaliação do chatbot
                                relayForegroundMessage(contactName, msgText, pkg == "com.whatsapp.w4b")
                            }
                        }
                    }
                }
            }
        } else {
            // 2. Caso: Lista de conversas aberta. Procura indicador de mensagens não lidas
            val unreadNodes = rootNode.findAccessibilityNodeInfosByViewId("com.whatsapp:id/conversations_row_unread_indicator")
                ?: rootNode.findAccessibilityNodeInfosByViewId("com.whatsapp.w4b:id/conversations_row_unread_indicator")

            if (unreadNodes != null && unreadNodes.isNotEmpty()) {
                // Clica na primeira linha com mensagens não lidas
                val firstUnread = unreadNodes[0]
                
                // Sobe a árvore para achar o item clicável da linha
                var parent = firstUnread.parent
                while (parent != null && !parent.isClickable) {
                    parent = parent.parent
                }
                
                if (parent != null && parent.isClickable) {
                    Log.i(TAG, "Conversa não lida detectada. Clicando para abrir...")
                    parent.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK)
                }
            }
        }
    }

    private fun relayForegroundMessage(contactName: String, messageText: String, isBusiness: Boolean) {
        try {
            val app = if (isBusiness) "WhatsApp Business" else "WhatsApp"
            val msg = org.json.JSONObject().apply {
                put("event", "message_received")
                put("app", app)
                put("sender", contactName)
                put("message", messageText)
                put("timestamp", System.currentTimeMillis())
            }
            AgentService.instance?.sendWsMessage(msg.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Error relaying foreground message: ${e.message}")
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "AccessibilityService interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.i(TAG, "AccessibilityService destroyed")
    }

    // ─────────────────────────────────────────────────────────────────
    // Gesture Actions
    // ─────────────────────────────────────────────────────────────────

    /** Simulate a single tap at (x, y) */
    fun tap(x: Float, y: Float) {
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100))
            .build()
        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription) {
                Log.d(TAG, "TAP completed at ($x, $y)")
            }
            override fun onCancelled(gestureDescription: GestureDescription) {
                Log.w(TAG, "TAP cancelled at ($x, $y)")
            }
        }, null)
    }

    /** Simulate swipe from (x1,y1) to (x2,y2) over durationMs */
    fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long = 400) {
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        dispatchGesture(gesture, null, null)
        Log.d(TAG, "SWIPE from ($x1,$y1) to ($x2,$y2)")
    }

    /** Scroll up by swiping from bottom to top in the center of screen */
    fun scrollUp() = swipe(540f, 1400f, 540f, 600f)

    /** Scroll down */
    fun scrollDown() = swipe(540f, 600f, 540f, 1400f)

    /** Swipe left (next page) */
    fun swipeLeft() = swipe(900f, 1000f, 200f, 1000f)

    /** Swipe right (previous page) */
    fun swipeRight() = swipe(200f, 1000f, 900f, 1000f)

    // ─────────────────────────────────────────────────────────────────
    // System Global Actions
    // ─────────────────────────────────────────────────────────────────

    fun pressBack() {
        performGlobalAction(GLOBAL_ACTION_BACK)
        Log.d(TAG, "ACTION: BACK")
    }

    fun pressHome() {
        performGlobalAction(GLOBAL_ACTION_HOME)
        Log.d(TAG, "ACTION: HOME")
    }

    fun pressRecents() {
        performGlobalAction(GLOBAL_ACTION_RECENTS)
        Log.d(TAG, "ACTION: RECENTS")
    }

    fun pressNotifications() {
        performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
        Log.d(TAG, "ACTION: NOTIFICATIONS")
    }

    fun lockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
            Log.d(TAG, "ACTION: LOCK_SCREEN")
        } else {
            performGlobalAction(GLOBAL_ACTION_POWER_DIALOG)
            Log.d(TAG, "ACTION: POWER_DIALOG (fallback)")
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Text Input
    // ─────────────────────────────────────────────────────────────────

    /** Type text into the currently focused field */
    fun typeText(text: String) {
        val node = rootInActiveWindow ?: run {
            Log.w(TAG, "typeText: no active window")
            return
        }
        // Find first editable node
        fun findFocusedEditable(node: android.view.accessibility.AccessibilityNodeInfo?): android.view.accessibility.AccessibilityNodeInfo? {
            if (node == null) return null
            if (node.isEditable && node.isFocused) return node
            for (i in 0 until node.childCount) {
                val child = node.getChild(i)
                val result = findFocusedEditable(child)
                if (result != null) return result
            }
            return null
        }
        val editableNode = findFocusedEditable(node)
        if (editableNode != null) {
            val args = Bundle().apply {
                putCharSequence(
                    android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    text
                )
            }
            editableNode.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            Log.d(TAG, "typeText: set text='$text'")
        } else {
            Log.w(TAG, "typeText: no focused editable node found")
        }
    }

    /**
     * Procura o botão de enviar do WhatsApp na árvore de componentes e clica nele.
     * Retorna true se o clique for bem sucedido.
     */
    fun clickWhatsAppSendButton(): Boolean {
        val rootNode = rootInActiveWindow ?: return false

        // 1. Tenta pelos IDs de recurso conhecidos
        val sendIds = listOf(
            "com.whatsapp:id/send",
            "com.whatsapp:id/fab",
            "com.whatsapp.w4b:id/send",
            "com.whatsapp.w4b:id/fab"
        )
        for (id in sendIds) {
            val nodes = rootNode.findAccessibilityNodeInfosByViewId(id)
            if (nodes != null && nodes.isNotEmpty()) {
                val node = nodes[0]
                if (node.isClickable) {
                    node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK)
                    Log.i(TAG, "Clicked WhatsApp send button by Resource ID: $id")
                    return true
                }
                // Tenta clicar no pai se o filho não for clicável
                val parent = node.parent
                if (parent != null && parent.isClickable) {
                    parent.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK)
                    Log.i(TAG, "Clicked WhatsApp send button parent by Resource ID: $id")
                    return true
                }
            }
        }

        // 2. Tenta pela descrição de conteúdo (Fallbacks Português/Inglês)
        fun findSendButtonByDesc(node: android.view.accessibility.AccessibilityNodeInfo?): android.view.accessibility.AccessibilityNodeInfo? {
            if (node == null) return null
            val desc = node.contentDescription?.toString()
            if (desc != null && (desc.equals("Enviar", ignoreCase = true) || desc.equals("Send", ignoreCase = true))) {
                return node
            }
            for (i in 0 until node.childCount) {
                val child = node.getChild(i)
                val found = findSendButtonByDesc(child)
                if (found != null) return found
            }
            return null
        }

        val foundNode = findSendButtonByDesc(rootNode)
        if (foundNode != null) {
            if (foundNode.isClickable) {
                foundNode.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK)
                Log.i(TAG, "Clicked WhatsApp send button by Content Description")
                return true
            }
        }

        // 3. Fallback: procura ImageButton com ícone de enviar no rodapé da conversa
        fun findSendByClass(node: android.view.accessibility.AccessibilityNodeInfo?): android.view.accessibility.AccessibilityNodeInfo? {
            if (node == null) return null
            val cname = node.className?.toString() ?: ""
            if (cname.contains("ImageButton") || cname.contains("ImageView")) {
                val desc = node.contentDescription?.toString() ?: ""
                if (desc.contains("Enviar", ignoreCase = true) || desc.contains("Send", ignoreCase = true)) {
                    return node
                }
            }
            for (i in 0 until node.childCount) {
                val child = node.getChild(i)
                val found = findSendByClass(child)
                if (found != null) return found
            }
            return null
        }

        val imgNode = findSendByClass(rootNode)
        if (imgNode != null) {
            if (imgNode.isClickable) {
                imgNode.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK)
                Log.i(TAG, "Clicked WhatsApp send button by ImageButton class")
                return true
            }
        }

        Log.w(TAG, "WhatsApp send button not found on screen")
        return false
    }
}
