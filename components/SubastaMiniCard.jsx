"use client";

import { useRouter } from "next/navigation";

export default function SubastaMiniCard({ subasta }) {
  const router = useRouter();
  if (!subasta) return null;

  const {
    id,
    titulo,
    imageUrls,
    imageUrl,
    precioActual,
    precioBase,
    compraDirecta,
    vendedorUid,
    vendedorNameSnapshot,
    vendedorName,
    vendedorPhotoURL,
    vendedorAvatar,
    finaliza,
  } = subasta;

  const cardImage =
    Array.isArray(imageUrls) && imageUrls.length > 0
      ? imageUrls[0]
      : imageUrl || "/placeholder.png";

  const sellerName =
    vendedorNameSnapshot ||
    vendedorName ||
    "Vendedor";

  const sellerPhoto =
    vendedorPhotoURL || vendedorAvatar || null;

  const currentPrice =
    typeof precioActual === "number"
      ? precioActual
      : (precioBase ?? 0);

  let finalizaText = "";
  let finalizada = false;

 const now = Date.now();

// usar finaliza si existe
let isClosedByTime = false;


if (typeof finaliza === "number") {
  const date = new Date(finaliza);
  isClosedByTime = date.getTime() <= now;

  finalizaText = date.toLocaleString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

// estado REAL (Firestore tiene prioridad)
const isClosed = subasta.status === "closed" || isClosedByTime;


  return (
    <div
      onClick={() =>
        router.push(
          subasta.source === "programadas"
            ? `/programada/${id}`
            : `/subasta/${id}`
        )
      }
      className={`block cursor-pointer rounded-xl transition p-3 shadow-md ${
        subasta.source === "programadas"
          ? "bg-blue-900/20 border border-blue-500/40 hover:border-blue-400"
          : "bg-[#0c0f16] border border-white/10 hover:border-emerald-500 hover:bg-[#141a24]"
      }`}
    >
      {/* Estado de participación */}
      {subasta.vasGanando !== undefined && (
        subasta.vasGanando ? (
          <div className="mb-2 px-2 py-1 rounded-md bg-emerald-700/30 border border-emerald-500/40 text-[11px] text-emerald-300 font-semibold">
            ✔ Vas ganando esta subasta
          </div>
        ) : (
          <div className="mb-2 px-2 py-1 rounded-md bg-red-700/20 border border-red-500/30 text-[11px] text-red-300">
            ✖ Otro postor va ganando
          </div>
        )
      )}

      {/* FOTO + NOMBRE */}
      <div className="flex items-center gap-2 mb-2">

        {/* FOTO - clickeable */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/perfil/${vendedorUid}`);
          }}
          className="w-8 h-8 rounded-full overflow-hidden border border-white/10 cursor-pointer hover:opacity-80 transition p-0"
        >
                    {sellerPhoto ? (
            <img src={sellerPhoto} className="w-full h-full object-cover" />
          ) : (

            <div className="w-full h-full bg-emerald-700 text-white flex items-center justify-center font-bold">
              {sellerName.charAt(0).toUpperCase()}
            </div>
          )}
        </button>

        {/* NOMBRE - clickeable */}
        <span
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/perfil/${vendedorUid}`);
          }}
          className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
        >
          {sellerName}
        </span>
      </div>

      {/* Título */}
      <h2 className="text-sm font-semibold text-white mb-2 line-clamp-2">
        {titulo}
      </h2>

      {/* Imagen */}
      <div className="aspect-[4/5] w-full rounded-lg overflow-hidden border border-white/10 mb-3">
        <img
          src={cardImage}
          className="w-full h-full object-cover transition-transform duration-300 ease-out hover:scale-110"
        />
      </div>

      {/* Tiempo */}
      {subasta.source === "programadas" ? (
        <p className="text-[11px] text-blue-300 mb-1">
          🕒 Empieza:{" "}
          {new Date(subasta.startAt).toLocaleString("es-PE", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
          })}
        </p>
      ) : (
        <p className="text-[11px] text-gray-400 mb-1">
          {isClosed ? "⛔ Finalizada" : `⏳ Finaliza: ${finalizaText}`}
        </p>
      )}

      {/* Precio */}
      <div className="text-sm font-semibold">
        {compraDirecta && (
          <p className="text-emerald-300">
            💰 Compra directa: <span className="text-white">S/ {compraDirecta}</span>
          </p>
        )}
        <p className="text-emerald-400">
          🏷 Precio actual: <span className="text-white">S/ {currentPrice}</span>
        </p>
      </div>
    </div>
  );
}
