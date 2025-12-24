"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import Link from "next/link";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔐 sesión  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
    });
    return () => unsub();
  }, []);

  // 🔐 solo admins
  useEffect(() => {
    if (!user) return;

    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data() || {};
const okAdmin = d.isAdmin === true || d.role === "admin";
if (!snap.exists() || !okAdmin) {

        alert("Acceso denegado");
        window.location.href = "/";
      }
    });

    return () => unsub();
  }, [user]);

  // 👥 listar usuarios
  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function toggleBan(uid, banned) {
    await updateDoc(doc(db, "users", uid), {
      banned: !banned,
    });
  }

  if (!user || loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Cargando panel admin...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#02060b] text-white p-6">
      <h1 className="text-2xl font-bold mb-4">Panel de Administración</h1>

      <div className="space-y-3">
        {users.map((u) => (
          <div
            key={u.uid}
            className="flex items-center justify-between border border-white/10 rounded-lg p-3"
          >
            <div>
              <p className="font-semibold">{u.displayName || "Usuario"}</p>
              <p className="text-xs text-gray-400">{u.uid}</p>
              {u.isAdmin && (
                <span className="text-xs text-emerald-400">ADMIN</span>
              )}
              {u.banned && (
                <span className="ml-2 text-xs text-red-400">BANEADO</span>
              )}
            </div>

            <div className="flex gap-2">
              <Link
                href={`/perfil/${u.uid}`}
                className="px-2 py-1 text-xs rounded bg-gray-700"
              >
                Ver perfil
              </Link>

              {!u.isAdmin && (
                <button
                  onClick={() => toggleBan(u.uid, u.banned)}
                  className={`px-2 py-1 text-xs rounded ${
                    u.banned ? "bg-emerald-600" : "bg-red-600"
                  }`}
                >
                  {u.banned ? "Unban" : "Ban"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
