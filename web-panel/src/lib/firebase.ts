// Firebase Client SDK — Configuração oficial do projeto control-agent
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDic9k4KK6w17_gKFDG69MXaWuIhsCd3us",
  authDomain: "control-agent-369cb.firebaseapp.com",
  projectId: "control-agent-369cb",
  storageBucket: "control-agent-369cb.firebasestorage.app",
  messagingSenderId: "872431957388",
  appId: "1:872431957388:web:960da5fea81315634c52a9",
  measurementId: "G-8C4WSKVR1J",
};

// Evita inicializar múltiplas instâncias (hot reload do Next.js)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Analytics só no browser
export const initAnalytics = async () => {
  if (await isSupported()) {
    return getAnalytics(app);
  }
  return null;
};

export default app;
