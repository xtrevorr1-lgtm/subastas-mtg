"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  doc,
  onSnapshot,
  collection,
  addDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";

import SubastaCard from "../../../components/SubastaCard";


export default function SubastaPage() {
  const router = useRouter();
  const { id } = useParams();
const [processingBuyNow, setProcessingBuyNow] = useState(false);
  const [subasta, setSubasta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const autoChatDoneRef = useRef(false);
  const buyNowLockRef = useRef(false);



  /* ------------------------------ Sesión ------------------------------ */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);
useEffect(() => {
  autoChatDoneRef.current = false;
   buyNowLockRef.current = false;
}, [id]);

  /* ----------------------- Cargar subasta EN VIVO ---------------------- */
  useEffect(() => {
    if (!id) return;
    const ref = doc(db, "subastas", id);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setSubasta(null);
        } else {
          const data = snap.data();
          const finalizaMs =
            data.finaliza?.toDate?.() ??
            (typeof data.finaliza === "number"
              ? new Date(data.finaliza)
              : null);

          setSubasta({
            id: snap.id,
            ...data,
            finaliza: finalizaMs ? finalizaMs.getTime() : null,
          });
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error leyendo subasta:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [id]);



  if (loading) {
    return (
      <main className="min-h-screen text-gray-300 bg-[#02060b] flex items-center justify-center">
        Cargando subasta…
      </main>
    );
  }

  if (!subasta) {
    return (
      <main className="min-h-screen text-gray-300 bg-[#02060b] flex items-center justify-center">
        Esta subasta no existe.
      </main>
    );
  }

  /* ========================================================================
     🟡 PUJAR — versión B (completa, estable, con cierre automático por CD)
     ======================================================================== */
  async function handleBid(bidAmount) {
    if (!user) return alert("Debes iniciar sesión para pujar.");
    const ref = doc(db, "subastas", subasta.id);

    try {
      let closedByThisBid = false;

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("La subasta ya no existe.");
        const data = snap.data();

        if (data.status === "closed")
          throw new Error("La subasta ya está cerrada.");

        /* PUJA MÍNIMA */
        const precioBase = Number(data.precioBase ?? 0);
const pujaMin = Number(data.pujaMinima ?? 1);

// ✅ Si no hay postor aún, la primera puja puede ser el precio base.
// Si ya hubo postor, aplica el incremento normal.
const hasBids = !!data.ultimoPostorUid;
const precioActual = Number(data.precioActual ?? precioBase);

const minNext = hasBids ? (precioActual + pujaMin) : precioBase;

if (bidAmount < minNext) {
  throw new Error(`La puja mínima actual es S/ ${minNext}.`);
}


        /* NO exceder CD */
        const cd = Number(data.compraDirecta || 0);
        if (cd > 0 && bidAmount > cd)
          throw new Error(`No puedes exceder la compra directa (S/ ${cd}).`);

        /* REGLA DE 5 MINUTOS */
        let finalMs = data.finaliza?.toDate?.()?.getTime?.() ?? data.finaliza;
        const now = Date.now();

        if (finalMs && finalMs - now <= 5 * 60 * 1000 && finalMs > now) {
          finalMs = finalMs + 5 * 60 * 1000;
        }

        /* MULTI-COPIAS -> MODO BIDS */
        const cantidadTotal = Number(data.cantidad || 1);

        const update = {
          updatedAt: serverTimestamp(),
          finaliza: finalMs,
        };

        /* SI ALCANZA COMPRA DIRECTA */
        if (cd > 0 && bidAmount >= cd) {
          closedByThisBid = true;

          update.status = "closed";
          update.closedAt = serverTimestamp();
          update.closedBy = "bid"; // 🔴 AÑADIR AQUÍ
          update.precioActual = bidAmount;
          update.ultimoPostorUid = user.uid;
          update.ultimoPostorName = user.displayName ?? "Postor";
          update.winnerQuantities = { [user.uid]: cantidadTotal };
          update.copiasVendidas = cantidadTotal;
          update[`participantes.${user.uid}`] = true; // 🔥 también aquí

          tx.update(ref, update);
          return;
        }

        /* PUJA NORMAL */
        update.precioActual = bidAmount;
        update.ultimoPostorUid = user.uid;
        update.ultimoPostorName = user.displayName ?? "Postor";
        update[`participantes.${user.uid}`] = true; // 🔥 REGISTRAR PARTICIPACIÓN


        tx.update(ref, update);
      });

      /* Registrar histórico */
      await addDoc(collection(db, "subastas", subasta.id, "bids"), {
        amount: bidAmount,
        uid: user.uid,
        name: user.displayName ?? "Postor",
        type: "bid",
        createdAt: serverTimestamp(),
      });

      
    } catch (err) {
      console.error("Error al pujar:", err);
      alert(err.message);
    }
  }

  /* ========================================================================
     🟣 COMPRA DIRECTA — multi-copias, mensaje por compra, cierre por agotarse
     ======================================================================== */
  async function handleBuyNow(quantity = 1) {
    if (!user) return alert("Debes iniciar sesión para comprar.");
    if (!subasta.compraDirecta) return;

    if (buyNowLockRef.current) return;
    buyNowLockRef.current = true;


    setProcessingBuyNow(true);
    const ref = doc(db, "subastas", subasta.id);

    try {
      let qtyComprada = 1;

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("La subasta ya no existe.");
        const data = snap.data();

        if (data.status === "closed")
          throw new Error("La subasta ya está cerrada.");

        const total = Number(data.cantidad || 1);
        const vendidas = Number(data.copiasVendidas || 0);
        const disponibles = total - vendidas;

        if (disponibles <= 0)
          throw new Error("Ya no quedan copias disponibles.");

        const qty = Math.max(1, Math.floor(Number(quantity)));
        if (qty > disponibles)
          throw new Error(`Solo quedan ${disponibles} disponibles.`);

        qtyComprada = qty;

        const nuevasVendidas = vendidas + qty;

        const prevWinners = data.winnerQuantities || {};
        const newForUser = (prevWinners[user.uid] || 0) + qty;

        const update = {
          precioActual: data.compraDirecta,
          updatedAt: serverTimestamp(),
          ultimoPostorUid: user.uid,
          ultimoPostorName: user.displayName ?? "Comprador",
          copiasVendidas: nuevasVendidas,
          winnerQuantities: {
            ...prevWinners,
            [user.uid]: newForUser,
          },
            [`participantes.${user.uid}`]: true,   // 🔥 REGISTRAR PARTICIPACIÓN
        };

       if (nuevasVendidas >= total) {
  update.status = "closed";
  update.closedAt = serverTimestamp();
  update.closedBy = "buyNow"; // 🔴 AÑADIR ESTA LÍNEA
}


        tx.update(ref, update);
      });

      /* Registrar historial */
      await addDoc(collection(db, "subastas", subasta.id, "bids"), {
        amount: subasta.compraDirecta,
        uid: user.uid,
        name: user.displayName ?? "Comprador",
        type: "buyNow",
        quantity: qtyComprada,
        createdAt: serverTimestamp(),
      });
const buyerName = user.displayName || user.email || "Comprador";
      
    } catch (err) {
      console.error("Error en compra directa:", err);
      alert(err.message);
    } finally {
      buyNowLockRef.current = false;

      setProcessingBuyNow(false);
    }
  }

  /* ---------------------------- UI ---------------------------- */

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-3xl mx-auto px-4 pb-20 pt-6">
        <button
  onClick={() => {
    // Si el navegador tiene historial suficiente, volver
    if (window.history.length > 2) {
      router.back();
    } else {
      // Si NO hay historial (entró desde link externo)
      router.push("/");
    }
  }}
  className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
>
  Volver
</button>


       <SubastaCard
  auction={subasta}
  currentUser={user}
  isAdmin={user?.isAdmin === true}
  onBid={handleBid}
  onBuyNow={handleBuyNow}
  isProcessingBuyNow={processingBuyNow}
/>

      </div>
    </main>
  );
}
