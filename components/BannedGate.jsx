"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../app/firebase";
import { usePathname, useRouter } from "next/navigation";

export default function BannedGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const [ready, setReady] = useState(false);
  const [banned, setBanned] = useState(false);

  useEffect(() => {
    let unsubUser = null;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      // limpia listener anterior si existía
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      if (!u) {
        setBanned(false);
        setReady(true);
        return;
      }

      const ref = doc(db, "users", u.uid);
      unsubUser = onSnapshot(
        ref,
        (snap) => {
          const d = snap.exists() ? snap.data() : {};
          const isB = d?.banned === true || d?.isBanned === true;
          setBanned(!!isB);
          setReady(true);
        },
        () => {
          // si falla leer perfil, NO bloquees toda la app
          setBanned(false);
          setReady(true);
        }
      );
    });

    return () => {
      if (unsubUser) unsubUser();
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!banned) return;

    // permite la propia página banned sin loop
    if (pathname === "/banned") return;

    // deja pasar legal/terminos si quieres (opcional)
    // if (pathname.startsWith("/terminos")) return;

    router.replace("/banned");
  }, [ready, banned, pathname, router]);

  if (!ready) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-300">
        Cargando...
      </div>
    );
  }

  // ✅ Importante: si estás en /banned, SIEMPRE deja renderizar children
  if (pathname === "/banned") return <>{children}</>;

  // ✅ Si está baneado, bloquea el contenido (mientras redirige)
  if (banned) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-300">
        Estás baneado.
      </div>
    );
  }

  return <>{children}</>;
}
