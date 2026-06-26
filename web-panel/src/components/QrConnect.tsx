"use client";

import { useEffect, useState, useRef } from "react";
import { useSocket } from "@/context/SocketContext";
import QRCode from "qrcode";

export default function QrConnect() {
  const { socket, isConnected } = useSocket();
  const [serverIp, setServerIp] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.emit("get_server_info");
    const handler = (data: { addresses: string[]; port: number }) => {
      const ip = data.addresses[0] || "127.0.0.1";
      setServerIp(ip);
      const wsUrl = `ws://${ip}:${data.port}`;
      QRCode.toDataURL(wsUrl, {
        width: 200,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(setQrDataUrl);
    };
    socket.on("server_info", handler);
    return () => { socket.off("server_info", handler); };
  }, [socket, isConnected]);

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          background: "none",
          border: "none",
          color: "var(--text)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: 16 }}>📲</span>
        Conectar App
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 16px 16px", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.4 }}>
            Escaneie o QR Code com o app Android para conectar automaticamente
          </p>

          {qrDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR Code de conexão"
                style={{
                  width: 180,
                  height: 180,
                  borderRadius: 12,
                  border: "2px solid var(--border)",
                  margin: "0 auto",
                  display: "block",
                }}
              />
              <div style={{
                marginTop: 10,
                background: "var(--surface-2)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}>
                ws://{serverIp}:3002
              </div>
              <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.3 }}>
                Certifique-se de que o celular está na mesma rede WiFi
              </p>
            </>
          ) : (
            <div style={{
              width: 180,
              height: 180,
              borderRadius: 12,
              border: "2px solid var(--border)",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: "var(--text-muted)",
            }}>
              {isConnected ? "Gerando QR Code..." : "Servidor desconectado"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
