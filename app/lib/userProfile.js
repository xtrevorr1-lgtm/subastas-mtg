"use client";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Crea o actualiza el perfil básico de un usuario en /users/{uid}
 * usando los datos de Firebase Auth.
 *
 * - Si NO existe, lo crea con defaults.
 * - Si existe, asegura flags faltantes (role/isAdmin/banned/isBanned)
 *   y actualiza displayName/photo/searchName si cambiaron.
 */
export async function ensureUserProfile(user) {
  if (!user) return;

  const { uid, displayName, email, photoURL } = user;

  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);

  const searchName = (displayName || "").toLowerCase();

  // =========================
  // 1) SI NO EXISTE: CREAR
  // =========================
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid,
      displayName: displayName || "",
      searchName,
      email: email || "",
      photoURL: photoURL || "",
      avatarUrl: photoURL || "",
      avatarPath: null,
      likesCount: 0,

      // ✅ defaults importantes para tus reglas
      role: "user",
      isAdmin: false,
      banned: false,
      isBanned: false,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return;
  }

  // =========================
  // 2) SI EXISTE: MERGE
  // =========================
  const data = snap.data() || {};

  // A) asegurar flags para usuarios antiguos
  const needsFlags =
    data.role == null ||
    data.isAdmin == null ||
    data.banned == null ||
    data.isBanned == null;

  // B) actualizar datos si cambiaron
  const needsProfileUpdate =
    (data.displayName || "") !== (displayName || "") ||
    (data.photoURL || "") !== (photoURL || "") ||
    (data.searchName || "") !== searchName;

  // Si no hay nada que cambiar, salimos
  if (!needsFlags && !needsProfileUpdate) return;

  await setDoc(
    userRef,
    {
      ...(needsFlags
        ? {
            role: data.role ?? "user",
            isAdmin: data.isAdmin ?? false,
            banned: data.banned ?? false,
            isBanned: data.isBanned ?? false,
          }
        : {}),

      ...(needsProfileUpdate
        ? {
            displayName: displayName || data.displayName || "",
            searchName,
            photoURL: photoURL || data.photoURL || "",
            avatarUrl: photoURL ? photoURL : data.avatarUrl || "",
          }
        : {}),

      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
