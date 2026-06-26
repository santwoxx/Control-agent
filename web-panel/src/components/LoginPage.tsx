"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError("Erro ao fazer login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">
      {/* Animated background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="login-card glass-card">
        {/* Logo / Brand */}
        <div className="login-brand">
          <div className="login-logo">
            <Image
              src="/logo.png"
              alt="Control Agent Logo"
              width={64}
              height={64}
              style={{ borderRadius: 16, objectFit: "cover" }}
              priority
            />
          </div>
          <h1 className="login-title gradient-text">Control Agent</h1>
          <p className="login-subtitle">
            Sistema de Controle e Automação Android
          </p>
        </div>

        {/* Features preview */}
        <div className="login-features">
          <div className="login-feature">
            <span className="feature-icon">📱</span>
            <span>Controle remoto completo</span>
          </div>
          <div className="login-feature">
            <span className="feature-icon">🤖</span>
            <span>Chatbot e auto-resposta</span>
          </div>
          <div className="login-feature">
            <span className="feature-icon">📊</span>
            <span>Dashboard em tempo real</span>
          </div>
          <div className="login-feature">
            <span className="feature-icon">🔒</span>
            <span>Acesso seguro e privado</span>
          </div>
        </div>

        {/* Divider */}
        <div className="login-divider">
          <span>Entre com sua conta</span>
        </div>

        {/* Google Login Button */}
        <button
          id="btn-google-login"
          className="btn-google"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <span className="btn-spinner" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {loading ? "Entrando..." : "Continuar com Google"}
        </button>

        {error && (
          <div className="login-error">
            ⚠️ {error}
          </div>
        )}

        {/* Footer */}
        <p className="login-footer">
          Ao entrar, você concorda com os termos de uso.<br />
          Seus dados são protegidos pelo Firebase e Google.
        </p>
      </div>

      <style jsx>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--background);
          position: relative;
          overflow: hidden;
          padding: 20px;
        }

        /* Animated orbs */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.15;
          animation: floatOrb 8s ease-in-out infinite;
          pointer-events: none;
        }
        .orb-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, #7c3aed, transparent);
          top: -150px; left: -150px;
          animation-delay: 0s;
        }
        .orb-2 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, #06b6d4, transparent);
          bottom: -100px; right: -100px;
          animation-delay: -3s;
        }
        .orb-3 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, #10b981, transparent);
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: -6s;
        }
        @keyframes floatOrb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 30px) scale(0.95); }
        }

        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 440px;
          padding: 48px 40px;
          display: flex;
          flex-direction: column;
          gap: 28px;
          border: 1px solid rgba(124, 58, 237, 0.3);
          box-shadow: 0 0 60px rgba(124, 58, 237, 0.1), 0 20px 60px rgba(0,0,0,0.4);
          animation: slideUp 0.5s ease;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .login-brand {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .login-logo {
          width: 72px; height: 72px;
          background: linear-gradient(135deg, #7c3aed22, #06b6d422);
          border: 1px solid rgba(124, 58, 237, 0.4);
          border-radius: 20px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 30px rgba(124, 58, 237, 0.2);
        }
        .login-logo-icon { font-size: 32px; }

        .login-title {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .login-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.5;
        }

        .login-features {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .login-feature {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: rgba(124, 58, 237, 0.05);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 12px;
          color: var(--text-muted);
          transition: all 0.2s;
        }
        .login-feature:hover {
          background: rgba(124, 58, 237, 0.1);
          border-color: rgba(124, 58, 237, 0.3);
          color: var(--text);
        }
        .feature-icon { font-size: 16px; }

        .login-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--text-muted);
          font-size: 12px;
        }
        .login-divider::before,
        .login-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border);
        }

        .btn-google {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 14px 24px;
          border-radius: 12px;
          border: 1px solid rgba(124, 58, 237, 0.4);
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(6, 182, 212, 0.1));
          color: var(--text);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 20px rgba(124, 58, 237, 0.15);
          font-family: inherit;
        }
        .btn-google:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.25), rgba(6, 182, 212, 0.2));
          border-color: rgba(124, 58, 237, 0.7);
          box-shadow: 0 6px 30px rgba(124, 58, 237, 0.3);
          transform: translateY(-1px);
        }
        .btn-google:active:not(:disabled) {
          transform: translateY(0);
        }
        .btn-google:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-spinner {
          width: 20px; height: 20px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .login-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 13px;
          color: #fca5a5;
          text-align: center;
        }

        .login-footer {
          text-align: center;
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
