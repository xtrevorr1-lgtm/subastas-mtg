"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { collection, query, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";

import { auth, db } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import SubastaMiniCard from "../../components/SubastaMiniCard";

const PAGE_SIZE = 20; // cuántas mostrar por “página visual”

export default function MisGanadasPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [subastas, setSubastas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30d");
  const [estadoFiltro, setEstadoFiltro] = useState("all");
  // "all" | "pendiente" | "pagado" | "recogido"
  // ⭐ buscador
  const [search, setSearch] = useState("");

  // ⭐ paginación visual
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  function getEstadoGanada(subasta, uid) {
  return subasta.ganadasStatus?.[uid] ?? "pendiente";
}


  // función para filtrar por título
  const filtrarPorBusqueda = (lista) =>
    search.trim()
      ? lista.filter((s) =>
          s.titulo?.toLowerCase().includes(search.toLowerCase())
        )
      : lista;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setSubastas([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const qRef = query(collection(db, "subastas"));

    const unsub = onSnapshot(qRef, (snap) => {
      const now = Date.now();

      const arr = snap.docs.map((d) => {
        const data = d.data();

        let finalizaMs = null;
        if (data.finaliza?.toDate)
          finalizaMs = data.finaliza.toDate().getTime();
        else if (typeof data.finaliza === "number")
          finalizaMs = data.finaliza;

        let closedAtMs = null;
        if (data.closedAt?.toDate)
          closedAtMs = data.closedAt.toDate().getTime();

        return {
          id: d.id,
          ...data,
          finaliza: finalizaMs,
          closedAtMs,
        };
      });

      // Ganadas por el usuario
      const ganadas = arr.filter((s) => {
        const expiredByTime = s.finaliza && s.finaliza <= now;
        const isClosed = s.status === "closed";
        if (!isClosed && !expiredByTime) return false;

        // ✅ cantidad ganada real
let qty =
  s.winnerQuantities?.[user.uid] ||
  (Array.isArray(s.winners)
    ? s.winners.find((w) => w.uid === user.uid)?.quantity
    : 0) ||
  0;

// ✅ fallback: subasta vencida por tiempo + último postor
if (
  qty === 0 &&
  s.finaliza &&
  s.finaliza <= now &&
  s.ultimoPostorUid === user.uid
) {
  qty = 1;
}


return qty > 0;

      });

      // Orden (más recientes primero)
      ganadas.sort((a, b) => {
        const tA = a.closedAtMs ?? a.finaliza ?? 0;
        const tB = b.closedAtMs ?? b.finaliza ?? 0;
        return tB - tA;
      });

      setSubastas(ganadas);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  // Filtro + cálculos
  const { filteredSubastas, totalGanadas, totalGastado } = useMemo(() => {
    if (!subastas.length)
      return { filteredSubastas: [], totalGanadas: 0, totalGastado: 0 };

    const now = Date.now();
    const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

    const filtered = subastas.filter((s) => {
      const estado = getEstadoGanada(s, user.uid);

if (estadoFiltro !== "all" && estado !== estadoFiltro) {
  return false;
}

      if (range === "all") return true;
      const t = s.closedAtMs ?? s.finaliza ?? 0;
      return t >= now - THIRTY_DAYS_MS;
    });

    // ⭐ Aplicar búsqueda
    const filtradasConBusqueda = filtrarPorBusqueda(filtered);

    const totalGastado = filtradasConBusqueda.reduce((acc, s) => {
      const price =
        typeof s.precioActual === "number"
          ? s.precioActual
          : typeof s.precioBase === "number"
          ? s.precioBase
          : 0;

      return acc + price;
    }, 0);

    return {
      filteredSubastas: filtradasConBusqueda,
      totalGanadas: filtradasConBusqueda.length,
      totalGastado,
    };
  }, [subastas, range, search, estadoFiltro, user?.uid]);


  // ⭐ aplicar paginación visual
  const listaPaginada = filteredSubastas.slice(0, visibleCount);
  const canLoadMore = visibleCount < filteredSubastas.length;

  // resetear “cargar más” al cambiar rango o búsqueda
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [range, search]);

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* HEADER */}
        <header className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#02060b]/95 backdrop-blur">
          <h1 className="text-2xl font-bold">Mis subastas ganadas</h1>

          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600"
            >
              Volver al listado
            </Link>

            <Link
              href="/mis-subastas"
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600"
            >
              Mis subastas (como vendedor)
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

        {loading ? (
          <p className="text-gray-300 mt-4">Cargando...</p>
        ) : !user ? (
          <p className="text-gray-400 mt-4">Debes iniciar sesión.</p>
        ) : (
          <>
            {/* FILTRO DE RANGO */}
            <div className="my-4 flex gap-2 text-sm">
              <button
                onClick={() => setRange("30d")}
                className={`px-3 py-1 rounded-full border ${
                  range === "30d"
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "bg-transparent border-gray-600 text-gray-300 hover:border-emerald-500"
                }`}
              >
                Últimos 30 días
              </button>

              <button
                onClick={() => setRange("all")}
                className={`px-3 py-1 rounded-full border ${
                  range === "all"
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "bg-transparent border-gray-600 text-gray-300 hover:border-emerald-500"
                }`}
              >
                Todo el historial
              </button>
            </div>

            {/* RESUMEN (opcional, ya que lo tenías calculado) */}
            <div className="mb-3 text-xs text-gray-300 flex flex-wrap gap-4">
              <span>
                Subastas ganadas en este rango:{" "}
                <span className="font-semibold">
                  {totalGanadas}
                </span>
              </span>
              <span>
                Monto total aprox.:{" "}
                <span className="font-semibold">
                  S/ {totalGastado.toFixed(2)}
                </span>
              </span>
            </div>
                <div className="flex gap-2 text-sm mb-3">
  {[
    { id: "all", label: "Todas" },
    { id: "pendiente", label: "Pendientes" },
    { id: "pagado", label: "Pagadas" },
    { id: "recogido", label: "Recogidas" },
  ].map((e) => (
    <button
      key={e.id}
      onClick={() => setEstadoFiltro(e.id)}
      className={`px-3 py-1 rounded-full border ${
        estadoFiltro === e.id
          ? "bg-emerald-600 border-emerald-500 text-white"
          : "bg-transparent border-gray-600 text-gray-300 hover:border-emerald-500"
      }`}
    >
      {e.label}
    </button>
  ))}
</div>

            {/* BUSCADOR */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Buscar en subastas ganadas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm"
              />
            </div>

            {/* CONTENIDO */}
            {listaPaginada.length === 0 ? (
              <p className="text-gray-400 mt-4 text-sm">
                No hay resultados para tu búsqueda en este rango.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
  {listaPaginada.map((a) => (
    <div key={a.id} className="relative">
      <SubastaMiniCard subasta={a} />

      <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-gray-800 border border-gray-600">
        {getEstadoGanada(a, user.uid)}
      </span>

      <div className="mt-2 flex gap-2 text-xs">
        {["pagado", "recogido"].map((estado) => (
          <button
            key={estado}
            onClick={async () => {
              await updateDoc(doc(db, "subastas", a.id), {
                [`ganadasStatus.${user.uid}`]: estado,
                updatedAt: serverTimestamp(),
              });
            }}
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
          >
            Marcar como {estado}
          </button>
        ))}
      </div>
    </div>
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
          </>
        )}
      </div>
    </main>
  );
}
