"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "../app/firebase";

export default function MyProfileLink({
  className = "",
  showName = true,
  prefix = "",
}) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsub();
  }, []);

  if (!user) return null;

  return (
    <Link
      href={`/perfil/${user.uid}`}
      className={`text-emerald-400 hover:text-emerald-300 hover:underline ${className}`}
    >
      {prefix}
      {showName ? user.displayName || user.email : "Mi perfil"}
    </Link>
  );
}
