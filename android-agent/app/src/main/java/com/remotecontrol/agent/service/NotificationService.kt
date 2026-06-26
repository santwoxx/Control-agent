package com.remotecontrol.agent.service

import android.app.Notification
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * NotificationService
 *
 * Escuta notificações do sistema para interceptar mensagens recebidas
 * do WhatsApp e enviar respostas automáticas em background (Quick Reply).
 */
class NotificationService : NotificationListenerService() {

    companion object {
        private const val TAG = "NotificationService"
        @Volatile
        var instance: NotificationService? = null
            private set
    }

    // Armazena as notificações ativas indexadas pelo nome do remetente e aplicativo ("Remetente|Aplicativo")
    private val activeNotifications = mutableMapOf<String, StatusBarNotification>()

    private fun getAppNameFromPackage(packageName: String): String? {
        return when (packageName) {
            "com.whatsapp" -> "WhatsApp"
            "com.whatsapp.w4b" -> "WhatsApp Business"
            "org.telegram.messenger" -> "Telegram"
            "com.instagram.android" -> "Instagram"
            "com.facebook.orca" -> "Messenger"
            "com.google.android.apps.messaging", "com.android.mms" -> "SMS"
            else -> null
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "NotificationService criado")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.i(TAG, "NotificationService destruído")
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "NotificationListener conectado com sucesso ✓")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        val extras = sbn.notification.extras
        val sender = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""

        if (text.isBlank()) {
            return
        }

        // Repassa a notificação geral para o painel de controle
        AgentService.instance?.relayNotification(pkg, sender, text)

        val appName = getAppNameFromPackage(pkg)
        if (appName != null) {
            // Ignora mensagens de sistema, grupos vazios e notificações genéricas do WhatsApp/sistemas/backups
            val lowerSender = sender.lowercase()
            val lowerText = text.lowercase()
            val isSystemOrProgress = sender.isBlank() || 
                lowerSender == "whatsapp" || 
                lowerSender == appName.lowercase() ||
                lowerSender.contains("apagando") || 
                lowerSender.contains("restaurando") || 
                lowerSender.contains("backup") ||
                lowerSender.contains("fazendo") ||
                lowerText.contains("novas mensagens") ||
                lowerText == "procurando novas mensagens" ||
                (lowerText.contains(" de ") && lowerText.contains("%"))
                
            if (isSystemOrProgress) {
                return
            }

            // Armazena a notificação ativa com o formato "Nome|App"
            val key = "$sender|$appName"
            
            // Verifica se a nova notificação possui ações de resposta rápida (Quick Reply)
            val hasQuickReply = sbn.notification.actions?.any { action ->
                action.remoteInputs?.isNotEmpty() == true
            } == true

            val existingSbn = activeNotifications[key]
            val existingHasQuickReply = existingSbn?.notification?.actions?.any { action ->
                action.remoteInputs?.isNotEmpty() == true
            } == true

            // Só substitui se a nova tiver Quick Reply, ou se a antiga também não tiver (ou não existir)
            if (hasQuickReply || !existingHasQuickReply) {
                activeNotifications[key] = sbn
                Log.d(TAG, "Salva/Atualiza notificação para $key (hasQuickReply: $hasQuickReply)")
            } else {
                Log.d(TAG, "Ignorou atualização sem Quick Reply para manter cache ativo de $key")
            }

            // Repassa a mensagem recebida para o AgentService transmitir pelo WebSocket
            Log.i(TAG, "Mensagem do $appName recebida de $sender: $text")
            AgentService.instance?.relayIncomingMessage(appName, sender, text)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        val appName = getAppNameFromPackage(pkg)
        if (appName != null) {
            val extras = sbn.notification.extras
            val sender = extras.getString(Notification.EXTRA_TITLE) ?: return
            activeNotifications.remove("$sender|$appName")
        }
    }

    /**
     * Envia uma resposta em background usando a ação de resposta rápida da notificação
     */
    fun replyToNotification(sender: String, appName: String?, replyText: String): Boolean {
        val key = if (appName != null) {
            "$sender|$appName"
        } else {
            activeNotifications.keys.find { it.startsWith("$sender|") || it == sender } ?: ""
        }

        val sbn = activeNotifications[key] ?: run {
            Log.w(TAG, "Nenhuma notificação ativa encontrada para responder a: $sender (App: $appName)")
            return false
        }

        val actions = sbn.notification.actions ?: run {
            Log.w(TAG, "Nenhuma ação encontrada na notificação de: $sender")
            return false
        }

        for (action in actions) {
            val remoteInputs = action.remoteInputs ?: continue
            for (remoteInput in remoteInputs) {
                val intent = Intent()
                val bundle = Bundle().apply {
                    putCharSequence(remoteInput.resultKey, replyText)
                }
                android.app.RemoteInput.addResultsToIntent(arrayOf(remoteInput), intent, bundle)
                try {
                    action.actionIntent.send(applicationContext, 0, intent)
                    Log.i(TAG, "Resposta enviada em background com sucesso para $sender via $key")
                    return true
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao enviar a resposta rápida: ${e.message}")
                }
            }
        }

        Log.w(TAG, "Ação de resposta rápida (Quick Reply) não encontrada na notificação de $sender")
        return false
    }
}
