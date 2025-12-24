"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, onSnapshot, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import SubastaMiniCard from "../../components/SubastaMiniCard";

export default function MisParticipacionesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [subastas, setSubastas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Buscador
  const [search, setSearch] = useState("");

  const filtrarPorBusqueda = (lista) =>
    search.trim()
      ? lista.filter((s) =>
          s.titulo?.toLowerCase().includes(search.toLowerCase())
        )
      : lista;

  // Detectar sesión
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Cargar participaciones del usuario
useEffect(() => {
  if (!user) {
    setSubastas([]);
    setLoading(false);
    return;
  }

  setLoading(true);
  const uid = user.uid;

  const qRef = query(collection(db, "subastas"));

  const unsub = onSnapshot(qRef, async (snap) => {
    const now = Date.now();
    const resultados = [];

    for (const d of snap.docs) {
      const data = d.data();

      // Convertir finaliza
      let finalizaMs = null;
      if (data.finaliza?.toDate) finalizaMs = data.finaliza.toDate().getTime();
      else if (typeof data.finaliza === "number") finalizaMs = data.finaliza;

      const isClosed = data.status === "closed";
      const expired = finalizaMs && finalizaMs <= now;
      if (isClosed || expired) continue;

      // 🔥 PARTICIPÓ SI:
      // 1) aparece en participantes
      const participo =
        data.participantes &&
        typeof data.participantes === "object" &&
        data.participantes[uid];

      if (participo) {
       const vasGanando = data.ultimoPostorUid === uid;

resultados.push({
  id: d.id,
  ...data,
  finaliza: finalizaMs,
  vasGanando,  // 🔥 NUEVO
});

      }
    }

    setSubastas(resultados);
    setLoading(false);
  });

  return () => unsub();
}, [user]);




  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  const listaFiltrada = filtrarPorBusqueda(subastas);

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* HEADER */}
        <header className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#02060b]/95 backdrop-blur">
          <h1 className="text-2xl font-bold">Mis participaciones</h1>

          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600"
            >
              Volver al listado
            </Link>

            {user && (
              <>
                <span className="text-gray-300">
                  Hola,{" "}
                  <span className="font-semibold">
                    {user.displayName || user.email}
                  </span>
                </span>

                <button
                  onClick={handleLogout}
                  className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600"
                >
                  Cerrar sesión
                </button>
              </>
            )}
          </div>
        </header>

        {/* Buscador */}
        <div className="my-4 max-w-md">
          <input
            type="text"
            placeholder="Buscar subastas donde participas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm"
          />
        </div>

        {/* Lista */}
        {loading ? (
          <p className="text-gray-300 mt-4">Cargando...</p>
        ) : listaFiltrada.length === 0 ? (
          <p className="text-gray-400 mt-4">
            No estás participando en ninguna subasta activa.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
            {listaFiltrada.map((a) => (
              <SubastaMiniCard key={a.id} subasta={a} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
