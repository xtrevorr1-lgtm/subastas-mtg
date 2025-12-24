"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../../../firebase";


export default function EditarProgramada() {
  const { id } = useParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // FORM FIELDS
  const [titulo, setTitulo] = useState("");
  const [precioBase, setPrecioBase] = useState("");
  const [pujaMinima, setPujaMinima] = useState("");
  const [compraDirecta, setCompraDirecta] = useState("");
  const [precioReferencial, setPrecioReferencial] = useState("");
  const [precioReferencialCurrency, setPrecioReferencialCurrency] = useState("USD");
  const [cantidad, setCantidad] = useState("");
  const [zonaEntrega, setZonaEntrega] = useState("");
  const [startAt, setStartAt] = useState("");
  const [imagenes, setImagenes] = useState([]);
  const [nuevasImagenes, setNuevasImagenes] = useState([]);

  // 🔥 Cargar datos de la subasta programada
  useEffect(() => {
    if (!id) return;

    const cargar = async () => {
      try {
       
     const ref = doc(db, "programadas", id);

        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setLoading(false);
          return;
        }

        const data = snap.data();
   
        setImagenes(data.imageUrls || (data.imageUrl ? [data.imageUrl] : []));
        setTitulo(data.titulo || "");
        setPrecioBase(String(data.precioBase || ""));
        setPujaMinima(String(data.pujaMinima || ""));
        setCompraDirecta(String(data.compraDirecta || ""));
        setPrecioReferencial(String(data.precioReferencial || ""));
        setPrecioReferencialCurrency(data.precioReferencialCurrency || "USD");
        setCantidad(String(data.cantidad || ""));
        setZonaEntrega(data.zonaEntrega || "");

        // Fecha
        let ms = null;
        if (data.startAt?.toDate) ms = data.startAt.toDate().getTime();
        else if (typeof data.startAt === "number") ms = data.startAt;

        if (ms) {
          const iso = new Date(ms).toISOString().slice(0, 16); // formato YYYY-MM-DDTHH:mm
          setStartAt(iso);
        }

        setLoading(false);
      } catch (err) {
        console.error("Error cargando subasta programada:", err);
        setLoading(false);
      }
    };

    cargar();
  }, [id]);

  // ✏ Guardar cambios
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    // 🔥 PROCESAR IMÁGENES
    const ref = doc(db, "programadas", id);
    const snap = await getDoc(ref);
    const data = snap.data() || {};


    let nuevasUrlsFinales = [...imagenes]; // lo que queda después de borrar

    // 1) Borrar en Storage las eliminadas
    if (data.imageUrls || data.imageUrl) {
  const urlsOriginales = data.imageUrls || (data.imageUrl ? [data.imageUrl] : []);

  for (const url of urlsOriginales) {
    if (!nuevasUrlsFinales.includes(url)) {
      try {
        const clean = url.split("?")[0];
        const path = decodeURIComponent(clean.split("/o/")[1]);
        await deleteObject(storageRef(storage, path));
      } catch (err) {
        console.warn("No se pudo borrar imagen:", err);
      }
    }
  }
}

// 2) Subir imágenes nuevas
if (nuevasImagenes.length > 0) {
  for (const file of nuevasImagenes) {
    const refFile = storageRef(storage, `programadas/${id}/${Date.now()}_${file.name}`);
    await uploadBytes(refFile, file);
    const downloadURL = await getDownloadURL(refFile);
    nuevasUrlsFinales.push(downloadURL);
  }
}

    try {
      const ref = doc(db, "programadas", id);

      await updateDoc(ref, {
        titulo: titulo.trim(),
        precioBase: Number(precioBase),
        pujaMinima: Number(pujaMinima),
        compraDirecta: compraDirecta ? Number(compraDirecta) : null,
        precioReferencial: precioReferencial ? Number(precioReferencial) : null,
        precioReferencialCurrency,
        cantidad: cantidad ? Number(cantidad) : 1,
        zonaEntrega: zonaEntrega.trim() || null,
        startAt: startAt ? new Date(startAt).getTime() : null,
        imageUrls: nuevasUrlsFinales,

      });

      alert("✔ Subasta programada actualizada correctamente.");
      router.push(`/programada/${id}`);

    } catch (err) {
      console.error("Error guardando subasta:", err);
      alert("❌ Error al guardar los cambios.");
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#02060b] text-gray-100 flex items-center justify-center">
        Cargando datos...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-6">

        <Link href={`/programada/${id}`} className="text-emerald-400 hover:underline text-sm">
          ← Volver a subasta programada
        </Link>

        <h1 className="text-2xl font-bold mt-4 mb-6">Editar Subasta Programada</h1>
{/* BOTÓN ELIMINAR SUBASTA PROGRAMADA */}
<div className="mb-6">
  <button
    onClick={async () => {
      const ok = confirm("¿Eliminar esta subasta programada permanentemente?");
      if (!ok) return;

      try {
        await deleteDoc(doc(db, "programadas", id));
        alert("Subasta programada eliminada exitosamente");
        router.push("/mis-subastas");
      } catch (err) {
        console.error(err);
        alert("❌ Error al eliminar la subasta");
      }
    }}
    className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-semibold"
  >
    🗑 Eliminar subasta programada
  </button>
</div>

        <form onSubmit={handleSave} className="space-y-5 bg-[#0c0f16] p-5 rounded-xl border border-white/10">

          {/* TÍTULO */}
          <div>
            <label className="block text-sm mb-1">Título</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full bg-[#050914] border border-gray-700 rounded-lg px-3 py-2"
              required
            />
          </div>

          {/* PRECIO BASE */}
          <div>
            <label className="block text-sm mb-1">Precio base</label>
            <input
              type="number"
              value={precioBase}
              onChange={(e) => setPrecioBase(e.target.value)}
              className="w-full bg-[#050914] border border-gray-700 rounded-lg px-3 py-2"
              required
            />
          </div>

          {/* PUJA MÍNIMA */}
          <div>
            <label className="block text-sm mb-1">Puja mínima</label>
            <input
              type="number"
              value={pujaMinima}
              onChange={(e) => setPujaMinima(e.target.value)}
              className="w-full bg-[#050914] border border-gray-700 rounded-lg px-3 py-2"
              required
            />
          </div>

          {/* COMPRA DIRECTA */}
          <div>
            <label className="block text-sm mb-1">Compra directa</label>
            <input
              type="number"
              value={compraDirecta}
              onChange={(e) => setCompraDirecta(e.target.value)}
              placeholder="Vacío = sin compra directa"
              className="w-full bg-[#050914] border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>

          {/* PRECIO REFERENCIAL + MONEDA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Precio referencial</label>
              <input
                type="number"
                value={precioReferencial}
                onChange={(e) => setPrecioReferencial(e.target.value)}
                className="w-full bg-[#050914] border border-gray-700 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Moneda</label>
              <select
                value={precioReferencialCurrency}
                onChange={(e) => setPrecioReferencialCurrency(e.target.value)}
                className="w-full bg-[#050914] border border-gray-700 rounded-lg px-3 py-2"
              >
                <option value="USD">USD ($)</option>
                <option value="PEN">PEN (S/)</option>
              </select>
            </div>
          </div>

          {/* CANTIDAD */}
          <div>
            <label className="block text-sm mb-1">Cantidad de copias</label>
            <input
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="w-full bg-[#050914] border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>

          {/* ZONA DE ENTREGA */}
          <div>
            <label className="block text-sm mb-1">Zona de entrega</label>
            <input
              value={zonaEntrega}
              onChange={(e) => setZonaEntrega(e.target.value)}
              className="w-full bg-[#050914] border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>

          {/* FECHA DE INICIO */}
          <div>
            <label className="block text-sm mb-1">Fecha y hora de inicio</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full bg-[#050914] border border-gray-700 rounded-lg px-3 py-2"
              required
            />
          </div>
{/* IMÁGENES ACTUALES */}
<div>
  <label className="block text-sm mb-2 font-semibold">Imágenes actuales</label>

  {imagenes.length === 0 && (
    <p className="text-gray-400 text-sm mb-2">Esta subasta no tiene imágenes.</p>
  )}

  <div className="flex flex-wrap gap-3 mb-3">
    {imagenes.map((url, idx) => (
      <div key={idx} className="relative">
        <img
          src={url}
          className="w-24 h-32 object-cover rounded-lg border border-white/10"
        />

        <button
          type="button"
          onClick={() => {
            const ok = confirm("¿Eliminar esta imagen?");
            if (!ok) return;

            setImagenes((prev) => prev.filter((_, i) => i !== idx));
          }}
          className="absolute top-1 right-1 bg-red-600 text-white text-xs px-2 py-1 rounded"
        >
          ✕
        </button>
      </div>
    ))}
  </div>

  <input
    type="file"
    multiple
    accept="image/*"
    onChange={(e) => setNuevasImagenes([...e.target.files])}
    className="text-sm"
  />

  {nuevasImagenes.length > 0 && (
    <p className="text-emerald-400 text-xs mt-1">
      Se cargarán {nuevasImagenes.length} nueva(s) imagen(es)
    </p>
  )}
</div>

          {/* BOTÓN GUARDAR */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-semibold disabled:opacity-70"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </div>
    </main>
  );
}
