"use client";

import Image from "next/image";
import { useSocket } from "@/context/SocketContext";
import QrConnect from "./QrConnect";

export default function DeviceSidebar() {
  const { devices, selectedDevice, setSelectedDevice, isConnected } = useSocket();

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="topbar">
        <Image src="/logo.png" alt="Control Agent" width={28} height={28} style={{ borderRadius: 6, objectFit: "cover" }} />
        <span className="gradient-text" style={{ fontWeight: 700, fontSize: 15 }}>Control Agent</span>
      </div>

      {/* Connection status */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
          <div className={`status-dot ${isConnected ? "online" : "offline"}`} />
          Servidor: {isConnected ? "Conectado" : "Desconectado"}
        </div>
      </div>

      {/* Device list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
        <p style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 8px 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Dispositivos ({devices.length})
        </p>
        {devices.length === 0 ? (
          <div style={{ padding: "20px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📱</div>
            Nenhum dispositivo conectado
          </div>
        ) : (
          devices.map((device) => (
            <button
              key={device.id}
              onClick={() => setSelectedDevice(device.id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${selectedDevice === device.id ? "var(--accent)" : "transparent"}`,
                background: selectedDevice === device.id ? "rgba(124,58,237,0.1)" : "transparent",
                color: "var(--text)",
                cursor: "pointer",
                marginBottom: 4,
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="status-dot online" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{device.model || device.id}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Android {device.androidOS || "?"} · 🔋{device.battery ?? "?"}%
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* QR Code Connect */}
      <QrConnect />

      {/* Footer */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
        v1.0.0 · RemoteControl
      </div>
    </aside>
  );
}
