"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import DeviceSidebar from "@/components/DeviceSidebar";
import ControlPanel from "@/components/ControlPanel";
import AuthGuard from "@/components/AuthGuard";
import { useSocket } from "@/context/SocketContext";
import { useAuth } from "@/context/AuthContext";

export default function HomePage() {
  const { socket, selectedDevice } = useSocket();
  const { user, logout, isAdmin } = useAuth();
  const [foregroundAutoReply, setForegroundAutoReply] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (!socket || !selectedDevice) return;
    socket.emit("get_agent_settings");
    const handleSettings = (settings: any) => {
      setForegroundAutoReply(!!settings.foregroundAutoReply);
    };
    socket.on("agent_settings_updated", handleSettings);
    return () => { socket.off("agent_settings_updated", handleSettings); };
  }, [socket, selectedDevice]);

  const toggleForegroundAutoReply = () => {
    if (!socket || !selectedDevice) return;
    const nextVal = !foregroundAutoReply;
    setForegroundAutoReply(nextVal);
    socket.emit("update_agent_settings", { foregroundAutoReply: nextVal });
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
  };

  return (
    <AuthGuard>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <DeviceSidebar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Top Bar */}
          <div className="topbar">
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
              {/* Logo */}
              <Image
                src="/logo.png"
                alt="Control Agent"
                width={30}
                height={30}
                style={{ borderRadius: 8, objectFit: "cover" }}
              />
              <div>
                <span className="gradient-text" style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.3px" }}>
                  Control Agent
                </span>
                {selectedDevice && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
                    — {selectedDevice}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Foreground Auto-Reply Toggle */}
              {selectedDevice && (
                <button
                  onClick={toggleForegroundAutoReply}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: foregroundAutoReply ? "rgba(16,185,129,0.15)" : "rgba(100,116,139,0.1)",
                    border: "1px solid " + (foregroundAutoReply ? "var(--success)" : "var(--border)"),
                    color: foregroundAutoReply ? "var(--success)" : "var(--text-muted)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    fontFamily: "inherit",
                  }}
                >
                  🤖 Atendimento em Tela: {foregroundAutoReply ? "LIGADO" : "DESLIGADO"}
                </button>
              )}

              <span style={{
                fontSize: 12, color: "var(--text-muted)",
                background: "var(--surface-2)", padding: "4px 10px",
                borderRadius: 6, border: "1px solid var(--border)"
              }}>
                Controle Manual
              </span>

              {/* User Avatar Menu */}
              {user && (
                <div style={{ position: "relative" }}>
                  <button
                    id="btn-user-menu"
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "rgba(124,58,237,0.1)",
                      border: "1px solid rgba(124,58,237,0.3)",
                      borderRadius: 8, padding: "4px 10px 4px 4px",
                      cursor: "pointer", transition: "all 0.2s",
                      color: "var(--text)", fontFamily: "inherit",
                    }}
                  >
                    {user.photoURL ? (
                      <Image
                        src={user.photoURL}
                        alt="Avatar"
                        width={28}
                        height={28}
                        style={{ borderRadius: "50%", border: "1px solid rgba(124,58,237,0.4)" }}
                      />
                    ) : (
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: "linear-gradient(135deg,#7c3aed,#06b6d4)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {user.displayName?.[0] || user.email?.[0] || "U"}
                      </div>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 500, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.displayName?.split(" ")[0] || "Usuário"}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▼</span>
                  </button>

                  {showUserMenu && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 8px)", right: 0,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 10, padding: 8, minWidth: 200,
                      boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
                      zIndex: 1000, animation: "slideDown 0.15s ease",
                    }}>
                      {/* User info */}
                      <div style={{ padding: "8px 10px 12px", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                            {user.displayName || "Usuário"}
                          </p>
                          {isAdmin && (
                            <span style={{
                              background: "linear-gradient(135deg,rgba(251,191,36,0.2),rgba(245,158,11,0.1))",
                              border: "1px solid rgba(251,191,36,0.4)",
                              borderRadius: 4, padding: "1px 5px",
                              fontSize: 9, fontWeight: 700,
                              color: "#fbbf24", letterSpacing: "0.05em",
                            }}>
                              👑 ADMIN
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {user.email}
                        </p>
                        <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <div style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
                            borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "var(--success)",
                          }}>
                            🔒 Google
                          </div>
                          {isAdmin && (
                            <div style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
                              borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "#fbbf24",
                            }}>
                              ⚡ Acesso Total
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Menu items */}
                      <button
                        id="btn-logout"
                        onClick={handleLogout}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 8,
                          padding: "10px", borderRadius: 6, border: "none",
                          background: "transparent", color: "var(--danger)",
                          fontSize: 13, cursor: "pointer", transition: "background 0.15s",
                          fontFamily: "inherit", marginTop: 4,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.1)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        🚪 Sair da conta
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Close menu on outside click */}
          {showUserMenu && (
            <div
              onClick={() => setShowUserMenu(false)}
              style={{ position: "fixed", inset: 0, zIndex: 999 }}
            />
          )}

          {/* Main Content */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
            <ControlPanel />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
