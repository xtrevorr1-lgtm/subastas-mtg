"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "../app/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import SubastaCard from "./SubastaCard";

export default function PerfilPublicoClient({ uid }) {
  const router = useRouter();

  const [viewer, setViewer] = useState(null);          // usuario logueado que mira el perfil
  const [userData, setUserData] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [subastasPublicadas, setSubastasPublicadas] = useState([]);
  const [subastasGanadas, setSubastasGanadas] = useState([]);
  const [loadingSubastas, setLoadingSubastas] = useState(true);

  const [likesCount, setLikesCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [loadingLikeState, setLoadingLikeState] = useState(true);
  const [updatingLike, setUpdatingLike] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  // 🔹 Sesión
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setViewer(u);
    });
    return () => unsub();
  }, []);

  // 🔹 Datos de perfil: /users/{uid}
  useEffect(() => {
    if (!uid) return;

    const userRef = doc(db, "users", uid);

    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) {
          setUserData(null);
          setLikesCount(0);
        } else {
          const data = snap.data();
          setUserData({ id: snap.id, ...data });
          setLikesCount(Number(data.likesCount || 0));
        }
        setLoadingUser(false);
      },
      (err) => {
        console.error("Error cargando perfil de usuario:", err);
        setLoadingUser(false);
      }
    );

    return () => unsub();
  }, [uid]);

  // 🔹 Subastas donde este usuario es vendedor
  useEffect(() => {
    if (!uid) return;

    setLoadingSubastas(true);

    const qSubastas = query(
      collection(db, "subastas"),
      where("vendedorUid", "==", uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qSubastas,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const data = d.data();

          let finalizaMs = null;
          if (data.finaliza?.toDate) {
            finalizaMs = data.finaliza.toDate().getTime();
          } else if (typeof data.finaliza === "number") {
            finalizaMs = data.finaliza;
          }

          let closedAtMs = null;
          if (data.closedAt?.toDate) {
            closedAtMs = data.closedAt.toDate().getTime();
          }

          return {
            id: d.id,
            ...data,
            finaliza: finalizaMs,
            closedAtMs,
          };
        });

        setSubastasPublicadas(arr);
        setLoadingSubastas(false);
      },
      (err) => {
        console.error("Error cargando subastas del usuario:", err);
        setLoadingSubastas(false);
      }
    );

    return () => unsub();
  }, [uid]);

  // 🔹 Subastas ganadas (último postor + cerrada / vencida)
  useEffect(() => {
    if (!uid) return;

    const qGanadas = query(
      collection(db, "subastas"),
      where("ultimoPostorUid", "==", uid)
    );

    const unsub = onSnapshot(
      qGanadas,
      (snap) => {
        const now = Date.now();
        const arr = snap.docs.map((d) => {
          const data = d.data();

          let finalizaMs = null;
          if (data.finaliza?.toDate) {
            finalizaMs = data.finaliza.toDate().getTime();
          } else if (typeof data.finaliza === "number") {
            finalizaMs = data.finaliza;
          }

          let closedAtMs = null;
          if (data.closedAt?.toDate) {
            closedAtMs = data.closedAt.toDate().getTime();
          }

          return {
            id: d.id,
            ...data,
            finaliza: finalizaMs,
            closedAtMs,
          };
        });

        const ganadas = arr.filter((s) => {
          const finalMs = s.finaliza;
          const expiredByTime = finalMs && finalMs <= now;
          const isClosed = s.status === "closed";
          return isClosed || expiredByTime;
        });

        setSubastasGanadas(ganadas);
      },
      (err) => {
        console.error("Error cargando subastas ganadas:", err);
      }
    );

    return () => unsub();
  }, [uid]);

  // 🔹 Estado "like" del viewer hacia este perfil
  useEffect(() => {
    if (!viewer || !uid) {
      setHasLiked(false);
      setLoadingLikeState(false);
      return;
    }

    if (viewer.uid === uid) {
      setHasLiked(false);
      setLoadingLikeState(false);
      return;
    }

    const likeDocId = `${uid}_${viewer.uid}`;
    const likeRef = doc(db, "userLikes", likeDocId);

    const fetchLike = async () => {
      try {
        const snap = await getDoc(likeRef);
        setHasLiked(snap.exists());
      } catch (err) {
        console.error("Error comprobando like:", err);
      } finally {
        setLoadingLikeState(false);
      }
    };

    fetchLike();
  }, [viewer, uid]);

  const isOwner = viewer && viewer.uid === uid;

  const handleToggleLike = async () => {
    if (!viewer) {
      alert("Debes iniciar sesión para dar like a un usuario.");
      return;
    }
    if (viewer.uid === uid) {
      alert("No puedes darte like a ti mismo.");
      return;
    }
    if (!userData) return;

    setUpdatingLike(true);

    const likeDocId = `${uid}_${viewer.uid}`;
    const likeRef = doc(db, "userLikes", likeDocId);
    const userRef = doc(db, "users", uid);

    try {
      if (!hasLiked) {
        await setDoc(likeRef, {
          profileUid: uid,
          likerUid: viewer.uid,
          createdAt: serverTimestamp(),
        });
        await updateDoc(userRef, {
          likesCount: (userData.likesCount || 0) + 1,
        });
        setHasLiked(true);
        setLikesCount((c) => c + 1);
      } else {
        await deleteDoc(likeRef);
        await updateDoc(userRef, {
          likesCount: Math.max(0, (userData.likesCount || 0) - 1),
        });
        setHasLiked(false);
        setLikesCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      console.error("Error actualizando like:", err);
      alert("No se pudo actualizar el like.");
    } finally {
      setUpdatingLike(false);
    }
  };

  // 🔹 Cambiar avatar (solo dueño del perfil)
  const handleClickChangeAvatar = () => {
    if (!isOwner) return;
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !isOwner) return;

    setUploadingAvatar(true);

    try {
      const storagePath = `avatars/${uid}_${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, {
        photoURL: url,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error subiendo avatar:", err);
      alert("No se pudo actualizar la foto de perfil.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 🔹 Partir publicadas en activas / finalizadas
  const { activas, finalizadas } = useMemo(() => {
    if (!subastasPublicadas || subastasPublicadas.length === 0) {
      return { activas: [], finalizadas: [] };
    }

    const now = Date.now();

    const activas = subastasPublicadas.filter((s) => {
      const finalMs = s.finaliza;
      const expiredByTime = finalMs && finalMs <= now;
      return s.status !== "closed" && !expiredByTime;
    });

    const finalizadas = subastasPublicadas.filter((s) => {
      const finalMs = s.finaliza;
      const expiredByTime = finalMs && finalMs <= now;
      return s.status === "closed" || expiredByTime;
    });

    return { activas, finalizadas };
  }, [subastasPublicadas]);

  const totalPublicadas = subastasPublicadas.length;
  const totalGanadas = subastasGanadas.length;

  const avatarUrl = userData?.photoURL || null;
  const displayName =
    userData?.displayName || userData?.email || "Usuario sin nombre";

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* HEADER */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#02060b]/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
            >
              Volver
            </button>
            <h1 className="text-xl font-bold">Perfil de usuario</h1>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
            >
              Inicio
            </Link>
            {viewer && (
              <Link
                href="/mis-ganadas"
                className="px-3 py-1 rounded bg-indigo-700 hover:bg-indigo-800"
              >
                Mis ganadas
              </Link>
            )}
          </div>
        </header>

        {/* PERFIL NO ENCONTRADO */}
        {loadingUser ? (
          <p className="mt-4 text-sm text-gray-300">Cargando perfil...</p>
        ) : !userData ? (
          <p className="mt-4 text-sm text-gray-400">
            Este usuario aún no tiene un perfil configurado, pero puede tener
            subastas publicadas.
          </p>
        ) : null}

        <section className="mt-4 grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
          {/* PANEL IZQUIERDO */}
          <aside className="bg-[#050914] border border-[#1b2335] rounded-2xl p-5 flex flex-col items-center">
            {/* Avatar */}
            <div className="relative w-28 h-28 rounded-full bg-[#101828] flex items-center justify-center overflow-hidden mb-3">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl font-bold text-emerald-400">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <h2 className="text-lg font-semibold text-white text-center">
              {displayName}
            </h2>
            {userData?.email && (
              <p className="text-xs text-gray-400 mt-1 text-center break-all">
                {userData.email}
              </p>
            )}

            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={handleClickChangeAvatar}
                  disabled={uploadingAvatar}
                  className={`mt-3 text-xs px-3 py-1.5 rounded-full border border-emerald-500 text-emerald-300 hover:bg-emerald-600/10 ${
                    uploadingAvatar ? "opacity-60 cursor-wait" : ""
                  }`}
                >
                  {uploadingAvatar ? "Actualizando foto..." : "Cambiar foto"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
              </>
            )}

            {/* Stats */}
            <div className="mt-5 w-full border-t border-white/5 pt-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Subastas publicadas</span>
                <span className="font-semibold text-white">
                  {totalPublicadas}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">Subastas ganadas</span>
                <span className="font-semibold text-white">
                  {totalGanadas}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">Likes</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">
                    {likesCount}
                  </span>
                  {!loadingLikeState && (
                    <button
                      type="button"
                      onClick={handleToggleLike}
                      disabled={updatingLike || !viewer || viewer?.uid === uid}
                      className={`px-2 py-1 rounded-full text-[11px] font-semibold border ${
                        hasLiked
                          ? "border-pink-500 text-pink-300 bg-pink-900/40"
                          : "border-gray-600 text-gray-300 hover:border-pink-500 hover:text-pink-300"
                      } ${
                        !viewer || viewer?.uid === uid
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      }`}
                    >
                      {viewer?.uid === uid
                        ? "Tu perfil"
                        : hasLiked
                        ? "Quitar like"
                        : "Dar like"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* PANEL DERECHO: subastas */}
          <section className="space-y-6">
            {/* Subastas activas */}
            <div className="bg-[#050914] border border-[#1b2335] rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-white mb-2">
                Subastas activas de este usuario
              </h3>
              {loadingSubastas ? (
                <p className="text-xs text-gray-400">Cargando subastas...</p>
              ) : activas.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No tiene subastas activas en este momento.
                </p>
              ) : (
                <div className="space-y-4">
                  {activas.map((a) => (
                    <SubastaCard
                      key={a.id}
                      auction={a}
                      currentUser={viewer}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Subastas finalizadas */}
            <div className="bg-[#050914] border border-[#1b2335] rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-white mb-2">
                Subastas finalizadas de este usuario
              </h3>
              {loadingSubastas ? (
                <p className="text-xs text-gray-400">Cargando subastas...</p>
              ) : finalizadas.length === 0 ? (
                <p className="text-xs text-gray-500">
                  Todavía no tiene subastas finalizadas.
                </p>
              ) : (
                <div className="space-y-4">
                  {finalizadas.map((a) => (
                    <SubastaCard
                      key={a.id}
                      auction={a}
                      currentUser={viewer}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
