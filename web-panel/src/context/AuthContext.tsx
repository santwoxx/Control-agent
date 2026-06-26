"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  getIdToken,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

// ─── Lista de administradores/donos do sistema ─────────────────────────────────
// Esses emails têm acesso total ao painel sem nenhuma restrição.
const ADMIN_EMAILS: string[] = [
  "natands.dev@gmail.com",
  "brisasofc@gmail.com",
];

// Helpers exportados para uso em outros componentes
export const isAdminEmail = (email: string | null | undefined): boolean =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase());

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface AuthContextType {
  user: User | null;
  loading: boolean;
  idToken: string | null;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  idToken: null,
  isAdmin: false,
  signInWithGoogle: async () => {},
  logout: async () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let tokenInterval: NodeJS.Timeout | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Limpa intervalo anterior se existir
      if (tokenInterval) {
        clearInterval(tokenInterval);
        tokenInterval = null;
      }

      setUser(firebaseUser);

      if (firebaseUser) {
        // Verifica se é admin
        const admin = isAdminEmail(firebaseUser.email);
        setIsAdmin(admin);

        try {
          // Obtém o token JWT inicial
          const token = await getIdToken(firebaseUser, true);
          setIdToken(token);

          // Renova token a cada 55 min (tokens Firebase expiram em 60 min)
          tokenInterval = setInterval(async () => {
            try {
              const newToken = await getIdToken(firebaseUser, true);
              setIdToken(newToken);
            } catch {
              // Se falhar renovar, faz logout por segurança
              await signOut(auth);
            }
          }, 55 * 60 * 1000);
        } catch {
          setIdToken(null);
        }
      } else {
        setIdToken(null);
        setIsAdmin(false);
      }

      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (tokenInterval) clearInterval(tokenInterval);
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      googleProvider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code !== "auth/popup-closed-by-user") {
        console.error("Erro ao fazer login:", error);
        throw error;
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
    setIdToken(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, idToken, isAdmin, signInWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
