"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import UserLink from "../../../components/UserLink";
export default function ProgramadaPage() {
  const { id } = useParams();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔥 Cargar la subasta programada
  useEffect(() => {
    if (!id) return;

    const ref = doc(db, "subastas", id);


    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setAuction(null);
        } else {
          const data = snap.data();

          let startAtMs = null;
if (data.publicarEn?.toDate) {
  startAtMs = data.publicarEn.toDate().getTime();
}


          setAuction({
            id: snap.id,
            ...data,
            startAt: startAtMs,
          });
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error cargando subasta programada:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#02060b] text-gray-100 flex items-center justify-center">
        Cargando subasta programada...
      </main>
    );
  }

  if (!auction) {
    return (
      <main className="min-h-screen bg-[#02060b] text-gray-100 flex items-center justify-center">
        ❌ Subasta programada no encontrada.
      </main>
    );
  }

  const {
    titulo,
    imageUrls,
    imageUrl,
    vendedorUid,
    vendedorAvatar,
    vendedorNameSnapshot,
    precioBase,
    precioReferencial,
    precioReferencialCurrency,
    pujaMinima,
    compraDirecta,
    cantidad,
    publicarEn: startAtMs,
    zonaEntrega,
  } = auction;

  // 📸 Imagen
  const cardImage = Array.isArray(imageUrls) && imageUrls.length > 0
    ? imageUrls[0]
    : imageUrl || "/placeholder.png";

  // 🧑‍💼 Nombre del vendedor
  const sellerName = vendedorNameSnapshot || "Vendedor";

  // 🕒 Fecha de inicio
  const startAtText = startAt
    ? new Date(startAt).toLocaleString("es-PE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Sin fecha";

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* REGRESAR */}
        <Link href="/mis-subastas" className="text-sm text-emerald-400 hover:underline">
          ← Volver a mis subastas
        </Link>

        <h1 className="text-2xl font-bold mt-3 mb-6">Subasta Programada</h1>

        <div className="bg-[#0c0f16] border border-white/10 rounded-xl p-5 shadow-xl">

          {/* TÍTULO */}
          <h2 className="text-xl font-bold text-white mb-4">{titulo}</h2>

          {/* IMAGEN */}
          <div className="w-full flex justify-center mb-5">
            <img
              src={cardImage}
              alt={titulo}
              className="max-w-[240px] rounded-lg border border-white/10 shadow-lg"
            />
          </div>

          {/* INFORMACIÓN */}
          <div className="space-y-3 text-sm">

            <p className="text-gray-300">
              <span className="text-gray-400">Vendedor: </span>
              <UserLink uid={vendedorUid} name={sellerName} wrapped />
            </p>

            <p className="text-gray-300">
              <span className="text-gray-400">Fecha de inicio: </span>
              {startAtText}
            </p>

            <p className="text-gray-300">
              <span className="text-gray-400">Precio base: </span>
              S/ {precioBase}
            </p>

            <p className="text-gray-300">
              <span className="text-gray-400">Puja mínima: </span>
              +S/ {pujaMinima}
            </p>

            <p className="text-gray-300">
              <span className="text-gray-400">Compra directa: </span>
              {compraDirecta ? `S/ ${compraDirecta}` : "No disponible"}
            </p>

            {precioReferencial && (
              <p className="text-gray-300">
                <span className="text-gray-400">Precio referencial: </span>
                {precioReferencialCurrency === "PEN" ? "S/" : "$"}{" "}
                {precioReferencial}
              </p>
            )}

            {cantidad && (
              <p className="text-gray-300">
                <span className="text-gray-400">Cantidad de copias: </span>
                {cantidad}
              </p>
            )}

            {zonaEntrega && (
              <p className="text-gray-300">
                <span className="text-gray-400">Zona de entrega: </span>
                {zonaEntrega}
              </p>
            )}
          </div>

          {/* BOTÓN EDITAR */}
          <div className="mt-6">
            <Link
              href={`/programada/${id}/editar`}
              className="inline-block px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              ✏️ Editar subasta programada
            </Link>
          </div>

        </div>
      </div>
    </main>
  );
}
