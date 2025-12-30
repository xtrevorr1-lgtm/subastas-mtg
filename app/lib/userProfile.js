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

  const safeDisplayName =
  displayName?.trim() ||
  email?.split("@")[0] ||
  "usuario";

const searchName = safeDisplayName.toLowerCase();


  // =========================
  // 1) SI NO EXISTE: CREAR
  // =========================
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid,
      displayName: safeDisplayName,
displayNameLower: searchName,
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
  !data.displayName ||
  !data.searchName ||
  !data.email ||
  data.displayName !== safeDisplayName ||
  data.searchName !== searchName;


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
      displayName: safeDisplayName,
      displayNameLower: searchName, // 🔥 ESTE ES EL QUE USA EL BUSCADOR
      searchName, // puedes dejarlo si ya existe
      email: email || data.email || "",
      photoURL: photoURL || data.photoURL || "",
      avatarUrl: photoURL || data.avatarUrl || "",
      repairedAt: serverTimestamp(), // 👈 trazabilidad
    }
  : {}),


      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
