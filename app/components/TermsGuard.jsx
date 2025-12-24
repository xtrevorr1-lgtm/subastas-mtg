"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { TERMS_VERSION } from "../lib/legal";

export default function TermsGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      // Rutas permitidas SIN aceptar términos
      if (
  pathname.startsWith("/aceptar-terminos") ||
  pathname.startsWith("/terminos") ||
  pathname.startsWith("/banned")
) {
  return;
}


      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);

      const data = snap.exists() ? snap.data() : null;
      const accepted = !!data?.termsAcceptedAt;
      const versionOk = data?.termsVersion === TERMS_VERSION;

      if (!accepted || !versionOk) {
        router.replace("/aceptar-terminos");
      }
    });

    return () => unsub();
  }, [pathname, router]);

  return null; // 👈 IMPORTANTE
}
