"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  addDoc,
  onSnapshot,
} from "firebase/firestore";

import { auth, db, googleProvider } from "./firebase";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { isUserAdmin } from "./lib/admin";

import { ensureUserProfile } from "./lib/userProfile";
import SubastaMiniCard from "../components/SubastaMiniCard";

// =====================
// Helpers
// =====================
function timestampToMs(t) {
  if (!t) return 0;
  if (typeof t === "number") return t;
  if (t.toMillis) return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  return 0;
}

// cuántas mostramos por “página visual”
const PAGE_SIZE = 20;

function mergeUniqueById(a = [], b = []) {
  const map = new Map();
  [...a, ...b].forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  return Array.from(map.values());
}

// Mapea un doc de Firestore → objeto subasta con campos calculados
async function mapSubastaDoc(db, docSnap) {
  const data = docSnap.data();

  // finaliza en ms
  let finalizaMs = null;
  if (data.finaliza?.toDate) {
    finalizaMs = data.finaliza.toDate().getTime();
  } else if (typeof data.finaliza === "number") {
    finalizaMs = data.finaliza;
  }

  // Perfil del vendedor
  let vendedorNameSnapshot = data.vendedorName;
  let vendedorPhotoURL = null;

  try {
    if (data.vendedorUid) {
      const userRef = doc(db, "users", data.vendedorUid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const u = userSnap.data();
        vendedorNameSnapshot = u.displayName || vendedorNameSnapshot;
        vendedorPhotoURL =
          u.avatarUrl || u.photoURL || data.vendedorAvatar || null;
      }
    }
  } catch (err) {
    console.warn("No se pudo leer perfil de vendedor:", err);
  }

  const isClosedByTime =
    finalizaMs && finalizaMs <= Date.now();
  const finalizada =
    data.status === "closed" || isClosedByTime;

  return {
    id: docSnap.id,
    ...data,
    finaliza: finalizaMs,
    vendedorNameSnapshot,
    vendedorPhotoURL,
    finalizada: !!finalizada,
  };
}

export default function Home() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [unreadChatsCount, setUnreadChatsCount] = useState(0);

  // filtros UI
  const [search, setSearch] = useState("");
  const [buscarPerfil, setBuscarPerfil] = useState("");
  const [filterType, setFilterType] = useState("active"); // "active" | "ended"

  // 🔥 Listas separadas
  const [activeSubs, setActiveSubs] = useState([]);
  const [endedSubs, setEndedSubs] = useState([]);

  // “paginación visual”: cuántas mostramos
  const [visibleActiveCount, setVisibleActiveCount] = useState(PAGE_SIZE);
  const [visibleEndedCount, setVisibleEndedCount] = useState(PAGE_SIZE);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [isAdminLocal, setIsAdminLocal] = useState(false);

  // =========================
  //  SESIÓN + PERFIL
  // =========================
  useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (u) => {
    // ✅ si no hay sesión, apaga todo lo que depende de permisos
    if (!u) {
      setUser(null);
      setAuthReady(false);
      return;
    }

    // ✅ mientras aseguras perfil, NO declares “ready”
    setAuthReady(false);

    try {
      await ensureUserProfile(u); // crea /users/{uid} si falta
    } catch (err) {
      console.error("Error asegurando perfil de usuario:", err);
      // igual seguimos; las reglas ya serán tolerantes
    }

    setUser(u);
    setAuthReady(true);
  });

  return () => unsub();
}, []);



useEffect(() => {
  let alive = true;

  (async () => {
    if (!user?.uid) {
      if (alive) setIsAdminLocal(false);
      return;
    }

    // OJO: aquí usa tu helper real
    const ok = await isUserAdmin(user.uid);
    if (alive) setIsAdminLocal(!!ok);
  })();

  return () => { alive = false; };
}, [user?.uid]);

  // =========================
  //  CONTADOR CHATS
  // =========================
 useEffect(() => {
  if (!authReady || !user?.uid) {
    setUnreadChatsCount(0);
    return;
  }

  const qChats = query(
    collection(db, "chats"),
    where("participants", "array-contains", user.uid)
  );

  const unsub = onSnapshot(
    qChats,
    (snap) => {
      let count = 0;

      snap.forEach((docSnap) => {
        const chat = docSnap.data();
        if (!chat.lastMessageAt) return;

        const lastMsgMs = timestampToMs(chat.lastMessageAt);
        const lastReadForUser = chat.lastReadAt && chat.lastReadAt[user.uid];

        if (!lastReadForUser) {
          count++;
          return;
        }

        const lastReadMs = timestampToMs(lastReadForUser);
        if (lastMsgMs > lastReadMs) count++;
      });

      setUnreadChatsCount(count);
    },
    (err) => {
      console.error("Error escuchando chats para contador:", err);
      setUnreadChatsCount(0);
    }
  );

  return () => unsub();
}, [authReady, user?.uid]);


  // =========================
  //  CARGAR TODAS ACTIVAS + FINALIZADAS RECIENTES
  // =========================
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoadingInitial(true);

      try {
        const subastasCol = collection(db, "subastas");

        // 1) ACTIVAS: todas
        const qActive = query(
          subastasCol,
          where("status", "==", "active"),
          orderBy("createdAt", "desc")
        );
        const snapActive = await getDocs(qActive);
        const activeArr = await Promise.all(
          snapActive.docs.map((d) => mapSubastaDoc(db, d))
        );

        // 2) FINALIZADAS: últimos 90 días
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);

        const qEnded = query(
          subastasCol,
          where("status", "==", "closed"),
          where("createdAt", ">=", cutoff),
          orderBy("createdAt", "desc")
        );
        const snapEnded = await getDocs(qEnded);
        const endedArr = await Promise.all(
          snapEnded.docs.map((d) => mapSubastaDoc(db, d))
        );

        if (cancelled) return;

        // ✅ mover a "finalizadas" las que vencieron por tiempo aunque sigan status="active"
const activeNow = activeArr.filter((s) => !s.finalizada);
const endedFromActive = activeArr.filter((s) => s.finalizada);

// ✅ mezcla finalizadas reales (status=closed) + finalizadas por tiempo
const endedCombined = mergeUniqueById(endedArr, endedFromActive);

// (opcional) ordena finalizadas por createdAt desc (si existe)
endedCombined.sort((x, y) => {
  const ax = timestampToMs(x.createdAt);
  const ay = timestampToMs(y.createdAt);
  return ay - ax;
});

setActiveSubs(activeNow);
setEndedSubs(endedCombined);


        // reset visibles
        setVisibleActiveCount(PAGE_SIZE);
        setVisibleEndedCount(PAGE_SIZE);
      } catch (err) {
        console.error("Error cargando subastas:", err);
        if (!cancelled) {
          setActiveSubs([]);
          setEndedSubs([]);
        }
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    }

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, []);
// =========================
//  REVISAR VENCIMIENTOS EN VIVO (HOME)
//  - cada 5s mueve subastas vencidas desde activas -> finalizadas
// =========================
useEffect(() => {
  const interval = setInterval(() => {
    const now = Date.now();

    setActiveSubs((prevActive) => {
      if (!prevActive || prevActive.length === 0) return prevActive;

      const stillActive = [];
      const movedToEnded = [];

      for (const s of prevActive) {
        const finalizaMs = typeof s.finaliza === "number" ? s.finaliza : 0;
        const expiredByTime = finalizaMs && finalizaMs <= now;
        const isClosed = s.status === "closed";

        if (expiredByTime || isClosed) {
          movedToEnded.push({ ...s, finalizada: true });
        } else {
          stillActive.push(s);
        }
      }

      if (movedToEnded.length > 0) {
        setEndedSubs((prevEnded) => {
          const merged = mergeUniqueById(movedToEnded, prevEnded);
          merged.sort((x, y) => {
            const ax = timestampToMs(x.createdAt);
            const ay = timestampToMs(y.createdAt);
            return ay - ax;
          });
          return merged;
        });
      }

      return stillActive;
    });
  }, 5000);

  return () => clearInterval(interval);
}, []);

  // Si cambias de pestaña, resetea el “cargar más” de esa pestaña
  useEffect(() => {
    if (filterType === "active") {
      setVisibleActiveCount(PAGE_SIZE);
    } else {
      setVisibleEndedCount(PAGE_SIZE);
    }
  }, [filterType]);

  // =========================
  //  ACTIVAR PROGRAMADAS
  // =========================
  
 useEffect(() => {
  // ✅ si no hay user o no es admin, NO escuches /programadas
  if (!user?.uid || !isAdminLocal) return;

  const qProg = query(collection(db, "programadas"), orderBy("startAt", "asc"));

  const unsub = onSnapshot(
    qProg,
    async (snap) => {
      const ahora = Date.now();

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const startMs = data.startAt;

        if (startMs && startMs <= ahora) {
          const idProgramada = docSnap.id;

          try {
            await runTransaction(db, async (tx) => {
              const progRef = doc(db, "programadas", idProgramada);
              const progSnap = await tx.get(progRef);
              if (!progSnap.exists()) return;

              const datos = progSnap.data();

              // ✅ Crear ref con ID nuevo (SIN addDoc dentro de tx)
              const newSubRef = doc(collection(db, "subastas"));

              // ✅ Escribe la subasta “activada”
              tx.set(newSubRef, {
                ...datos,
                status: "active",
                activatedAt: serverTimestamp(),
                // (opcional) si quieres marcar que viene de programadas:
                // activatedFromProgramadaId: idProgramada,
              });

              // ✅ Elimina la programada
              tx.delete(progRef);

              // OJO: no hagas console.log con newSubRef.id fuera, pero aquí está OK.
            });
          } catch (err) {
            console.error("Error activando subasta programada:", err);
          }
        }
      }
    },
    (err) => {
      console.error("Error escuchando programadas:", err);
    }
  );

  return () => unsub();
}, [user?.uid, isAdminLocal]);




  // =========================
  //  LOGIN / LOGOUT
  // =========================
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      alert("Error al iniciar sesión: " + (err.message || err));
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (err) {
      console.error(err);
      alert("Error al cerrar sesión: " + (err.message || err));
    }
  };

  // =========================
  //  FILTROS EN MEMORIA
  // =========================
  const isActiveTab = filterType === "active";
  const rawList = isActiveTab ? activeSubs : endedSubs;

  const subastasFiltradas = rawList
    // excluir eliminadas
    .filter((s) => s.estado !== "eliminada")
    // por vendedor
    .filter((s) =>
      buscarPerfil.trim()
        ? (s.vendedorNameSnapshot || s.vendedorName || "")
            .toLowerCase()
            .includes(buscarPerfil.toLowerCase())
        : true
    )
    // por título
    .filter((s) =>
      s.titulo?.toLowerCase().includes(search.toLowerCase())
    );

  // “paginación” visual
  const listToRender = isActiveTab
    ? subastasFiltradas.slice(0, visibleActiveCount)
    : subastasFiltradas.slice(0, visibleEndedCount);

  const canLoadMore = isActiveTab
    ? visibleActiveCount < subastasFiltradas.length
    : visibleEndedCount < subastasFiltradas.length;

  // =========================
  //  RENDER
  // =========================
  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* BUSCADOR SUBASTA */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar subasta por nombre..."
            className="w-full px-3 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm"
          />
        </div>

        {/* BUSCADOR PERFIL */}
        <div className="mb-4">
          <input
            type="text"
            value={buscarPerfil}
            onChange={(e) => setBuscarPerfil(e.target.value)}
            placeholder="Buscar por vendedor..."
            className="w-full px-3 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm"
          />
        </div>

        {/* FILTROS ACTIVAS / FINALIZADAS */}
        <div className="flex items-center gap-3 mt-4 mb-4">
          <button
            onClick={() => setFilterType("active")}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              filterType === "active"
                ? "bg-emerald-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Subastas activas
          </button>

          <button
            onClick={() => setFilterType("ended")}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              filterType === "ended"
                ? "bg-emerald-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Subastas finalizadas
          </button>
        </div>

        {/* LISTADO */}
        {loadingInitial && listToRender.length === 0 ? (
          <p className="text-gray-300">Cargando subastas...</p>
        ) : listToRender.length === 0 ? (
          <p className="text-gray-400">
            No hay subastas en esta categoría.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
              {listToRender.map((a) => (
                <SubastaMiniCard key={a.id} subasta={a} />
              ))}
            </div>

            {/* BOTÓN CARGAR MÁS (solo visual) */}
            {canLoadMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => {
                    if (isActiveTab) {
                      setVisibleActiveCount((c) => c + PAGE_SIZE);
                    } else {
                      setVisibleEndedCount((c) => c + PAGE_SIZE);
                    }
                  }}
                  className="px-4 py-2 rounded-full text-sm font-semibold border bg-gray-800 text-gray-100 hover:bg-gray-700 border-gray-600"
                >
                  Cargar más subastas
                </button>
              </div>
            )}
          </>
        )}

        <style jsx>{`
          .nav-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border-radius: 12px;
            font-weight: 500;
            transition: 0.2s;
          }

          .nav-btn:hover {
            filter: brightness(1.15);
          }

          .notif-badge {
            position: absolute;
            top: -6px;
            right: -6px;
            background: #ef4444;
            padding: 2px 5px;
            border-radius: 50%;
            font-size: 10px;
            font-weight: bold;
            color: white;
            min-width: 18px;
            text-align: center;
          }
        `}</style>
      </div>
    </main>
  );
}
