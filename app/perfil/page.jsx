"use client";

import { useEffect, useState } from "react";
import { auth, db, storage } from "../firebase";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function PerfilPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newPhoto, setNewPhoto] = useState(null);
  const [saving, setSaving] = useState(false);

  // Cargar sesión
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(u);

      // Cargar perfil desde Firestore
      const refUser = doc(db, "users", u.uid);
      const snap = await getDoc(refUser);

      if (snap.exists()) {
        setProfile(snap.data());
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <main className="text-center text-gray-300 mt-10">
        Cargando perfil...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="text-center text-gray-300 mt-10">
        Debes iniciar sesión.
      </main>
    );
  }

  const handleSave = async () => {
    if (!profile) return;

    setSaving(true);

    let newPhotoURL = profile.photoURL;
    let newPhotoPath = profile.photoPath || null;

    // 📌 1) SUBIR FOTO NUEVA
    if (newPhoto) {
      const newPath = `profilePhotos/${user.uid}_${Date.now()}.jpg`;
      const storageRef = ref(storage, newPath);

      await uploadBytes(storageRef, newPhoto);
      newPhotoURL = await getDownloadURL(storageRef);

      // 📌 2) BORRAR FOTO ANTERIOR
      if (newPhotoPath) {
        try {
          const oldRef = ref(storage, newPhotoPath);
          await deleteObject(oldRef);
        } catch (err) {
          console.log("Foto anterior no encontrada o ya eliminada.");
        }
      }

      newPhotoPath = newPath;
    }

    // 📌 3) ACTUALIZAR FIRESTORE
    const refUser = doc(db, "users", user.uid);
    await updateDoc(refUser, {
      displayName: profile.displayName || "",
      photoURL: newPhotoURL || "",
      photoPath: newPhotoPath || null,
      updatedAt: serverTimestamp(),
    });

    alert("Perfil actualizado correctamente.");

    setNewPhoto(null);

    // Refrescar datos
    const snap = await getDoc(refUser);
    if (snap.exists()) {
      setProfile(snap.data());
    }

    setSaving(false);
  };

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100 px-4 py-6">
      <div className="max-w-xl mx-auto bg-[#0b1017] p-6 rounded-xl border border-white/10">

        <h1 className="text-2xl font-bold mb-4">Mi Perfil</h1>

        {/* FOTO */}
        <div className="flex flex-col items-center mb-4">
          <img
            src={
              newPhoto
                ? URL.createObjectURL(newPhoto)
                : profile?.photoURL || "/default-avatar.png"
            }
            className="w-32 h-32 rounded-full object-cover mb-3 border border-white/20"
          />

          <input
            type="file"
            accept="image/*"
            onChange={(e) => setNewPhoto(e.target.files[0] || null)}
            className="text-sm"
          />
        </div>

        {/* NOMBRE */}
        <label className="block text-sm mb-1">Nombre:</label>
        <input
          type="text"
          value={profile?.displayName || ""}
          onChange={(e) =>
            setProfile({ ...profile, displayName: e.target.value })
          }
          className="w-full px-3 py-2 rounded bg-[#111722] border border-white/10 mb-4"
        />

        {/* GUARDAR */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-700 font-semibold"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>

        <button
  onClick={() => {
    if (document.referrer && document.referrer !== window.location.href) {
      router.back();       // 🔙 regresar si viene de una navegación real
    } else {
      router.push("/");    // 🏠 fallback seguro si entró directo
    }
  }}
  className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
>
  Volver
</button>

      </div>
    </main>
  );
}
