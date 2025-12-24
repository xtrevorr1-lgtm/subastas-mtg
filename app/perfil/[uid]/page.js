"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  runTransaction,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth, storage } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useRouter } from "next/navigation";
import { isUserAdmin } from "../../lib/admin";

const PAGE_SIZE = 12; // número de subastas por "página" visible

export default function PerfilPublicoPage({ params }) {
  const router = useRouter();
  // Next 16: params es una Promise, se desenvuelve con use()
  const { uid } = use(params);

  const [viewer, setViewer] = useState(null); // usuario loggeado que está viendo el perfil
    // 🔐 Admin: si el viewer es admin
  const [amAdmin, setAmAdmin] = useState(false);

  const [userData, setUserData] = useState(null); // datos del dueño del perfil
  const [subastasActivas, setSubastasActivas] = useState([]);
  const [subastasCerradas, setSubastasCerradas] = useState([]);
  const [ganadasCount, setGanadasCount] = useState(0);


  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingSubastas, setLoadingSubastas] = useState(true);
  const [loadingGanadas, setLoadingGanadas] = useState(true);

  // Likes
  const [likesCount, setLikesCount] = useState(0);
  const [viewerHasLiked, setViewerHasLiked] = useState(false);
  const [updatingLike, setUpdatingLike] = useState(false);

  // Avatar
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // UI
  const [tab, setTab] = useState("activas"); // "activas" | "finalizadas"
  const [search, setSearch] = useState("");

  // "paginación" en memoria
  const [visibleActivas, setVisibleActivas] = useState(PAGE_SIZE);
  const [visibleCerradas, setVisibleCerradas] = useState(PAGE_SIZE);

  const filtrarPorBusqueda = (lista) =>
    search.trim()
      ? lista.filter((s) =>
          s.titulo?.toLowerCase().includes(search.toLowerCase())
        )
      : lista;

  const isOwner = viewer && uid && viewer.uid === uid;

  // 🔹 Sesión: quién está viendo el perfil
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setViewer(u || null);
    });
    return () => unsub();
  }, []);
    // 🔐 Detectar si el usuario logueado es admin
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!viewer?.uid) {
        if (alive) setAmAdmin(false);
        return;
      }
      const ok = await isUserAdmin(viewer.uid);
      if (alive) setAmAdmin(ok);
    })();

    return () => {
      alive = false;
    };
  }, [viewer?.uid]);


  // 🔹 Cargar datos del usuario (colección users)
  useEffect(() => {
    if (!uid) return;

    const fetchUser = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          setLikesCount(Number(data.likesCount || 0));
        } else {
          setUserData(null);
          setLikesCount(0);
        }
      } catch (err) {
        console.error("Error cargando usuario:", err);
        setUserData(null);
        setLikesCount(0);
      } finally {
        setLoadingUser(false);
      }
    };

    fetchUser();
  }, [uid]);

  // 🔹 Sincronizar si el viewer ya dio like a este perfil
  useEffect(() => {
    if (!userData || !viewer) {
      setViewerHasLiked(false);
      return;
    }
    const likedBy = userData.likedBy || {};
    setViewerHasLiked(!!likedBy[viewer.uid]);
  }, [userData, viewer]);

  // 🔹 Cargar subastas del usuario (como VENDEDOR)
  useEffect(() => {
    if (!uid) return;

    const colRef = collection(db, "subastas");
    const qSubastas = query(
      colRef,
      where("vendedorUid", "==", uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qSubastas,
      (snap) => {
        const now = Date.now();
        const activas = [];
        const cerradas = [];

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();

          let finalizaMs = null;
          if (data.finaliza?.toDate) {
            finalizaMs = data.finaliza.toDate().getTime();
          } else if (typeof data.finaliza === "number") {
            finalizaMs = data.finaliza;
          }

          const status = data.status || "active";
          const expiredByTime = finalizaMs && finalizaMs <= now;
          const isClosed = status === "closed" || expiredByTime;

          const item = {
            id: docSnap.id,
            ...data,
            finaliza: finalizaMs,
          };

          if (isClosed) {
            cerradas.push(item);
          } else {
            activas.push(item);
          }
        });

        setSubastasActivas(activas);
        setSubastasCerradas(cerradas);
        setLoadingSubastas(false);
      },
      (err) => {
        console.error("Error cargando subastas del perfil:", err);
        setSubastasActivas([]);
        setSubastasCerradas([]);
        setLoadingSubastas(false);
      }
    );

    return () => unsub();
  }, [uid]);

  // 🔹 Contador de subastas GANADAS por este uid (como COMPRADOR)
  useEffect(() => {
    if (!uid) return;

    const colRef = collection(db, "subastas");
    const qClosed = query(colRef, where("status", "==", "closed"));

    const unsub = onSnapshot(
      qClosed,
      (snap) => {
        let count = 0;

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          let won = false;

          // Caso 1: winners array
          if (Array.isArray(data.winners)) {
            if (
              data.winners.some(
                (w) => w && w.uid === uid && Number(w.quantity || 1) > 0
              )
            ) {
              won = true;
            }
          }

          // Caso 2: winnerUids array simple
          if (!won && Array.isArray(data.winnerUids)) {
            if (data.winnerUids.includes(uid)) {
              won = true;
            }
          }

          // Caso 3: winnerQuantities map (multi CD)
          if (!won && data.winnerQuantities && typeof data.winnerQuantities === "object") {
            if (Number(data.winnerQuantities[uid] || 0) > 0) {
              won = true;
            }
          }

          if (won) {
            count += 1;
          }
        });

        setGanadasCount(count);
        setLoadingGanadas(false);
      },
      (err) => {
        console.error("Error cargando subastas ganadas para perfil:", err);
        setGanadasCount(0);
        setLoadingGanadas(false);
      }
    );

    return () => unsub();
  }, [uid]);

  const totalPublicadas = subastasActivas.length + subastasCerradas.length;

  // 🔹 Avatar actual (prioridad: avatarUrl → photoURL → inicial)
  const avatarUrl =
    (userData && (userData.avatarUrl || userData.photoURL)) || null;

  // 🟢 Cambiar avatar (con eliminación de la foto anterior)
  const handleAvatarChange = async (e) => {
    if (!isOwner) return;
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);

      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      const prevData = userSnap.data() || {};

      // Subida del nuevo avatar
      const storagePath = `avatars/${uid}_${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const newURL = await getDownloadURL(storageRef);

      // Ruta REAL del avatar anterior (solo esta sirve para borrar)
      const prevPath = prevData.avatarPath || null;
      if (prevPath) {
        try {
          await deleteObject(ref(storage, prevPath));
        } catch (err) {
          console.warn("No se pudo borrar el avatar anterior:", err);
        }
      }

      // Guardar nueva info del avatar
      await updateDoc(userRef, {
        avatarUrl: newURL,
        avatarPath: storagePath,
        updatedAt: Date.now(),
      });

      // Actualizar UI inmediatamente
      setUserData((prev) =>
        prev
          ? {
              ...prev,
              avatarUrl: newURL,
              avatarPath: storagePath,
            }
          : prev
      );
    } catch (err) {
      console.error("Error subiendo avatar:", err);
      alert("No se pudo actualizar la imagen de perfil.");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  // 🟠 Like / unlike del perfil
  const handleToggleLike = async () => {
    if (!viewer) {
      alert("Debes iniciar sesión para dar like a un perfil.");
      return;
    }
    if (viewer.uid === uid) {
      alert("No puedes darte like a ti mismo 😅");
      return;
    }

    setUpdatingLike(true);
    try {
      const userRef = doc(db, "users", uid);

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) return;

        const data = snap.data() || {};
        const likedBy = data.likedBy || {};
        const currentCount = Number(data.likesCount || 0);
        const alreadyLiked = !!likedBy[viewer.uid];

        const newLikedBy = { ...likedBy };
        let newCount = currentCount;

        if (alreadyLiked) {
          delete newLikedBy[viewer.uid];
          newCount = Math.max(0, currentCount - 1);
        } else {
          newLikedBy[viewer.uid] = true;
          newCount = currentCount + 1;
        }

        tx.update(userRef, {
          likedBy: newLikedBy,
          likesCount: newCount,
        });
      });

      setViewerHasLiked((prev) => !prev);
      setLikesCount((prev) =>
        viewerHasLiked ? Math.max(0, prev - 1) : prev + 1
      );
    } catch (err) {
      console.error("Error actualizando like:", err);
      alert("No se pudo actualizar el like.");
    } finally {
      setUpdatingLike(false);
    }
  };
    // 🔥 ADMIN: ban / unban
  async function banUser() {
    if (!amAdmin) return;
    if (isOwner) return alert("No puedes banearte a ti mismo.");

    const reason = prompt("Motivo del baneo (opcional):") || "";

    try {
      await updateDoc(doc(db, "users", uid), {
        banned: true,
        bannedAt: serverTimestamp(),
        bannedReason: reason,
        bannedBy: viewer?.uid || null,
      });

      // refrescar UI local
      setUserData((prev) => (prev ? { ...prev, banned: true, bannedReason: reason } : prev));

      alert("✅ Usuario baneado.");
    } catch (e) {
      console.error(e);
      alert("❌ No se pudo banear (revisa permisos/reglas).");
    }
  }

  async function unbanUser() {
    if (!amAdmin) return;

    try {
      await updateDoc(doc(db, "users", uid), {
        banned: false,
        unbannedAt: serverTimestamp(),
        bannedReason: "",
        bannedBy: viewer?.uid || null,
      });

      setUserData((prev) => (prev ? { ...prev, banned: false, bannedReason: "" } : prev));

      alert("✅ Usuario desbaneado.");
    } catch (e) {
      console.error(e);
      alert("❌ No se pudo desbanear (revisa permisos/reglas).");
    }
  }


    useEffect(() => {
    setVisibleActivas(PAGE_SIZE);
    setVisibleCerradas(PAGE_SIZE);
  }, [search, uid]);
  // ⏳ Estado de carga
  if (loadingUser || loadingSubastas || loadingGanadas) {
    return (
      <main className="min-h-screen bg-[#02060b] text-gray-100 flex items-center justify-center">
        <p className="text-sm text-gray-400">Cargando perfil...</p>
      </main>
    );
  }

  // ⭐ Filtrar según búsqueda
  const activasFiltradas = filtrarPorBusqueda(subastasActivas);
  const cerradasFiltradas = filtrarPorBusqueda(subastasCerradas);



  const activasToShow = activasFiltradas.slice(0, visibleActivas);
  const cerradasToShow = cerradasFiltradas.slice(0, visibleCerradas);

  const canLoadMoreActivas = visibleActivas < activasFiltradas.length;
  const canLoadMoreCerradas = visibleCerradas < cerradasFiltradas.length;

  // ❌ Usuario no encontrado
  if (!userData) {
    return (
      <main className="min-h-screen bg-[#02060b] text-gray-100 flex flex-col items-center justify-center">
        <p className="text-gray-300 mb-3">
          Este usuario no existe o aún no tiene perfil público.
        </p>
        <Link
          href="/"
          className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm"
        >
          Volver al inicio
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* HEADER PERFIL */}
        <header className="flex flex-col.md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userData.displayName || "Avatar"}
                  className="w-16 h-16 rounded-full object-cover border border-emerald-500/60"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-emerald-700 flex items-center justify-center text-2xl font-bold">
                  {userData.displayName
                    ? userData.displayName.charAt(0).toUpperCase()
                    : "U"}
                </div>
              )}

              {isOwner && (
                <label className="absolute -bottom-1 -right-1 bg-black/80 border border-white/20 rounded-full px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-black text-gray-100">
                  {uploadingAvatar ? "..." : "Cambiar"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                    disabled={uploadingAvatar}
                  />
                </label>
              )}
            </div>

            <div>
              <h1 className="text-2xl font-bold">
                {userData.displayName || "Usuario"}
              </h1>
              <p className="text-gray-400 text-sm">
                Perfil público del vendedor / comprador
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Likes recibidos:{" "}
                <span className="font-semibold text-emerald-300">
                  {likesCount}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 text-sm">
            <Link
              href="/"
              className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
            >
              Volver al inicio
            </Link>

            {viewer && !isOwner && (
              <button
                onClick={handleToggleLike}
                disabled={updatingLike}
                className={`mt-1 px-3 py-1 rounded-full text-xs.font-semibold border
                  ${
                    viewerHasLiked
                      ? "bg-emerald-700 border-emerald-400 text-white"
                      : "bg-transparent border-emerald-500 text-emerald-300 hover:bg-emerald-900/40"
                  }`}
              >
                {updatingLike
                  ? "Actualizando..."
                  : viewerHasLiked
                  ? "Quitar like"
                  : "Dar like"}
              </button>
            )}
          </div>
        </header>
                {/* 🔐 PANEL ADMIN */}
        {amAdmin && !isOwner && (
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-red-900/20 p-3">
            <span className="text-xs font-semibold text-red-300">
              MODO ADMIN
            </span>

            {userData?.banned ? (
              <button
                onClick={unbanUser}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-700 hover:bg-gray-600"
              >
                Quitar ban
              </button>
            ) : (
              <button
                onClick={banUser}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-red-600 hover:bg-red-700"
              >
                Banear usuario
              </button>
            )}

            {userData?.banned && (
              <span className="text-xs text-gray-300">
                BANEADO {userData?.bannedReason ? `— Motivo: ${userData.bannedReason}` : ""}
              </span>
            )}
          </div>
        )}


        {/* RESUMEN RÁPIDO */}
        <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">
              Subastas activas
            </p>
            <p className="text-xl font-bold text-emerald-400">
              {subastasActivas.length}
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">
              Subastas finalizadas
            </p>
            <p className="text-xl font-bold text-sky-400">
              {subastasCerradas.length}
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">
              Subastas ganadas
            </p>
            <p className="text-xl font-bold text-amber-300">
              {ganadasCount}
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2 hidden md:block">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">
              Total publicadas
            </p>
            <p className="text-xl font-bold text-gray-100">
              {totalPublicadas}
            </p>
          </div>
        </section>

        {/* SWITCH ENTRE ACTIVAS Y FINALIZADAS */}
        <div className="flex gap-2 mb-6 mt-8">
          <button
            onClick={() => setTab("activas")}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
              tab === "activas"
                ? "bg-emerald-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Activas
          </button>

          <button
            onClick={() => setTab("finalizadas")}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
              tab === "finalizadas"
                ? "bg-emerald-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Finalizadas
          </button>
        </div>

        {/* BUSCADOR */}
        <div className="mb-6 max-w-md">
          <input
            type="text"
            placeholder="Buscar subastas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm"
          />
        </div>

        {/* CONTENIDO DE LA PESTAÑA ACTUAL */}
        {tab === "activas" ? (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-2">
              Subastas activas
            </h2>

            {activasToShow.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No tiene subastas activas en este momento.
              </p>
            ) : (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  {activasToShow.map((s) => {
                    const thumb =
                      (Array.isArray(s.imageUrls) &&
                        s.imageUrls.length > 0 &&
                        s.imageUrls[0]) ||
                      s.imageUrl ||
                      null;

                    const compraDirectaLabel =
                      s.compraDirecta != null
                        ? `S/ ${Number(s.compraDirecta).toFixed(2)}`
                        : "—";

                    const precioActualLabel =
                      s.precioActual != null
                        ? `S/ ${Number(s.precioActual).toFixed(2)}`
                        : "Sin pujas";

                    return (
                      <Link
                        key={s.id}
                        href={`/subasta/${s.id}`}
                        className="block border border-[#1b2335] rounded-xl bg-[#050914] hover:border-emerald-500/70 transition overflow-hidden"
                      >
                        <div className="flex">
                          <div className="w-24 h-28 bg-black/40 flex-shrink-0 flex items-center justify-center overflow-hidden">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={s.titulo || "Subasta"}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[11px] text-gray-500 px-1 text-center">
                                Sin imagen
                              </span>
                            )}
                          </div>

                          <div className="flex-1 px-3 py-2 flex flex-col justify-between">
                            <div>
                              <p className="text-sm font-semibold text-emerald-300 line-clamp-2">
                                {s.titulo || "Sin título"}
                              </p>

                              <p className="text-[11px] text-gray-400 mt-1">
                                Compra directa:{" "}
                                <span className="text-gray-200 font-semibold">
                                  {compraDirectaLabel}
                                </span>
                              </p>

                              <p className="text-[11px] text-gray-400">
                                Precio actual:{" "}
                                <span className="text-gray-200 font-semibold">
                                  {precioActualLabel}
                                </span>
                              </p>
                            </div>

                            <p className="text-[11px] text-gray-500 mt-1">
                              Haz clic para ver la subasta.
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {canLoadMoreActivas && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={() =>
                        setVisibleActivas((prev) => prev + PAGE_SIZE)
                      }
                      className="px-4 py-2 rounded-full text-sm font-semibold border bg-gray-800 text-gray-100 hover:bg-gray-700 border-gray-600"
                    >
                      Cargar más subastas
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              Subastas finalizadas
            </h2>

            {cerradasToShow.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No tiene subastas finalizadas todavía.
              </p>
            ) : (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  {cerradasToShow.map((s) => {
                    const thumb =
                      (Array.isArray(s.imageUrls) &&
                        s.imageUrls.length > 0 &&
                        s.imageUrls[0]) ||
                      s.imageUrl ||
                      null;

                    const compraDirectaLabel =
                      s.compraDirecta != null
                        ? `S/ ${Number(s.compraDirecta).toFixed(2)}`
                        : "—";

                    return (
                      <Link
                        key={s.id}
                        href={`/subasta/${s.id}`}
                        className="block border border-[#1b2335] rounded-xl bg-[#050914] hover:border-sky-500/70 transition overflow-hidden"
                      >
                        <div className="flex">
                          <div className="w-24 h-28 bg-black/40 flex-shrink-0 flex items-center justify-center overflow-hidden">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={s.titulo || "Subasta"}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[11px] text-gray-500 px-1 text-center">
                                Sin imagen
                              </span>
                            )}
                          </div>

                          <div className="flex-1 px-3 py-2 flex flex-col justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-100 line-clamp-2">
                                {s.titulo || "Sin título"}
                              </p>

                              <p className="text-[11px] text-gray-400 mt-1">
                                Compra directa:{" "}
                                <span className="text-gray-200 font-semibold">
                                  {compraDirectaLabel}
                                </span>
                              </p>

                              {s.precioActual != null && (
                                <p className="text-[11px] text-gray-400">
                                  Precio final:{" "}
                                  <span className="text-gray-200 font-semibold">
                                    S/ {Number(s.precioActual || 0).toFixed(2)}
                                  </span>
                                </p>
                              )}
                            </div>

                            <p className="text-[11px] text-gray-500 mt-1">
                              Subasta finalizada.
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {canLoadMoreCerradas && (
                  <div className="flex justify-center.mt-6">
                    <button
                      onClick={() =>
                        setVisibleCerradas((prev) => prev + PAGE_SIZE)
                      }
                      className="px-4 py-2 rounded-full text-sm font-semibold border bg-gray-800 text-gray-100 hover:bg-gray-700 border-gray-600"
                    >
                      Cargar más subastas
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
