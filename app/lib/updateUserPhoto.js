"use client";

import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";

/**
 * Sube una nueva foto, borra la anterior y actualiza el perfil del usuario
 */
export async function updateUserPhoto(uid, previousPath, newFile) {
  if (!uid || !newFile) return;

  // Ruta nueva
  const newPath = `profilePhotos/${uid}_${Date.now()}.jpg`;
  const storageRef = ref(storage, newPath);

  // 1️⃣ Subir imagen
  await uploadBytes(storageRef, newFile);
  const newURL = await getDownloadURL(storageRef);

  // 2️⃣ Actualizar Firestore
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, {
    photoURL: newURL,
    photoPath: newPath,
    updatedAt: serverTimestamp(),
  });

  // 3️⃣ Borrar foto anterior si existe
  if (previousPath) {
    try {
      const oldRef = ref(storage, previousPath);
      await deleteObject(oldRef);
    } catch {
      // Ignorar si no existe
    }
  }

  return newURL;
}
