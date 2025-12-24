"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  doc,
  serverTimestamp,
  limit,
} from "firebase/firestore";

import { auth, db } from "../app/firebase";

export default function AutoPublisher() {
  const [uid, setUid] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;

    const interval = setInterval(async () => {
      try {
        const now = Date.now();

        // ✅ SOLO scheduled del usuario logueado (vendedor)
        const q = query(
          collection(db, "subastas"),
          where("status", "==", "scheduled"),
          where("vendedorUid", "==", uid),
          limit(25)
        );

        const snap = await getDocs(q);

        for (const d of snap.docs) {
          const ref = doc(db, "subastas", d.id);
          const data = d.data();

          const publicarEn =
            data.publicarEn?.toMillis?.() ??
            (typeof data.publicarEn === "number" ? data.publicarEn : null);

          if (!publicarEn) continue;
          if (publicarEn > now) continue;

          await runTransaction(db, async (tx) => {
            const fresh = await tx.get(ref);
            if (!fresh.exists()) return;

            const snapData = fresh.data();
            if (snapData.status !== "scheduled") return;

            // activar
            tx.update(ref, {
              status: "active",
              publicadaEn: serverTimestamp(),
              processing: false,
            });
          });

          console.log("⏰ Subasta activada:", d.id);
        }
      } catch (err) {
        console.error("Error auto-publicando subastas:", err);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [uid]);

  return null;
}
