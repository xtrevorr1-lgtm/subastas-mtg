"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
  runTransaction
} from "firebase/firestore";

import UserLink from "../components/UserLink";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { db, storage } from "../app/firebase";
import { ensureChatForClosedAuction } from "../app/lib/chatUtils";
import { getChatIdForUsers } from "../app/lib/chatUtils-helpers";
import { isUserAdmin } from "../app/lib/admin";
import { isUserBanned } from "../app/lib/ban";

function formatTime(ms) {
  if (!ms || ms <= 0) return "Finalizada";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
 

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export default function SubastaCard({
  auction,
  currentUser = null,
  isAdmin = false,
  onBid = () => {},
  onBuyNow = () => {},
  isProcessingBuyNow = false,
}) {

  const {
    id,
    // ❌ SIN defaults aquí, los normalizamos abajo
    titulo,
    precioBase,
    compraDirecta,
    pujaMinima,
    precioActual = null,
    cantidad = 1,
    finaliza,
    status = "active",
    vendedorUid = null,
    vendedorName = "Vendedor",
    vendedorContacto = "",
    descripcion = null,
    zonaEntrega = null,
    imageUrl = null,
    imageUrls = [],
    precioReferencial = null,
    precioReferencialCurrency = "USD",
    ultimoPostorName = null,
    ultimoPostorUid = null,
    copiasVendidas = 0,
    winners = null,
    winnerUids = null,
    winnerQuantities = null,
    numeroSecuencial = null,
    index = null,
  } = auction || {};

  // 👉 ELEGIR NÚMERO PARA "SUBASTA N°"
  const displaySubastaNumber =
    index != null
      ? index
      : numeroSecuencial != null
      ? numeroSecuencial
      : id || "—";

  // ✅ Normalizar título
  const tituloMostrar =
    typeof titulo === "string" && titulo.trim().length > 0
      ? titulo
      : "Sin título";

  // ✅ Normalizar precio base
  const precioBaseNum = (() => {
    if (typeof precioBase === "number") return precioBase;
    if (typeof precioBase === "string") {
      const n = Number(precioBase);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  })();

  // ✅ Normalizar puja mínima
  const pujaMinimaNum = (() => {
    if (typeof pujaMinima === "number") return pujaMinima || 1;
    if (typeof pujaMinima === "string") {
      const n = Number(pujaMinima);
      return Number.isFinite(n) && n > 0 ? n : 1;
    }
    return 1;
  })();

  // ✅ Normalizar compra directa
  const compraDirectaNum = (() => {
    if (compraDirecta == null) return null;
    if (typeof compraDirecta === "number") return compraDirecta;
    if (typeof compraDirecta === "string") {
      const n = Number(compraDirecta);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  })();

  // ✅ Precio actual seguro
  const safePrecioActual = (() => {
    const nAct =
      precioActual != null ? Number(precioActual) : Number.NaN;
    if (Number.isFinite(nAct) && nAct > 0) return nAct;
    return precioBaseNum;
  })();

  // ✅ Si aún no hay pujas, la primera puja puede ser el precio base.
const hasBids = !!ultimoPostorUid; // (o usa otra señal si prefieres)
const minNext = hasBids ? (safePrecioActual + pujaMinimaNum) : precioBaseNum;


  const [bidInput, setBidInput] = useState("");
  const [bidError, setBidError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [zoomOpen, setZoomOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [buyNowQty, setBuyNowQty] = useState(1);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
 const [isAdminLocal, setIsAdminLocal] = useState(false);

useEffect(() => {
  let alive = true;

  (async () => {
    if (!currentUser?.uid) {
      if (alive) setIsAdminLocal(false);
      return;
    }
    const ok = await isUserAdmin(currentUser.uid);
    if (alive) setIsAdminLocal(!!ok);
  })();

  return () => {
    alive = false;
  };
}, [currentUser?.uid]);


  // Todas las imágenes disponibles de la subasta
  const allImages =
    Array.isArray(imageUrls) && imageUrls.length > 0
      ? imageUrls
      : imageUrl
      ? [imageUrl]
      : [];

  const currentImage =
    allImages.length > 0
      ? allImages[Math.min(activeImageIndex, allImages.length - 1)]
      : null;

  // Cálculo de copias restantes
  const cantidadNum = Number(cantidad || 1);
  const copiasVendidasNum = Number(copiasVendidas || 0);
  const copiasRestantes =
    cantidadNum > 0
      ? Math.max(0, cantidadNum - Math.max(0, copiasVendidasNum))
      : 0;

  // Copias que este usuario lleva acumuladas
  const userTotalCopies =
    currentUser &&
    winnerQuantities &&
    typeof winnerQuantities === "object"
      ? Number(winnerQuantities[currentUser.uid] || 0)
      : 0;

  const esMultiBuyNow = cantidadNum > 1;

  // Historial de pujas
  const [showHistory, setShowHistory] = useState(false);
  const [bids, setBids] = useState([]);
  const [loadingBids, setLoadingBids] = useState(false);

  // Para no intentar crear el chat más de una vez desde aquí
  const [chatEnsured, setChatEnsured] = useState(false);
    const [closingByTime, setClosingByTime] = useState(false);
  const [closedProcessed, setClosedProcessed] = useState(false);


  // Fecha final como Date
  const finalDate = useMemo(() => {
    if (!finaliza) return null;
    const d = new Date(finaliza);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [finaliza]);

  // Reloj para el countdown
  useEffect(() => {
    const idInterval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(idInterval);
  }, []);

  const remainingMs =
    finalDate && !Number.isNaN(finalDate.getTime())
      ? finalDate.getTime() - now.getTime()
      : 0;

  const expiredByTime = finalDate && remainingMs <= 0;
  const isClosed = status === "closed" || expiredByTime;

  function formatCountdown(ms) {
    if (!ms || ms <= 0) return "Finalizada";

    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    const hh = h.toString().padStart(2, "0");
    const mm = m.toString().padStart(2, "0");
    const ss = s.toString().padStart(2, "0");

    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${mm}:${ss}`;
    return `${s}s`;
  }

  // Tiempo formateado final
  const countdownText =
    !isClosed && remainingMs > 0
      ? formatCountdown(remainingMs)
      : "Finalizada";

  // Colores según urgencia
  let timeColor = "text-emerald-300 bg-emerald-900/40 border-emerald-700/60";

  if (remainingMs <= 5 * 60 * 1000) {
    timeColor = "text-yellow-300 bg-yellow-900/40 border-yellow-600/60";
  }
  if (remainingMs <= 60 * 1000) {
    timeColor = "text-red-300 bg-red-900/40 border-red-600/60 animate-pulse";
  }
  if (isClosed) {
    timeColor = "text-red-300 bg-red-900/40 border-red-600/60";
  }

  // Barra de progreso
  let progress = 100;
  if (finalDate && auction.createdAt?.toMillis?.()) {
    const totalTime = finalDate.getTime() - auction.createdAt.toMillis();
    progress = Math.max(0, Math.min(100, (remainingMs / totalTime) * 100));
  }

  // ¿Cuántas copias tiene este usuario?
  const currentUserHasCopies = userTotalCopies > 0;

  // ¿Es el último postor de la subasta?
  const currentUserIsLastBidder =
    !!currentUser && !!ultimoPostorUid && currentUser.uid === ultimoPostorUid;

  // ✅ Banner verde: ganador real o comprador
  const isWinner =
    currentUserHasCopies || (isClosed && currentUserIsLastBidder);

  // 🟦 Banner azul: vas ganando pero la subasta sigue
  const isLeading =
    !isClosed && currentUserIsLastBidder && !currentUserHasCopies;
    
 useEffect(() => {
  // Solo cuando ya expiró por tiempo
  if (!expiredByTime) return;
   // ✅ Solo participantes pueden crear/actualizar el chat
  // (Si cualquier random lo intenta → permission-denied)
  
  if (!currentUser?.uid) return;
  const isParticipant =
    currentUser.uid === vendedorUid || currentUser.uid === ultimoPostorUid;
  if (!isParticipant) return;
    const canCloseAuction =
    currentUser.uid === vendedorUid || isAdminLocal === true;

  // Evitar correr mil veces
  if (closedProcessed) return;

  // Necesitamos IDs mínimos
  if (!auction?.id && !id) return;
  if (!vendedorUid) return;
  if (!ultimoPostorUid) return; // si no hay postor, no hay a quién mandar

  const subastaId = auction?.id || id;

  (async () => {
    try {
      // 1) Intentar cerrar la subasta en Firestore (best-effort)
      //    (Si reglas no dejan, igual intentaremos asegurar el chat)
           // 1) Cerrar subasta en Firestore SOLO si eres vendedor o admin
      if (canCloseAuction && !closingByTime) {
        setClosingByTime(true);

        try {
          await runTransaction(db, async (tx) => {
            const ref = doc(db, "subastas", subastaId);
            const snap = await tx.get(ref);
            if (!snap.exists()) return;

            const data = snap.data();

            // Si ya está cerrada, no rehacer
            if (data.status === "closed") return;

            // Si todavía NO expiró realmente (por seguridad)
            const finalMs =
              data.finaliza?.toDate?.()?.getTime?.() ??
              (typeof data.finaliza === "number" ? data.finaliza : null);

            if (!finalMs || Date.now() < finalMs) return;

            const total = Number(data.cantidad || 1);

            const prevWinners = data.winnerQuantities || {};
            const hasAnyWinner =
              prevWinners &&
              typeof prevWinners === "object" &&
              Object.keys(prevWinners).length > 0;

            const patch = {
              status: "closed",
              closedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };

            if (!hasAnyWinner) {
              patch.winnerQuantities = { [data.ultimoPostorUid]: total };
              patch.copiasVendidas = total;
            }

            tx.update(ref, patch);
          });
        } catch (e) {
          console.error("Cierre por tiempo (tx) falló:", e);
        } finally {
          setClosingByTime(false);
        }
      }


      // 2) Asegurar chat + mensaje automático (idempotente por subastaId)
      if (!chatEnsured) {
        await ensureChatForClosedAuction(
          {
            ...auction,
            id: subastaId,
            vendedorUid,
            vendedorNameSnapshot: auction?.vendedorNameSnapshot || vendedorName || "Vendedor",
            compradorNameSnapshot: ultimoPostorName || "Comprador",
            // Esto ayuda a que el mensaje tenga cantidad cuando sea subasta de varias copias
            cantidadComprada: Number(auction?.cantidad || cantidadNum || 1),
          },
          ultimoPostorUid
        );

        setChatEnsured(true);
      }

      setClosedProcessed(true);
    } catch (err) {
      console.error("Error cierre por tiempo + chat:", err);
    }
  })();
}, [
  expiredByTime,
  closedProcessed,
  closingByTime,
  chatEnsured,
  auction,
  id,
  vendedorUid,
  vendedorName,
  ultimoPostorUid,
  ultimoPostorName,
  cantidadNum,
]);

  // ChatId directo con el vendedor (si existe info)
  const chatIdForWinner =
    currentUser && vendedorUid && currentUser.uid !== vendedorUid
      ? getChatIdForUsers(vendedorUid, currentUser.uid)
      : null;

  // Limitar input de puja para que no pase CD
  useEffect(() => {
    if (compraDirectaNum == null) return;
    const n = Number(bidInput);
    if (!Number.isFinite(n)) return;
    if (n > compraDirectaNum) {
      setBidInput(String(compraDirectaNum));
    }
  }, [bidInput, compraDirectaNum]);

  const handleBidClick = async () => {
  if (await isUserBanned(currentUser?.uid)) {
    alert("Tu cuenta está baneada. No puedes pujar.");
    return;
  }

    const val = Number(bidInput);

    if (bidInput === "") {
      setBidError("Ingresa un número entero.");
      return;
    }

    if (!Number.isFinite(val)) {
      setBidError("Ingresa solo números.");
      return;
    }

    if (!Number.isInteger(val)) {
      setBidError("La puja debe ser un número entero (sin decimales).");
      return;
    }

    if (val < minNext) {
      setBidError(`La puja mínima actual es S/ ${minNext}.`);
      return;
    }

    if (compraDirectaNum != null && val > compraDirectaNum) {
      setBidError(
        `No puedes superar la compra directa (S/ ${compraDirectaNum}).`
      );
      
      return;
    }
    
    setBidError("");
    onBid(val);
    setBidInput("");
  };

 const handleEliminarSubasta = async (subastaId, auction) => {
  const ownerUid = auction?.vendedorUid ?? vendedorUid ?? null;

  const canDeleteLocal =
    !!currentUser?.uid && (currentUser.uid === ownerUid || isAdminLocal);

  if (!canDeleteLocal) {
    alert("No tienes permisos para eliminar esta subasta.");
    return;
  }

  const ok = confirm("¿Eliminar permanentemente esta subasta?");
  if (!ok) return;

  try {
    // 1) BORRAR BIDS (si existen)
    const bidsRef = collection(db, "subastas", subastaId, "bids");
    const bidsSnap = await getDocs(bidsRef);
    await Promise.all(bidsSnap.docs.map((d) => deleteDoc(d.ref)));

    // 2) BORRAR LA SUBASTA
    await deleteDoc(doc(db, "subastas", subastaId));

    // 3) BORRAR IMÁGENES (best-effort)
    try {
      const urls = [];
      if (auction?.imageUrl) urls.push(auction.imageUrl);
      if (Array.isArray(auction?.imageUrls)) {
        urls.push(...auction.imageUrls.filter(Boolean));
      }

      await Promise.allSettled(
        urls.map(async (url) => {
          const cleanUrl = String(url).split("?")[0];
          const part = cleanUrl.split("/o/")[1];
          if (!part) return;
          const filePath = decodeURIComponent(part);
          await deleteObject(storageRef(storage, filePath));
        })
      );
    } catch (e) {
      // no bloquea el flujo
    }

    setDeleteSuccess(true);
    setTimeout(() => setDeleteSuccess(false), 3000);
  } catch (err) {
    // Mensajes claros para usuario final
    const msg = String(err?.message || err || "");

    if (msg.toLowerCase().includes("permission")) {
      alert("No se pudo eliminar: permisos insuficientes (reglas de Firestore).");
    } else {
      alert("No se pudo eliminar la subasta. Inténtalo de nuevo.");
    }

    console.error("Error eliminando subasta:", err);
  }
};



  // ✅ Confirmación antes de Comprar Ahora
  const handleBuyNowClick = async () => {
  if (await isUserBanned(currentUser?.uid)) {
    alert("Tu cuenta está baneada. No puedes comprar.");
    return;
  }
    if (compraDirectaNum == null || isClosed || isProcessingBuyNow) return;

    const esMulti = esMultiBuyNow;
    let qty = 1;

    if (esMulti) {
      if (copiasRestantes <= 0) {
        alert("Ya no quedan copias disponibles.");
        return;
      }

      const raw = Number(buyNowQty || 1);
      qty = !Number.isFinite(raw) || raw <= 0 ? 1 : Math.floor(raw);

      if (qty > copiasRestantes) {
        alert(`Solo quedan ${copiasRestantes} copia(s) disponibles.`);
        return;
      }
    }

    const total = compraDirectaNum * qty;

    const mensajeConfirmacion = esMulti
      ? `Vas a comprar ${qty} ${qty === 1 ? "copia" : "copias"} por compra directa.\n\nPrecio por copia: S/ ${compraDirectaNum}\nTotal a pagar: S/ ${total}.\n\n¿Confirmas la compra?`
      : `Vas a comprar 1 copia por compra directa por S/ ${compraDirectaNum}.\n\n¿Confirmas la compra?`;

    const ok = window.confirm(mensajeConfirmacion);
    if (!ok) return;

    onBuyNow(esMulti ? qty : 1);
  };

  const finalizaTexto =
    finalDate && !Number.isNaN(finalDate.getTime())
      ? finalDate.toLocaleString("es-PE", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      : "Fecha no disponible";

  const refLabel =
    precioReferencial != null
      ? `${
          precioReferencialCurrency === "PEN" ? "S/" : "$"
        } ${Number(precioReferencial).toFixed(2)}`
      : null;

  // Listener de historial de pujas (solo cuando se abre)
  useEffect(() => {
    if (!showHistory) return;
    if (!auction?.id && !id) return;
    if (!currentUser?.uid) return; //

    setLoadingBids(true);

    const q = query(
      collection(db, "subastas", auction.id || id, "bids"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          let createdAtMs = null;
          if (data.createdAt?.toDate) {
            createdAtMs = data.createdAt.toDate().getTime();
          }

          return {
            id: docSnap.id,
            ...data,
            createdAtMs,
          };
        });

        setBids(arr);
        setLoadingBids(false);
      },
      (err) => {
        console.error("Error al leer historial de pujas:", err);
        setLoadingBids(false);
      }
    );

    return () => unsub(); 
  }, [showHistory, auction, id, currentUser?.uid]);


  // Texto de ganadores
  const hasWinnersArray = Array.isArray(winners) && winners.length > 0;

  let ganadorLabel = "—";
  let ganadorTitulo = isClosed ? "Ganador:" : "Mayor postor:";

  if (hasWinnersArray) {
    const nombres = winners.map((w) => {
      const name = w.name || "Usuario";
      const qty = Number(w.quantity || 1);
      return qty > 1 ? `${name} (x${qty})` : name;
    });
    ganadorLabel = nombres.join(", ");
    if (isClosed && winners.length > 1) {
      ganadorTitulo = "Ganadores:";
    } else if (!isClosed) {
      ganadorTitulo = "Mejores postores:";
    }
  } else if (ultimoPostorName) {
    ganadorLabel = ultimoPostorName;
  }
const ownerUid = auction?.vendedorUid ?? vendedorUid ?? null;

const canDelete =
  !!currentUser?.uid && (currentUser.uid === ownerUid || isAdminLocal);


  return (
    <>
      <section className="relative bg-[#050914] rounded-2xl border border-[#1b2335] shadow-lg overflow-hidden">
      {canDelete && (
  <button
    type="button"
    onClick={() => handleEliminarSubasta(id, auction)}
    title={
      isAdminLocal && currentUser?.uid !== vendedorUid
        ? "Eliminar (Admin)"
        : "Eliminar subasta"
    }
    className="absolute bottom-3 right-3 z-20 p-2 rounded-full bg-red-900/40 hover:bg-red-800/70 border border-red-700/50 shadow-lg"
  >
    🗑️
  </button>
)}


        {/* HEADER */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between text-xs text-gray-400">
          <div className="flex flex-col">
            <span className="text-[10px] text-yellow-400 font-semibold tracking-wide">
              SUBASTA N° {displaySubastaNumber}
            </span>
            {refLabel && (
              <span className="text-[11px] text-gray-300">
                Precio referencial:{" "}
                <span className="font-semibold">{refLabel}</span>
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="uppercase text-[11px] text-gray-400">
              CANTIDAD{" "}
            </span>
            <span className="block text-sm font-semibold text-white">
              {cantidad}
            </span>

            {vendedorUid ? (
              <Link
                href={`/perfil/${vendedorUid}`}
                className="block text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                <UserLink
                  wrapped
                  uid={vendedorUid}
                  name={`Vendedor ${vendedorName}`}
                />
              </Link>
            ) : (
              <span className="block text-[11px] text-gray-400">
                <UserLink
                  uid={vendedorUid}
                  name={`Vendedor ${vendedorName}`}
                />
              </span>
            )}
          </div>
        </div>

        {/* TÍTULO */}
        <div className="px-5 pb-3">
          <h2 className="text-lg font-semibold text-white">
            {tituloMostrar}
          </h2>
        </div>

        {/* CONTENIDO */}
        <div className="px-5 pb-4 grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-stretch">
        {/* IMÁGENES */}
<div className="bg-[#0b1020] rounded-xl overflow-hidden flex flex-col gap-2">
  {/* Imagen principal: grande, centrada y usando todo el ancho */}
  <div className="w-full flex items-center justify-center p-3">
    {currentImage ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={currentImage}
        alt={tituloMostrar}
        loading="lazy"
        className="w-full h-auto max-h-[480px] object-contain rounded-lg cursor-zoom-in"
        onClick={() => setZoomOpen(true)}
      />
    ) : (
      <span className="text-sm text-gray-500">Imagen carta</span>
    )}
  </div>

  {/* Tiras de miniaturas (si hay varias imágenes) */}
  {allImages.length > 1 && (
    <div className="w-full border-t border-[#1b2335] px-2 py-2 flex gap-2 overflow-x-auto bg-[#050814]">
      {allImages.map((url, idx) => (
        <button
          key={url + idx}
          type="button"
          onClick={() => setActiveImageIndex(idx)}
          className={`flex-shrink-0 w-14 h-20 rounded-md overflow-hidden border
            ${
              idx === activeImageIndex
                ? "border-emerald-400"
                : "border-gray-600 opacity-80 hover:opacity-100"
            }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Vista ${idx + 1}`}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </button>
      ))}
    </div>
  )}
</div>

{/* INFO */}


          <div className="flex flex-col justify-between">
            {/* Banner de ganador / líder */}
            {isWinner && (
              <div className="mb-3 text-xs bg-emerald-900/40 border border-emerald-500/70 text-emerald-100 rounded-lg px-3 py-2">
                <p className="font-semibold text-sm">
                  {isClosed
                    ? "🎉 ¡Ganaste esta subasta!"
                    : "🎉 ¡Has comprado en esta subasta!"}
                </p>

                {userTotalCopies > 0 && (
                  <p className="mt-1">
                    Llevas{" "}
                    <span className="font-semibold">
                      {userTotalCopies}{" "}
                      {userTotalCopies === 1 ? "copia" : "copias"}
                    </span>{" "}
                    de esta carta.
                  </p>
                )}

                <p className="mt-1">
                  Contacta al vendedor:{" "}
                  <span className="font-mono break-all">
                    {vendedorContacto ||
                      "El vendedor no ha indicado sus datos de contacto."}
                  </span>
                </p>

                {chatIdForWinner && (
                  <div className="mt-2">
                    <Link
                      href={`/chats/${chatIdForWinner}`}
                      className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-sky-600 hover:bg-sky-700 text-white"
                    >
                      Ir al chat con el vendedor
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Banner azul: vas ganando */}
            {!isWinner && isLeading && (
              <div className="mb-3 px-3 py-1.5 bg-blue-800/40 border border-blue-600 text-blue-300 text-xs font-semibold rounded-lg">
                Vas ganando esta subasta
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs">PRECIO BASE</p>
                <p className="text-white font-semibold">
                  S/ {precioBaseNum}
                </p>

                <p className="text-gray-400 text-xs mt-3">PUJA MÍNIMA</p>
                <p className="text-white font-semibold">
                  S/ {pujaMinimaNum}
                </p>
              </div>

              <div>
                <p className="text-gray-400 text-xs">COMPRA DIRECTA (CD)</p>
                <p className="text-white font-semibold">
                  {compraDirectaNum != null
                    ? `S/ ${compraDirectaNum}`
                    : "—"}
                </p>

                <p className="text-gray-400 text-xs mt-3">PRECIO ACTUAL</p>
                <p className="text-yellow-300 font-extrabold text-lg">
                  S/ {safePrecioActual}
                </p>

                <p className="text-[11px] text-gray-300 mt-1">
                  {ganadorTitulo}{" "}
                  <UserLink uid={ultimoPostorUid} name={ganadorLabel} />
                </p>

                {cantidadNum > 1 && (
                  <p className="text-[11px] text-gray-300 mt-1">
                    Copias disponibles:{" "}
                    <span className="font-semibold">
                      {copiasRestantes} / {cantidadNum}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* TIEMPO */}
            <div className="mt-3 text-xs">
              <p className="text-gray-400">
                FINALIZA:{" "}
                <span className="text-gray-200">{finalizaTexto}</span>
              </p>

              <div className="mt-1 flex flex-col gap-1">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${timeColor}`}
                >
                  {countdownText}
                </span>

                {!isClosed && (
                  <div className="w-full h-2 bg-gray-900/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-lime-400 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>

              <p className="text-[11px] text-gray-500 mt-2">
                Regla: si hay puja en los últimos 5 minutos, se extiende
                5 min. Si alguien llega a CD, la subasta termina.
              </p>

              {vendedorContacto && (
                <p className="text-[11px] text-gray-400 mt-2">
                  Contacto del vendedor:{" "}
                  <span className="font-mono break-all text-gray-200">
                    {vendedorContacto}
                  </span>
                </p>
              )}
              {descripcion && (
                <p className="text-[11px] text-gray-300 mt-2">
                  Descripción:{" "}
                  <span className="text-gray-200">{descripcion}</span>
                </p>
              )}

              {zonaEntrega && (
                <p className="text-[11px] text-gray-300 mt-1">
                  Zona de entrega:{" "}
                  <span className="text-gray-200">{zonaEntrega}</span>
                </p>
              )}
            </div>

                       {/* ACCIONES */}
              <div className="mt-4 space-y-2">
                



              <button
                disabled={
                  isClosed || compraDirectaNum == null || isProcessingBuyNow
                }
                onClick={handleBuyNowClick}
                className={`w-full py-2.5 rounded-full text-sm font-semibold transition ${
                  isClosed || compraDirectaNum == null
                    ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                    : isProcessingBuyNow
                    ? "bg-pink-800 text-white cursor-wait"
                    : "bg-pink-600 hover:bg-pink-700 text-white"
                }`}
              >
                {isProcessingBuyNow
                  ? "Procesando compra..."
                  : compraDirectaNum != null
                  ? `Comprar ahora — S/ ${compraDirectaNum}`
                  : "Sin compra directa"}
              </button>

              {esMultiBuyNow &&
                !isClosed &&
                compraDirectaNum != null &&
                copiasRestantes > 0 && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-200">
                    <span className="whitespace-nowrap">
                      Copias a comprar:
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={copiasRestantes}
                      value={buyNowQty}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setBuyNowQty("");
                          return;
                        }
                        const num = Number(v);
                        if (!Number.isFinite(num) || num <= 0) {
                          setBuyNowQty(1);
                          return;
                        }
                        if (num > copiasRestantes) {
                          setBuyNowQty(copiasRestantes);
                          return;
                        }
                        setBuyNowQty(Math.floor(num));
                      }}
                      className="w-16 bg-[#050914] border border-[#f97316] rounded-lg px-2 py-1 text-right text-xs text-white
                               focus:outline-none focus:ring-1 focus:ring-[#f97316]"
                    />
                    <span className="text-[11px] text-gray-400">
                      Disponibles:{" "}
                      <span className="text-gray-200 font-semibold">
                        {copiasRestantes}
                      </span>
                    </span>
                  </div>
                )}

              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  step="1"
                  min={minNext}
                  max={compraDirectaNum ?? undefined}
                  value={bidInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBidInput(value);

                    if (value === "") {
                      setBidError("");
                      return;
                    }

                    const num = Number(value);

                    if (!Number.isFinite(num)) {
                      setBidError("Ingresa solo números enteros.");
                      return;
                    }

                    if (!Number.isInteger(num)) {
                      setBidError(
                        "La puja debe ser un número entero (sin decimales)."
                      );
                    } else {
                      setBidError("");
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBidClick();
                    }
                  }}
                  disabled={isClosed}
                  className={`flex-1 bg-[#050914] rounded-xl px-3 py-2 text-sm text-white
    border disabled:bg-gray-800.disabled:text-gray-500
    focus:outline-none focus:ring-1
    ${
      isClosed
        ? "border-[#283145]"
        : bidError
        ? "border-red-500 focus:ring-red-500"
        : "border-[#283145] focus:ring-pink-500"
    }`}
                  placeholder={`Puja mínima: S/ ${minNext}`}
                />

                <button
                  onClick={handleBidClick}
                  disabled={isClosed}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    isClosed
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                      : "bg-yellow-500 hover:bg-yellow-600 text-black"
                  }`}
                >
                  Pujar
                </button>
              </div>

              {bidError && !isClosed && (
                <p className="text-[11px] text-red-400 mt-1">
                  {bidError}
                </p>
              )}

              <p className="text-[11px] text-gray-500">
                Mínimo siguiente: S/ {minNext}
                {compraDirectaNum != null
                  ? ` · Máximo: S/ ${compraDirectaNum}`
                  : " · Sin compra directa"}
              </p>

              {/* HISTORIAL DE PUJAS */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="text-xs px-3 py-1 rounded-full border border-gray-600 hover:border-emerald-500 hover:text-emerald-300 text-gray-300"
                >
                  {showHistory
                    ? "Ocultar historial de pujas"
                    : "Ver historial de pujas"}
                </button>

                {showHistory && (
                  <div className="mt-2 rounded-md border border-white/5 bg-black/40 max-h-52 overflow-y-auto text-xs">
                    {loadingBids ? (
                      <p className="px-3 py-2 text-gray-400">
                        Cargando historial...
                      </p>
                    ) : bids.length === 0 ? (
                      <p className="px-3 py-2 text-gray-500">
                        Aún no hay pujas registradas.
                      </p>
                    ) : (
                      <>
                        <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                          <span className="text-gray-300">
                            Total de pujas:{" "}
                            <span className="font-semibold text-emerald-400">
                              {bids.length}
                            </span>
                          </span>
                          <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                            Más recientes primero
                          </span>
                        </div>

                        <ul className="divide-y divide-white/5">
                          {bids.map((b) => {
                            const fecha =
                              b.createdAtMs != null
                                ? new Date(
                                    b.createdAtMs
                                  ).toLocaleString("es-PE", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })
                                : "";

                            const etiqueta =
                              b.type === "buyNow"
                                ? "Compra directa"
                                : "Puja";

                            const esTuya =
                              currentUser && b.uid === currentUser.uid;

                            return (
                              <li
                                key={b.id}
                                className="px-3 py-2 flex items-center justify-between gap-2"
                              >
                                <div className="flex flex-col">
                                  <span className="font-semibold text-gray-100">
                                    S/ {Number(b.amount || 0).toFixed(2)}{" "}
                                    <span className="text-[10px] uppercase text-emerald-400">
                                      {etiqueta}
                                    </span>
                                    {esTuya && (
                                      <span className="ml-1 text-[10px] text-sky-400">
                                        (tú)
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-gray-400">
                                    <UserLink
                                      uid={b.uid}
                                      name={b.name || "Usuario"}
                                    />
                                    {fecha ? ` • ${fecha}` : ""}
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
              
            </div>
          </div>
        </div>
      </section>

      {/* Toast de subasta eliminada */}
      {deleteSuccess && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm animate-bounce z-50">
          Subasta eliminada exitosamente
        </div>
      )}

      {/* MODAL DE ZOOM */}
      {zoomOpen && currentImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setZoomOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentImage}
            alt={tituloMostrar}
            loading="lazy"
            className="max-w-[90vw] max-h-[90vh] object-contain"
          />
        </div>
      )}
    </>
  );
}
