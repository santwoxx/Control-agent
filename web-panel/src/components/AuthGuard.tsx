"use client";

import { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import LoginPage from "@/components/LoginPage";

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * AuthGuard — Verifica autenticação Firebase antes de renderizar o dashboard.
 * - Carregando → mostra splash screen animada
 * - Não autenticado → LoginPage
 * - Autenticado → libera dashboard (admins têm acesso total)
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          animation: "fadeIn 0.3s ease",
        }}>
          <div style={{
            width: 72, height: 72,
            background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.1))",
            border: "1px solid rgba(124,58,237,0.4)",
            borderRadius: 20,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32,
            animation: "logoPulse 1.5s ease-in-out infinite",
            boxShadow: "0 0 30px rgba(124,58,237,0.2)",
          }}>
            ⚡
          </div>
          <p className="gradient-text" style={{ fontWeight: 700, fontSize: 18 }}>
            Control Agent
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Verificando sessão...
          </p>
        </div>
        <style jsx>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes logoPulse {
            0%, 100% { box-shadow: 0 0 20px rgba(124,58,237,0.2); }
            50%       { box-shadow: 0 0 40px rgba(124,58,237,0.5); }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
