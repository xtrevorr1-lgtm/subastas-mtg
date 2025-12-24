"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import SubastaMiniCard from "../../components/SubastaMiniCard";

const PAGE_SIZE = 20; // cuántas subastas mostrar por “página visual”

export default function MisSubastasPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [subastas, setSubastas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("activas");

  // ⭐ Buscador
  const [search, setSearch] = useState("");

  // ⭐ Paginación visual
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Función de búsqueda
  const filtrarPorBusqueda = (lista) =>
    search.trim()
      ? lista.filter((s) =>
          s.titulo?.toLowerCase().includes(search.toLowerCase())
        )
      : lista;

  // Sesión
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Cargar subastas normales + programadas
  useEffect(() => {
    if (!user) {
      setSubastas([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // ------------------------
    // 1) Subastas normales
    // ------------------------
    const qSub = query(
      collection(db, "subastas"),
      where("vendedorUid", "==", user.uid)
    );

    const unsub1 = onSnapshot(
      qSub,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const data = d.data();

          let finalizaMs = null;
          if (data.finaliza?.toDate)
            finalizaMs = data.finaliza.toDate().getTime();
          else if (typeof data.finaliza === "number")
            finalizaMs = data.finaliza;

          return {
            id: d.id,
            ...data,
            finaliza: finalizaMs,
            source: "subastas",
          };
        });

        setSubastas((prev) => {
          const prevProg = prev.filter((p) => p.source === "programadas");
          return [...prevProg, ...arr];
        });

        setLoading(false);
      },
      () => setLoading(false)
    );

    // ------------------------
    // 2) Subastas programadas
    // ------------------------
    const qProg = query(
      collection(db, "programadas"),
      where("vendedorUid", "==", user.uid)
    );

    const unsub2 = onSnapshot(
      qProg,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const data = d.data();

          return {
            id: d.id,
            ...data,
            finaliza: data.startAt || null,
            status: "scheduled",
            source: "programadas",
          };
        });

        setSubastas((prev) => {
          const prevNormal = prev.filter((p) => p.source === "subastas");
          return [...prevNormal, ...arr];
        });

        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  const now = Date.now();

  // PROGRAMADAS
  const programadas = subastas
    .filter((s) => s.source === "programadas")
    .sort((a, b) => (b.finaliza || 0) - (a.finaliza || 0));

  // ACTIVAS
  const activas = subastas
    .filter((s) => {
      const expired = s.finaliza && s.finaliza <= now;
      return s.status === "active" && !expired;
    })
    .sort((a, b) => (a.finaliza || 0) - (b.finaliza || 0));

  // FINALIZADAS
  const finalizadas = subastas
    .filter((s) => {
      const expired = s.finaliza && s.finaliza <= now;
      return s.status === "closed" || expired;
    })
    .sort((a, b) => (b.finaliza || 0) - (a.finaliza || 0));

  // ⭐ APLICAR FILTRO PRINCIPAL
  let listaFiltrada = [];
  if (filter === "activas") listaFiltrada = activas;
  if (filter === "finalizadas") listaFiltrada = finalizadas;
  if (filter === "programadas") listaFiltrada = programadas;

  // ⭐ APLICAR BÚSQUEDA
  listaFiltrada = filtrarPorBusqueda(listaFiltrada);

  // ⭐ Paginación visual
  const listaPaginada = listaFiltrada.slice(0, visibleCount);
  const canLoadMore = visibleCount < listaFiltrada.length;

  // Reset de “Cargar más” cuando cambias filtro o búsqueda
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, search]);

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* HEADER */}
        <header className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#02060b]/95 backdrop-blur">
          <h1 className="text-2xl font-bold">Mis subastas</h1>

          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600"
            >
              Volver al listado
            </Link>

            <Link
              href="/chats"
              className="px-3 py-1 bg-sky-700 rounded hover:bg-sky-800"
            >
              Chats
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

        {/* FILTROS */}
        <div className="flex items-center gap-3 mt-6 mb-6">
          <button
            onClick={() => setFilter("activas")}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              filter === "activas"
                ? "bg-emerald-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Subastas activas
          </button>

          <button
            onClick={() => setFilter("finalizadas")}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              filter === "finalizadas"
                ? "bg-emerald-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Subastas finalizadas
          </button>

          <button
            onClick={() => setFilter("programadas")}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              filter === "programadas"
                ? "bg-emerald-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Subastas programadas
          </button>
        </div>

        {/* ⭐ BUSCADOR */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar mis subastas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm"
          />
        </div>

        {/* LISTA */}
        {loading ? (
          <p className="text-gray-300">Cargando...</p>
        ) : listaPaginada.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No tienes subastas en esta categoría.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {listaPaginada.map((a) => (
                <SubastaMiniCard key={a.id} subasta={a} />
              ))}
            </div>

            {canLoadMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() =>
                    setVisibleCount((prev) => prev + PAGE_SIZE)
                  }
                  className="px-4 py-2 rounded-full bg-gray-700 hover:bg-gray-600 text-sm"
                >
                  Cargar más subastas
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
