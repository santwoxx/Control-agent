"use client";

import { useEffect, useState, useRef } from "react";
import { useSocket } from "@/context/SocketContext";
import QRCode from "qrcode";

export default function QrConnect() {
  const { socket, isConnected } = useSocket();
  const [addresses, setAddresses] = useState<string[]>([]);
  const [selectedIp, setSelectedIp] = useState<string>("");
  const [port, setPort] = useState<number>(3002);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.emit("get_server_info");
    const handler = (data: { addresses: string[]; port?: number; isCloud?: boolean }) => {
      if (data.isCloud) {
        setAddresses(data.addresses);
        setSelectedIp(data.addresses[0] || "");
      } else {
        const p = data.port || 3001;
        setPort(p);
        setAddresses(data.addresses);
        
        // Escolher o melhor IP inicial
        let bestIp = "127.0.0.1";
        if (data.addresses.length > 0) {
          bestIp = data.addresses[0];
          
          if (typeof window !== "undefined") {
            const hostname = window.location.hostname;
            
            // 1. Se o hostname atual está na lista de IPs do servidor, usa ele
            if (data.addresses.includes(hostname)) {
              bestIp = hostname;
            } else {
              // 2. Se o hostname é um IP, tenta achar um na mesma subrede (ex: 192.168.1.X)
              const hostnameParts = hostname.split('.');
              if (hostnameParts.length === 4) {
                const subnetIp = data.addresses.find(addr => {
                  const addrParts = addr.split('.');
                  return addrParts.length === 4 && 
                         addrParts[0] === hostnameParts[0] && 
                         addrParts[1] === hostnameParts[1];
                });
                if (subnetIp) {
                  bestIp = subnetIp;
                }
              }
            }
          }
          
          // 3. Se ainda for o primeiro IP, mas ele parecer um IP virtual comum, e houver outros, tenta priorizar um IP físico real (ex: 192.168.0.x ou 192.168.1.x)
          if (bestIp === data.addresses[0] && data.addresses.length > 1) {
            const isVirtual = (ip: string) => 
              ip.startsWith("192.168.56.") || // VirtualBox
              ip.startsWith("192.168.99.") || // Docker
              ip.startsWith("169.254.") ||    // Link-local
              ip.startsWith("172.17.") ||     // Docker default
              ip.startsWith("172.18.");       // WSL/Docker
            
            if (isVirtual(bestIp)) {
              const physicalIp = data.addresses.find(ip => !isVirtual(ip));
              if (physicalIp) {
                bestIp = physicalIp;
              }
            }
          }
        }
        
        setSelectedIp(bestIp);
      }
    };
    
    socket.on("server_info", handler);
    return () => { socket.off("server_info", handler); };
  }, [socket, isConnected]);

  useEffect(() => {
    if (!selectedIp) return;
    const wsUrl = selectedIp.startsWith("ws://") || selectedIp.startsWith("wss://")
      ? selectedIp
      : `ws://${selectedIp}:${port}`;
      
    QRCode.toDataURL(wsUrl, {
      width: 200,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(err => console.error("Erro ao gerar QR Code:", err));
  }, [selectedIp, port]);

  const displayUrl = selectedIp.startsWith("ws://") || selectedIp.startsWith("wss://")
    ? selectedIp
    : `ws://${selectedIp}:${port}`;

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
              
              {addresses.length > 1 && !selectedIp.startsWith("ws") && (
                <div style={{ marginTop: 10, textAlign: "left" }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                    Selecione o IP do seu WiFi:
                  </label>
                  <select
                    value={selectedIp}
                    onChange={(e) => setSelectedIp(e.target.value)}
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      color: "var(--text)",
                      fontSize: 11,
                      padding: "4px 8px",
                      width: "100%",
                      outline: "none",
                    }}
                  >
                    {addresses.map((addr) => (
                      <option key={addr} value={addr}>
                        {addr}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                {displayUrl}
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
