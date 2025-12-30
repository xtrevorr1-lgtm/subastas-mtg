// app/lib/chatUtils.js
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { getChatIdForUsers, buildAutoWinMessage } from "./chatUtils-helpers";

// app/lib/chatUtils.js
async function ensureBaseChatDocument(auction, compradorUid, compradorNameFromAuth) {
  const vendedorUid = auction.vendedorUid;
  if (!vendedorUid || !compradorUid) {
    throw new Error("ensureBaseChatDocument: faltan UIDs");
  }

  const chatId = getChatIdForUsers(vendedorUid, compradorUid);
  const chatRef = doc(db, "chats", chatId);
  const snap = await getDoc(chatRef);

    // ✅ Precio final SIEMPRE numérico y consistente
const precioFinal = (() => {
  // ✅ COMPRA DIRECTA
  if (auction.__evento === "compraDirecta") {
    const cd = Number(auction.compraDirecta);
    return Number.isFinite(cd) ? cd : 0;
  }

  // ✅ CIERRE POR PUJA — USAR PRECIO GANADOR REAL
  const ganador =
    Number(auction.precioFinal) ||
    Number(auction.precioGanador) ||
    Number(auction.ultimoMonto) ||
    Number(auction.highestBid);

  if (Number.isFinite(ganador) && ganador > 0) {
    return ganador;
  }

  // fallback extremo
  const base = Number(auction.precioBase);
  return Number.isFinite(base) ? base : 0;
})();




  const cardImage =
    Array.isArray(auction.imageUrls) && auction.imageUrls.length > 0
      ? auction.imageUrls[0]
      : auction.imageUrl ?? null;

  const vendedorNameSnapshot =
    auction.vendedorNameSnapshot || auction.vendedorName || "Vendedor";

  const compradorNameSnapshot =
    compradorNameFromAuth ||
    auction.ultimoPostorName ||   // fallback si vino de cierre por puja
    "Comprador";

  const basePatch = {
    participants: [vendedorUid, compradorUid],
    vendedorUid,
    compradorUid,

    // ✅ NUEVO: nombres snapshot para pintar en /chats
    vendedorNameSnapshot,
    compradorNameSnapshot,

    deletedFor: {
      [compradorUid]: false,
      [vendedorUid]: false,
    },
    lastSubastaId: auction.id,
    lastSubastaTitulo: auction.titulo ?? "",
    lastSubastaImageUrl: cardImage,
    lastSubastaPrecioFinal: precioFinal,
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    await setDoc(chatRef, {
      ...basePatch,
      createdAt: serverTimestamp(),
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      lastMessageSenderUid: null,
    });
  } else {
    await setDoc(chatRef, basePatch, { merge: true });
  }

  return { chatId, chatRef, precioFinal, cardImage };
}



/**
 * ✅ PARA CIERRE DE SUBASTA (por tiempo / status "closed")
 *
 * - Garantiza que exista el chat.
 * - Envía UN solo mensaje automático de cierre por subasta+chat.
 * - Si se vuelve a llamar para la misma subasta, NO duplica el mensaje.
 */
export async function ensureChatForClosedAuction(auction, compradorUid) {
  const compradorName = auction.compradorNameSnapshot || auction.ultimoPostorName || "Comprador";

  const { chatId, chatRef, precioFinal, cardImage } =
    await ensureBaseChatDocument(
  { ...auction, __evento: "cierre" },
  compradorUid,
  compradorName
);

      // 🛑 Si ya hubo compra directa para esta subasta en este chat,
  // NO mandes "cierre" (si no, salen 2 mensajes).
  const messagesCol = collection(db, "chats", chatId, "messages");
  const existingBuyNowQ = query(
    messagesCol,
    where("system", "==", true),
    where("evento", "==", "compraDirecta"),
    where("subastaId", "==", auction.id)
  );
  const existingBuyNowSnap = await getDocs(existingBuyNowQ);
  if (!existingBuyNowSnap.empty) {
    return chatId;
  }


    // ✅ Mensaje de cierre ID fijo (anti-duplicado incluso con 2 llamadas simultáneas)
  const msgId = `system_cierre_${auction.id}`;
  const msgRef = doc(db, "chats", chatId, "messages", msgId);

  const existingMsg = await getDoc(msgRef);
  if (existingMsg.exists()) {
    return chatId;
  }

  const nowLocale = new Date().toLocaleString("es-PE");

  const msgText = buildAutoWinMessage(
    auction.mensajeAutoGanadorTemplate,
    {
      titulo: auction.titulo,
      monto: precioFinal,
      moneda: "S/",
      telefono: auction.vendedorContacto,
      diasLimite: 5,
      idSubasta: auction.id,
      fechaCierre: nowLocale,
      cantidad: auction.cantidadComprada ?? null,
    }
  );

  await setDoc(msgRef, {
    senderUid: null,
    text: msgText,
    createdAt: serverTimestamp(),
    system: true,
    evento: "cierre",
    subastaId: auction.id,
    subastaTitulo: auction.titulo ?? "",
    precioFinal,
    cantidadComprada: auction.cantidadComprada ?? null,
    subastaImageUrl: cardImage,
  });


  await setDoc(
    chatRef,
    {
      lastMessage: msgText,
      lastMessageAt: serverTimestamp(),
      lastMessageSenderUid: null,
    },
    { merge: true }
  );

  return chatId;
}

/**
 * ✅ PARA COMPRA DIRECTA (multi-copias)
 *
 * - Se llama cada vez que el comprador hace una CD de X copias.
 * - SIEMPRE crea un mensaje nuevo con la cantidad de ESTA compra.
 * - NO es idempotente a propósito (porque puede haber varias compras).
 */
export async function sendAutoMessageForBuyNow(
  auction,
  compradorUid,
  cantidadComprada,
  compradorNameFromAuth,
  buyNowEventId // ✅ NUEVO (opcional): id único por compra (ideal si viene de tu transaction)
) {
  const vendedorUid = auction.vendedorUid;
  if (!vendedorUid || !compradorUid) return;

  const cleanCantidad =
    typeof cantidadComprada === "number"
      ? cantidadComprada
      : Number(cantidadComprada || 0);

  const compradorName =
    compradorNameFromAuth ||
    auction.compradorNameSnapshot ||
    auction.ultimoPostorName ||
    "Comprador";

 const { chatId, chatRef, precioFinal, cardImage } =
  await ensureBaseChatDocument(
    {
      ...auction,
      cantidadComprada: cleanCantidad,
      __evento: "compraDirecta",
    },
    compradorUid,
    compradorName
  );



  const messagesCol = collection(db, "chats", chatId, "messages");

  // 🛑 Si ya existe "cierre" para esta subasta, no mandes compra directa.
  const existingCloseQ = query(
    messagesCol,
    where("system", "==", true),
    where("evento", "==", "cierre"),
    where("subastaId", "==", auction.id)
  );
  const existingCloseSnap = await getDocs(existingCloseQ);
  if (!existingCloseSnap.empty) return chatId;

  // ✅ Clave estable (SIN precio) para fallback
  // - Si tienes buyNowEventId: perfecto (cada compra = 1 id)
  // - Si NO lo tienes: al menos evita duplicados por doble llamada
  const stableKey = buyNowEventId
    ? String(buyNowEventId)
    : `${auction.id}__${compradorUid}__${cleanCantidad}`;

  const buyNowKey = stableKey;

  const nowLocale = new Date().toLocaleString("es-PE");

  const msgText = buildAutoWinMessage(auction.mensajeAutoGanadorTemplate, {
    titulo: auction.titulo,
    monto: precioFinal,
    moneda: "S/",
    telefono: auction.vendedorContacto,
    diasLimite: 5,
    idSubasta: auction.id,
    fechaCierre: nowLocale,
    cantidad: cleanCantidad,
  });

  // ✅ ID fijo por evento/acción
  const msgId = `system_compraDirecta_${stableKey}`;
  const msgRef = doc(db, "chats", chatId, "messages", msgId);

  const existing = await getDoc(msgRef);
  if (existing.exists()) return chatId;

  await setDoc(msgRef, {
    senderUid: null,
    text: msgText,
    createdAt: serverTimestamp(),
    system: true,
    evento: "compraDirecta",
    buyNowKey,
    subastaId: auction.id,
    subastaTitulo: auction.titulo ?? "",
    precioFinal,
    cantidadComprada: cleanCantidad,
    subastaImageUrl: cardImage,
  });

  await setDoc(
    chatRef,
    {
      lastMessage: msgText,
      lastMessageAt: serverTimestamp(),
      lastMessageSenderUid: null,
      lastSubastaId: auction.id,
      lastSubastaTitulo: auction.titulo ?? "",
      lastSubastaImageUrl: cardImage,
      lastSubastaPrecioFinal: precioFinal,
    },
    { merge: true }
  );

  return chatId;
}


