"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../app/firebase";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../app/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

export default function AppHeader() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(null);
  const router = useRouter();

 useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (u) => {
    setUser(u);

    if (u) {
      // 🔥 Cargar datos reales del usuario desde Firestore
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        setUser((prev) => ({
          ...prev,
          avatarUrl: snap.data().avatarUrl,
          displayName: snap.data().displayName || prev?.displayName,
        }));
      }
    }
  });

  return () => unsub();
}, []);


  const toggleMenu = () => setOpen((prev) => !prev);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  return (
    <>
      {/* TOP HEADER */}
      <header className="sticky top-0 z-50 w-full bg-[#0b0f15]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">

          {/* LOGO */}
          <Link
            href="/"
            className="text-xl font-bold text-emerald-400 tracking-wide hover:text-emerald-300 transition"
          >
            MTG Subastas Perú
          </Link>

          {/* BOTON HAMBURGER (PC y Móvil) */}
          <button
            onClick={toggleMenu}
            className="relative z-[9999] flex flex-col justify-center items-center w-10 h-10 group"
          >
            <span
              className={`block h-0.5 w-6 bg-white transition-all duration-300 ${
                open ? "rotate-45 translate-y-1.5" : ""
              }`}
            ></span>
            <span
              className={`block h-0.5 w-6 bg-white transition-all duration-300 my-1 ${
                open ? "opacity-0" : ""
              }`}
            ></span>
            <span
              className={`block h-0.5 w-6 bg-white transition-all duration-300 ${
                open ? "-rotate-45 -translate-y-1.5" : ""
              }`}
            ></span>
          </button>
        </div>
      </header>

      {/* OVERLAY */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[9980] transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={toggleMenu}
      />

      {/* SIDEBAR */}
      <aside
        className={`fixed top-0 right-0 h-full w-72 max-w-[80%] bg-[#111826]/95 backdrop-blur-xl border-l border-white/10 shadow-xl z-[9990]
        transform transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-5 flex flex-col gap-6">

          {/* PERFIL DEL USUARIO */}
          {user ? (
  <div className="flex items-center gap-3 pb-3 border-b border-white/10">
    <img
      src={user.avatarUrl || user.photoURL || "/default-avatar.png"}
      className="w-12 h-12 rounded-full object-cover border border-white/20"
    />
    <div>
      <p className="font-semibold text-white">{user.displayName}</p>

      <Link
        href={`/perfil/${user.uid}`}
        onClick={toggleMenu}
        className="text-sm text-emerald-400 hover:text-emerald-300"
      >
        Mi perfil
      </Link>
    </div>
  </div>
) : (
  <button
  onClick={() => {
    toggleMenu();
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  }}
  className="text-emerald-400 hover:text-emerald-300"
>
  Iniciar sesión
</button>

)}


          {/* LINKS DEL MENÚ */}
          <nav className="flex flex-col gap-4 text-sm">
            <Link href="/mis-subastas" onClick={toggleMenu} className="hover:text-emerald-400">
              Mis subastas
            </Link>

            <Link href="/mis-participaciones" onClick={toggleMenu} className="hover:text-emerald-400">
              Mis participaciones
            </Link>

            <Link href="/mis-ganadas" onClick={toggleMenu} className="hover:text-emerald-400">
              Ganadas
            </Link>

            <Link href="/chats" onClick={toggleMenu} className="hover:text-emerald-400">
              Chats
            </Link>
              <Link
                href="/buscar-usuarios"
                onClick={toggleMenu}
                className="hover:text-emerald-400"
              >
                Buscar usuarios
              </Link>
             <Link href="/terminos" className="hover:text-gray-200">
            Términos y Condiciones
          </Link>
            <Link href="/privacidad" className="hover:text-gray-200">
            Política de Privacidad
          </Link>

            <Link
              href="/publish"
              onClick={toggleMenu}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white w-fit"
            >
              Publicar
            </Link>
          </nav>

          {/* BOTON CERRAR SESIÓN */}
          {user && (
            <button
              onClick={() => {
                toggleMenu();
                handleLogout();
              }}
              className="mt-6 w-full py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm"
            >
              Cerrar sesión
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
