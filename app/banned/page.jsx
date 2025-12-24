"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "../firebase"; // <- AJUSTA si tu firebase está en otro lugar

export default function BannedPage() {
  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-[#050914] border border-white/10 rounded-2xl p-6 text-center">
        <h1 className="text-xl font-bold text-red-300">Cuenta suspendida</h1>

        <p className="mt-2 text-sm text-gray-300">
          Tu cuenta está baneada. No puedes usar la plataforma por el momento.
        </p>

        <div className="mt-5 flex gap-2 justify-center">
          <button
            type="button"
            onClick={async () => {
              await signOut(auth);
              window.location.href = "/";
            }}
            className="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-semibold"
          >
            Cerrar sesión
          </button>

        
        </div>
      </div>
    </main>
  );
}
