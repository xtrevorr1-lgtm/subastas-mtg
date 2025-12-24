"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { TERMS_VERSION } from "../lib/legal";

export default function AceptarTerminosPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(u);

      try {
        const refUser = doc(db, "users", u.uid);
        const snap = await getDoc(refUser);

        if (snap.exists()) {
          const data = snap.data();
          const accepted = !!data.termsAcceptedAt;
          const versionOk = data.termsVersion === TERMS_VERSION;

          // Si ya aceptó la versión actual → no debería estar aquí
          if (accepted && versionOk) {
            router.replace("/");
            return;
          }
        }
      } catch (e) {
        console.error("Error leyendo perfil legal:", e);
      }

      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  const handleAccept = async () => {
    setError("");
    if (!user) return;
    if (!checked) {
      setError("Debes aceptar los Términos y Condiciones para continuar.");
      return;
    }

    setSaving(true);
    try {
      const refUser = doc(db, "users", user.uid);

      // setDoc merge para NO pisar otros campos
      await setDoc(
        refUser,
        {
          termsAcceptedAt: serverTimestamp(),
          termsVersion: TERMS_VERSION,
        },
        { merge: true }
      );

      router.replace("/");
    } catch (e) {
      console.error("Error guardando aceptación:", e);
      setError("No se pudo guardar tu aceptación. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#02060b] text-gray-100 flex items-center justify-center">
        <p className="text-gray-300">Cargando...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#02060b] text-gray-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-[#050914] border border-white/10 rounded-2xl p-6">
          <p className="text-gray-300">
            Debes iniciar sesión para aceptar los Términos.
          </p>
          <Link href="/" className="inline-block mt-4 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm">
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100 px-4 py-8">
      <div className="max-w-2xl mx-auto bg-[#050914] border border-white/10 rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-2">Aceptar Términos y Condiciones</h1>
        <p className="text-sm text-gray-400 mb-4">
          Para continuar usando MTG Subastas Perú debes aceptar los Términos.
        </p>

        <div className="text-sm text-gray-300 mb-4">
          Lee aquí:{" "}
          <Link href="/terminos" className="text-emerald-400 hover:underline">
            /terminos
          </Link>
        </div>

        <label className="flex items-start gap-3 text-sm text-gray-200 bg-black/30 border border-white/10 rounded-xl p-4">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1"
          />
          <span>
            He leído y acepto los <Link href="/terminos" className="text-emerald-400 hover:underline">Términos y Condiciones</Link>.
          </span>
        </label>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <button
          onClick={handleAccept}
          disabled={saving}
          className={`mt-5 w-full py-2.5 rounded-full text-sm font-semibold transition ${
            saving ? "bg-gray-700 text-gray-400 cursor-wait" : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
        >
          {saving ? "Guardando..." : "Aceptar y continuar"}
        </button>
      </div>
    </main>
  );
}
