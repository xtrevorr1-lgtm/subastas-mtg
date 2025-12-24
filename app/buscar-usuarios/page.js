"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";
import { db } from "../firebase";
import Link from "next/link";

export default function BuscarUsuariosPage() {
  const [search, setSearch] = useState("");
  const [resultados, setResultados] = useState([]);

  useEffect(() => {
    if (!search.trim()) {
      setResultados([]);
      return;
    }

    const texto = search.toLowerCase();

    const qUsers = query(
      collection(db, "users"),
      where("searchName", ">=", texto),
      where("searchName", "<=", texto + "\uf8ff"),
      limit(20)
    );

    const unsub = onSnapshot(qUsers, (snap) => {
      setResultados(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });

    return () => unsub();
  }, [search]);

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100 px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Buscar usuarios</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Escribe un nombre..."
        className="w-full px-3 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm mb-6"
      />

      {resultados.length === 0 && search.trim() !== "" ? (
        <p className="text-gray-400">No se encontraron usuarios.</p>
      ) : null}

      <div className="flex flex-col gap-4">
        {resultados.map((u) => (
          <Link
            key={u.id}
            href={`/perfil/${u.id}`}

            className="flex items-center gap-3 p-3 bg-[#111827] border border-gray-700 rounded-lg hover:bg-[#1a2332] transition"
          >
            <img
            src={u.avatarUrl || u.photoURL || "/default-avatar.png"}
            className="w-12 h-12 rounded-full object-cover border border-white/20"
            />

            <span className="font-semibold">{u.displayName || "Usuario"}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
