package com.remotecontrol.agent.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.remotecontrol.agent.service.AgentService

/**
 * BootReceiver — auto-start AgentService after device reboot
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            context.startForegroundService(Intent(context, AgentService::class.java))
        }
    }
}
