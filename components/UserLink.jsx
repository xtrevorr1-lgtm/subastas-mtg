"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../app/firebase";

/**
 * UserLink
 * - Si wrapped=true: NO crea <Link>, solo <span> (para cuando ya estás dentro de un Link)
 * - Si wrapped=false: crea <Link href="/perfil/uid">
 * - Lee /users/{uid} para:
 *    - Nombre (displayName/searchName) si no le pasas prop "name"
 *    - Badge BANEADO si banned/isBanned true
 */
export default function UserLink({ uid, name, className = "", wrapped = false }) {
  const [isBanned, setIsBanned] = useState(false);
  const [resolvedName, setResolvedName] = useState(name || "");

  useEffect(() => {
    if (!uid) {
      setIsBanned(false);
      setResolvedName(name || "");
      return;
    }

    const userRef = doc(db, "users", uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        const data = snap.exists() ? snap.data() : null;

        const banned = data?.banned === true || data?.isBanned === true;
        setIsBanned(banned);

        // Si el caller NO pasó "name", sacamos uno del perfil
        if (!name || String(name).trim() === "") {
          const n =
            data?.displayName ||
            data?.searchName ||
            "Usuario";
          setResolvedName(n);
        } else {
          setResolvedName(name);
        }
      },
      () => {
        setIsBanned(false);
        setResolvedName(name || "Usuario");
      }
    );

    return () => unsub();
  }, [uid, name]);

  const label = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span>{resolvedName || "Usuario"}</span>

      {isBanned && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/40 border border-red-700/60 text-red-200">
          BANEADO
        </span>
      )}
    </span>
  );

  if (!uid) return <span className={className}>{name || "Usuario"}</span>;

  if (wrapped) {
    return (
      <span className="cursor-pointer text-emerald-400 hover:text-emerald-300 hover:underline">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={`/perfil/${uid}`}
      className="text-emerald-400 hover:text-emerald-300 hover:underline"
    >
      {label}
    </Link>
  );
}
