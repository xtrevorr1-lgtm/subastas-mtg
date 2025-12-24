"use client";

import { useEffect, useState } from "react";
import { auth } from "../app/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import MyProfileLink from "./MyProfileLink"; // 👈 IMPORTANTE

export default function AuthStatus() {
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setBusy(false);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      setBusy(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      window.location.reload(); // 🔥 fuerza que Next cargue bien la sesión
    } catch (err) {
      console.error(err);
      alert("Error al iniciar sesión: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      setBusy(true);
      await signOut(auth);
    } catch (err) {
      console.error(err);
      alert("Error al cerrar sesión: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  if (busy && !user) {
    return (
      <div className="text-xs text-gray-400">
        Cargando sesión...
      </div>
    );
  }

  if (!user) {
    return (
      <button
        onClick={handleLogin}
        className="px-3 py-1 rounded-md text-sm bg-violet-600 hover:bg-violet-700 text-white"
        disabled={busy}
      >
        Iniciar sesión con Google
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-gray-300 truncate max-w-[160px]">
        Hola,{" "}
        <MyProfileLink className="font-semibold" /> {/* 👈 AHORA ES UN LINK */}
      </span>

      <button
        onClick={handleLogout}
        className="px-2 py-1 rounded-md border border-gray-500 text-gray-200 hover:bg-gray-700 text-xs"
        disabled={busy}
      >
        Cerrar sesión
      </button>
    </div>
  );
}
