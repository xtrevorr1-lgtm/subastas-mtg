"use client";
import usePaginatedMessages from "../app/hooks/usePaginatedMessages";

import imageCompression from "browser-image-compression";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "../app/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import UserLink from "../components/UserLink";

export default function ChatPageClient({ chatId }) {
  const router = useRouter();
  const [lastSubastaSnap, setLastSubastaSnap] = useState(null);
  const [user, setUser] = useState(null);
  const [chat, setChat] = useState(null);
  
  const {
  messages,
  loading,
  hasMore,
  loadMore,
} = usePaginatedMessages(chatId, { enabled: !!user && !!chatId && !!chat });


  const [loadingChat, setLoadingChat] = useState(true);
  const [newMessage, setNewMessage] = useState("");

  const [uploadingImage, setUploadingImage] = useState(false);

  // ✅ Ahora manejamos VARIAS imágenes pendientes
  const [pendingImages, setPendingImages] = useState([]); // [{ file, previewUrl, id }]

  // ✅ Zoom para ver imágenes grandes (con navegación entre varias)
  const [zoomImages, setZoomImages] = useState([]); // array de URLs
  const [zoomIndex, setZoomIndex] = useState(0); // posición actual
  const [zoomOpen, setZoomOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
const scrollRef = useRef(null);


  // Navegación con teclado en el visor de imágenes
  useEffect(() => {
    if (!zoomOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeZoom();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrevImage(e);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNextImage(e);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomOpen, zoomImages.length]);

  // Sesión
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  // Datos del chat (header + typing + lastReadAt)
  useEffect(() => {
  // ✅ No escuches nada si no hay sesión todavía
  if (!chatId || !user?.uid) {
    setChat(null);
    setLoadingChat(false);
    return;
  }

  setLoadingChat(true);

  const chatRef = doc(db, "chats", chatId);
  const unsub = onSnapshot(
    chatRef,
    (snap) => {
      setChat(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoadingChat(false);
    },
    (err) => {
      console.error("Error cargando chat:", err);

      // ✅ Si es permisos, no dejes el listener “reventar” la app
      // (igual mostramos UI de “no existe/no acceso”)
      setChat(null);
      setLoadingChat(false);
    }
  );

  return () => unsub();
}, [chatId, user?.uid]);

 const prevScrollHeight = useRef(null);
const shouldRestoreScroll = useRef(false);

useEffect(() => {
  const el = scrollRef.current;
  if (!el) return;

  // 🔹 Caso cuando cargamos mensajes anteriores (loadMore)
  if (shouldRestoreScroll.current && prevScrollHeight.current !== null) {
    const newScrollHeight = el.scrollHeight;
    const diff = newScrollHeight - prevScrollHeight.current;

    el.scrollTop = diff; // mantiene posición exacta
    shouldRestoreScroll.current = false;
    prevScrollHeight.current = null;
    return;
  }

  // 🔹 Caso normal: scroll al final cuando llegan mensajes nuevos
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

}, [messages]);



  // 🟢 Marcar como leído automáticamente cuando lleguen mensajes nuevos
useEffect(() => {
  if (!chatId || !user) return;
  if (messages.length === 0) return;

  const lastMessage = messages[messages.length - 1];

  // No marcar leído si el mensaje es mío
  if (lastMessage.senderUid === user.uid) return;

  const markAsRead = async () => {
    try {
      await updateDoc(doc(db, "chats", chatId), {
        [`lastReadAt.${user.uid}`]: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error marcando chat como leído:", err);
    }
  };

  markAsRead();
}, [messages, chatId, user]);


  // Función para marcar typing true/false
  const setTyping = async (isTyping) => {
    if (!user || !chatId) return;
    try {
      const chatRef = doc(db, "chats", chatId);
      await updateDoc(chatRef, {
        [`typing.${user.uid}`]: isTyping,
      });
    } catch (err) {
      console.error("Error actualizando typing:", err);
    }
  };

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Intentar marcar que dejó de escribir
      setTyping(false);

      // Limpiar previews de imágenes pendientes
      pendingImages.forEach((img) => {
        if (!img?.previewUrl) return;
        try {
          URL.revokeObjectURL(img.previewUrl);
        } catch {
          // ignore
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🗑️ ELIMINAR MENSAJE (fuera de handleSendMessage!)
  const handleDeleteMessage = async (message) => {
    if (!user) return;
    if (message.senderUid !== user.uid) return;

    const ok = confirm("¿Eliminar este mensaje para ambos?");
    if (!ok) return;

    try {
      const msgRef = doc(db, "chats", chatId, "messages", message.id);

      await updateDoc(msgRef, {
        text: "",
        imageUrl: null,
        imagePath: null,
        imageUrls: null,
        imagePaths: null,
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user.uid,
      });
    } catch (err) {
      console.error("Error eliminando mensaje:", err);
      alert("No se pudo eliminar el mensaje.");
    }
  };
  const handleDeleteChat = async () => {
  if (!user || !chatId) return;

  const ok = confirm(
    "¿Deseas eliminar este chat de tu lista? No se borra para la otra persona."
  );
  if (!ok) return;

  try {
    await updateDoc(doc(db, "chats", chatId), {
      [`deletedFor.${user.uid}`]: true,
    });

    router.push("/chats");
  } catch (err) {
    console.error("Error eliminando chat:", err);
    alert("No se pudo eliminar el chat.");
  }
};


  // 📩 Enviar mensaje (texto + 0..N imágenes)
  const handleSendMessage = async () => {
    if (!user) {
      alert("Debes iniciar sesión para enviar mensajes.");
      return;
    }

    const text = newMessage.trim();

    // Si no hay texto ni imágenes, no hacemos nada
    if (!text && pendingImages.length === 0) return;

    try {
      setUploadingImage(true);

      let imageUrls = [];
      let imagePaths = [];

      // Subir TODAS las imágenes seleccionadas (si hay)
      if (pendingImages.length > 0) {
        for (let i = 0; i < pendingImages.length; i++) {
          const img = pendingImages[i];
          const file = img.file;
          const safeName = file.name || `imagen_${i}`;
          const storagePath = `chats/${chatId}/${Date.now()}_${i}_${safeName}`;
          const storageRef = ref(storage, storagePath);

          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);

          imageUrls.push(url);
          imagePaths.push(storagePath);
        }
      }

      const messagesRef = collection(db, "chats", chatId, "messages");
      await addDoc(messagesRef, {
        senderUid: user.uid,
        text: text || "", // puede ir vacío si sólo hay imágenes
        // Compatibilidad con mensajes antiguos: dejamos también imageUrl/imagePath simple
        imageUrl: imageUrls[0] || null,
        imagePath: imagePaths[0] || null,
        // Nuevo: soportar varias imágenes
        imageUrls: imageUrls.length > 0 ? imageUrls : null,
        imagePaths: imagePaths.length > 0 ? imagePaths : null,
        createdAt: serverTimestamp(),
        system: false,
      });

      // Actualizar lastMessage en el chat
      const chatRef = doc(db, "chats", chatId);
      let resumen = text;
      if (!resumen) {
        resumen =
          imageUrls.length > 1
            ? `[${imageUrls.length} imágenes]`
            : imageUrls.length === 1
            ? "[Imagen]"
            : "Mensaje enviado";
      }

      await updateDoc(chatRef, {
        lastMessage: resumen,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderUid: user.uid,
      });

      // Limpiar input y estado de imágenes
      setNewMessage("");
      pendingImages.forEach((img) => {
        if (!img?.previewUrl) return;
        try {
          URL.revokeObjectURL(img.previewUrl);
        } catch {
          // ignore
        }
      });
      setPendingImages([]);

      // Al enviar, ya no está escribiendo
      await setTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    } catch (err) {
      console.error("Error enviando mensaje:", err);
      alert("No se pudo enviar el mensaje.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleTextareaChange = (e) => {
    const value = e.target.value;
    setNewMessage(value);

    if (!user || !chatId) return;

    // Marcar typing = true cuando empieza a escribir
    setTyping(true);

    // Reiniciar timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
      typingTimeoutRef.current = null;
    }, 1500);
  };

  // Enviar con Enter (Shift+Enter = salto de línea)
  const handleTextareaKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // evita el salto de línea
      handleSendMessage(); // envía el mensaje
    }
  };

  // 📎 Seleccionar imágenes desde el input (multi)
  const handleImageChange = async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const compressedFiles = [];

  for (const file of files) {
    try {
      // Configuración de compresión
      const options = {
        maxSizeMB: 0.4, // Máximo ~400 KB
        maxWidthOrHeight: 1280, // Redimensiona si es muy grande
        useWebWorker: true,
      };

      const compressed = await imageCompression(file, options);
      compressedFiles.push(compressed);
    } catch (err) {
      console.error("Error al comprimir imagen:", err);
      compressedFiles.push(file); // fallback
    }
  }

  const mapped = compressedFiles.map((file) => ({
    file,
    previewUrl: URL.createObjectURL(file),
    id: `${file.name}_${file.size}_${file.lastModified}_${Math.random()}`,
  }));

  setPendingImages((prev) => [...prev, ...mapped]);

  e.target.value = "";
};


  // 📋 Pegar imágenes con Ctrl+V (como en Facebook)
  const handleTextareaPaste = async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  const imageFiles = [];

  for (const item of items) {
    if (item.type && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) imageFiles.push(file);
    }
  }

  if (imageFiles.length === 0) return;

  const compressedFiles = [];

  for (const file of imageFiles) {
    try {
      const options = {
        maxSizeMB: 0.4,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      };

      const compressed = await imageCompression(file, options);
      compressedFiles.push(compressed);
    } catch (err) {
      console.error("Error al comprimir imagen pegada:", err);
      compressedFiles.push(file);
    }
  }

  const mapped = compressedFiles.map((file) => ({
    file,
    previewUrl: URL.createObjectURL(file),
    id: `${
      file.name || "pasted"
    }_${file.size}_${file.lastModified || Date.now()}_${Math.random()}`,
  }));

  setPendingImages((prev) => [...prev, ...mapped]);
};


  const handleRemovePendingImage = (id) => {
    setPendingImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.previewUrl) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {
          // ignore
        }
      }
      return prev.filter((img) => img.id !== id);
    });
  };

  // Abrir visor de imágenes para un mensaje
  const openZoom = (imagesArray, index) => {
    if (!Array.isArray(imagesArray) || imagesArray.length === 0) return;
    const safeIndex = Math.min(Math.max(index, 0), imagesArray.length - 1);
    setZoomImages(imagesArray);
    setZoomIndex(safeIndex);
    setZoomOpen(true);
  };

  const closeZoom = () => {
    setZoomOpen(false);
    setZoomImages([]);
    setZoomIndex(0);
  };

  // Navegar entre imágenes (con wrap-around)
  const goPrevImage = (e) => {
    e.stopPropagation(); // para no cerrar el modal
    setZoomIndex((prev) => {
      if (!zoomImages.length) return 0;
      return (prev - 1 + zoomImages.length) % zoomImages.length;
    });
  };

  const goNextImage = (e) => {
    e.stopPropagation();
    setZoomIndex((prev) => {
      if (!zoomImages.length) return 0;
      return (prev + 1) % zoomImages.length;
    });
  };

  if (!chatId) {
    return (
      <main className="min-h-screen bg-[#02060b] text-gray-100 flex items-center justify-center">
        <p className="text-sm text-gray-400">
          No se recibió ningún chatId válido.
        </p>
      </main>
    );
  }

  // Detectar si el otro usuario está escribiendo
  let otherIsTyping = false;
  if (chat?.typing && user) {
    for (const [uid, val] of Object.entries(chat.typing)) {
      if (uid !== user.uid && val) {
        otherIsTyping = true;
        break;
      }
    }
  }

  // Helper para obtener lista de imágenes de un mensaje (1 o varias)
  const getMessageImages = (m) => {
    if (Array.isArray(m.imageUrls) && m.imageUrls.length > 0) {
      return m.imageUrls;
    }
    if (m.imageUrl) {
      return [m.imageUrl];
    }
    return [];
  };
// ✅ NO leemos /users. Usamos snapshots guardados en chats/{chatId}.
const otherUid =
  chat && user
    ? (chat.vendedorUid === user.uid ? chat.compradorUid : chat.vendedorUid)
    : null;

const otherRole =
  chat && user
    ? (chat.vendedorUid === user.uid ? "Comprador" : "Vendedor")
    : "";

// 👇 AQUÍ está la clave: usar los snapshots del doc del chat
const otherDisplayName =
  chat && user
    ? (chat.vendedorUid === user.uid
        ? (chat.compradorNameSnapshot || "Comprador")
        : (chat.vendedorNameSnapshot || "Vendedor"))
    : "";

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100 flex flex-col">
      <div className="max-w-3xl mx-auto flex-1 w.full flex flex-col">
        {/* HEADER */}
<header className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#02060b]/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
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


            {chat?.lastSubastaImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={chat.lastSubastaImageUrl}
                alt={chat.lastSubastaTitulo || "Subasta"}
                className="w-10 h-14 object-cover rounded"
              />
            )}

            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {chat?.lastSubastaTitulo || "Chat de subastas"}
              </p>
          {chat && user && otherUid && (
  <div className="text-xs text-gray-400">
    <Link
      href={`/perfil/${otherUid}`}
      className="text-emerald-400 hover:text-emerald-300 hover:underline"
    >
      {otherDisplayName}
    </Link>
    {otherDisplayName !== otherRole && (
  <span className="ml-2 opacity-70">({otherRole})</span>
)}

  </div>
)}


              {chat?.lastSubastaPrecioFinal != null && (
                <p className="text-xs text-gray-400">
                  Precio final: S/{" "}
                  {Number(chat.lastSubastaPrecioFinal).toFixed(2)}
                </p>
              )}
            </div>
          </div>

          <Link
            href="/chats"
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
          >
            Ver todos los chats
          </Link>
          <button
  onClick={handleDeleteChat}
  className="text-xs px-2 py-1 rounded bg-red-700 hover:bg-red-600 ml-2"
>
  Eliminar chat
</button>

        </header>

        {/* CONTENIDO */}
        <section className="flex-1 flex flex-col">
          {/* Mensajes */}
      <div
  ref={scrollRef}
  className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
>
{/* BOTÓN PARA CARGAR MENSAJES ANTERIORES */}
{hasMore && !loading && (
  <div className="flex justify-center my-2">
    <button
  onClick={() => {
    const el = scrollRef.current;
    if (el) {
      prevScrollHeight.current = el.scrollHeight;
      shouldRestoreScroll.current = true;
    }
    loadMore();
  }}
  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded-full"
>
  Cargar mensajes anteriores
</button>

  </div>
)}


{loadingChat || loading ? (
              <p className="text-gray-300 text-sm">Cargando chat...</p>
            ) : !chat ? (
              <p className="text-gray-400 text-sm">
                Este chat no existe o ha sido eliminado.
              </p>
            ) : messages.length === 0 ? (
              <p className="text-gray-400 text-sm">
                No hay mensajes. El sistema enviará uno automático cuando la
                subasta se cierre.
              </p>
            ) : (
              messages.map((m) => {
                const isMine = user && m.senderUid === user.uid;
                const isSystem = m.system;
                const images = getMessageImages(m);
                const hasImages = images.length > 0;

                let fecha = "";
                if (m.createdAt?.toDate) {
                  fecha = m.createdAt.toDate().toLocaleString("es-PE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  });
                }

                // Mensaje automático del sistema -> se ve como del vendedor, con tarjeta de subasta
                if (isSystem) {
                  const hasSubastaInfo =
                    m.subastaId ||
                    m.subastaTitulo ||
                    m.precioFinal != null;

                  const subastaImage = m.subastaImageUrl || null;
                  const subastaTitulo =
                    m.subastaTitulo || "Subasta ganada";

                  const copiasMsg =
                    m.cantidadComprada &&
                    Number(m.cantidadComprada) > 0
                      ? Number(m.cantidadComprada)
                      : null;
// ✅ Quitar la línea bug: "Comprador(Comprador)" o "Vendedor(Vendedor)"
const cleanSystemText = (txt) => {
  if (!txt) return "";
  return txt.replace(/^(Comprador|Vendedor)\(\1\)\s*\n+/i, "");
};

const systemText = cleanSystemText(m.text || "");


                  return (
<div
  key={m.id}
  className={`flex ${
    // Si el usuario actual ES el vendedor → mensaje a la derecha
    user && chat?.vendedorUid === user.uid
      ? "justify-end"
      : "justify-start"
  }`}
>
                      <div className="max-w-[75%] rounded-2xl px-3 py-2 text-xs bg-[#101828] text-gray-100 rounded-bl-sm">
                        <p className="text-[10px] text-amber-300 mb-1 uppercase tracking-wide">
                          Mensaje automático del vendedor
                        </p>

                        {/* Texto o mensaje eliminado */}
                       {m.deleted ? (
                          <p className="italic opacity-60 text-[11px]">
                            🗑️ Mensaje eliminado
                          </p>
                        ) : (
                          systemText && (
                            <p className="whitespace-pre-wrap break-words">
                              {systemText}
                            </p>
                          )
                        )}
                        {/* Imagen adjunta al mensaje del sistema (primera) */}
                        {!m.deleted && hasImages && (
                          <div className={m.text ? "mt-2" : ""}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={images[0]}
                              alt="Imagen enviada"
                              className="max-h-64 rounded-lg object-contain cursor-zoom-in"
                              onClick={() => openZoom(images, 0)}
                              loading="lazy"

                            />
                          </div>
                        )}

                        {hasSubastaInfo && (
                          <div className="mt-2 border border-white/10 rounded-lg bg-black/40 p-2 flex gap-2">
                            {subastaImage && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={subastaImage}
                                alt={subastaTitulo}
                                className="w-10 h-14 object-cover rounded"
                              />
                            )}

                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-white truncate">
                                {subastaTitulo}
                              </p>
                              {m.precioFinal != null && (
                                <p className="text-[11px] text-gray-300">
                                  Precio final: S/{" "}
                                  {Number(m.precioFinal).toFixed(2)}
                                </p>
                              )}
                              {copiasMsg && (
                                <p className="text-[11px] text-gray-300">
                                  Copias en esta compra:{" "}
                                  <span className="font-semibold">
                                    {copiasMsg}
                                  </span>
                                </p>
                              )}
                              {m.subastaId && (
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                  ID subasta: {m.subastaId}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {fecha && (
                          <p className="mt-1 text-[10px] opacity-70 text-right">
                            {fecha}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }

                // Mensajes normales
                return (
                  <div
                    key={m.id}
                    className={`flex ${
                      isMine ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${
                        isMine
                          ? "bg-emerald-600 text-white rounded-br-sm"
                          : "bg-[#101828] text-gray-100 rounded-bl-sm"
                      }`}
                    >
                      {/* Texto / eliminado */}
                      {m.deleted ? (
                        <p className="italic opacity-60 text-[11px]">
                          🗑️ Mensaje eliminado
                        </p>
                      ) : (
                        m.text && (
                          <p className="whitespace-pre-wrap break-words">
                            {m.text}
                          </p>
                        )
                      )}

                      {/* Imágenes (si hay y no está eliminado) */}
                      {!m.deleted && hasImages && (
                        <div
                          className={
                            m.text
                              ? "mt-2 flex flex-wrap gap-2"
                              : "flex flex-wrap gap-2"
                          }
                        >
                          {images.map((url, idx) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={url + idx}
                              src={url}
                              alt="Imagen enviada"
                              className="max-h-40 rounded-lg object-cover cursor-zoom-in"
                              onClick={() => openZoom(images, idx)}
                              loading="lazy"

                            />
                          ))}
                        </div>
                      )}

                      {fecha && (
                        <p className="mt-1 text-[10px] opacity-70 text-right">
                          {fecha}
                        </p>
                      )}

                      {/* Botón eliminar solo en mensajes propios y no eliminados */}
                      {isMine && !m.deleted && (
                        <button
                          onClick={() => handleDeleteMessage(m)}
                          className="mt-1 text-[10px] text-red-200 hover:text-red-100 underline"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input para escribir */}
          <div className="border-t border-white/10 px-4 py-3">
            {!user ? (
              <p className="text-xs text-gray-400">
                Inicia sesión para poder enviar mensajes.
              </p>
            ) : !chat ? (
              <p className="text-xs text-gray-400">
                No se puede enviar mensajes en este chat.
              </p>
            ) : (
              <>
                {otherIsTyping && (
                  <p className="text-[11px] text-gray-400 mb-1">
                    El otro usuario está escribiendo...
                  </p>
                )}

                {/* Preview de imágenes listas para enviar */}
                {pendingImages.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {pendingImages.map((img) => (
                      <div
                        key={img.id}
                        className="relative w-16 h-16 rounded-lg overflow-hidden border border-emerald-500 bg-black/40"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.previewUrl}
                          alt="Imagen a enviar"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleRemovePendingImage(img.id)
                          }
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-700 text-[10px] text-white flex items-center justify-center shadow"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <span className="text-[11px] text-gray-400 self-center">
                      {uploadingImage
                        ? "Subiendo imágenes..."
                        : "Imágenes listas para enviar"}
                    </span>
                  </div>
                )}

                <div className="flex gap-2.items-center">
                  {/* Input de archivo oculto (multi) */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageChange}
                  />

                  {/* Botón para abrir selector de imágenes */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-2 rounded-full bg-gray-700 hover:bg-gray-600 text-lg leading-none"
                    title="Adjuntar imágenes"
                  >
                    📷
                  </button>

                  <textarea
                    rows={1}
                    value={newMessage}
                    onChange={handleTextareaChange}
                    onKeyDown={handleTextareaKeyDown}
                    onPaste={handleTextareaPaste}
                    className="flex-1 resize-none bg-[#050914] border border-[#283145] rounded-xl px-3 py-2 text-sm text-white
                             focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="Escribe un mensaje..."
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={
                      uploadingImage ||
                      (!newMessage.trim() && pendingImages.length === 0)
                    }
                    className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                      uploadingImage
                        ? "bg-gray-700 text-gray-400 cursor-wait"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }`}
                  >
                    {uploadingImage ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* MODAL DE ZOOM PARA IMÁGENES (con navegación) */}
      {zoomOpen && zoomImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={closeZoom}
        >
          <div
            className="relative max-w-[95vw] max-h-[95vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()} // evita cerrar al hacer clic sobre la imagen
          >
            {/* Botón cerrar */}
            <button
              type="button"
              onClick={closeZoom}
              className="absolute -top-10 right-0 px-3 py-1 rounded-full bg-gray-800 text-xs text-white hover:bg-gray-700"
            >
              Cerrar ✕
            </button>

            {/* Flecha izquierda */}
            {zoomImages.length > 1 && (
              <button
                type="button"
                onClick={goPrevImage}
                className="absolute left-[-3rem] md:left-[-4rem] px-2 py-2 rounded-full bg-gray-900/80 hover:bg-gray-700 text-white text-xl"
              >
                ‹
              </button>
            )}

            {/* Imagen principal */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomImages[zoomIndex]}
              alt="Imagen ampliada"
              className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg"
            />

            {/* Flecha derecha */}
            {zoomImages.length > 1 && (
              <button
                type="button"
                onClick={goNextImage}
                className="absolute right-[-3rem] md:right-[-4rem] px-2 py-2 rounded-full bg-gray-900/80 hover:bg-gray-700 text-white text-xl"
              >
                ›
              </button>
            )}

            {/* Indicador de posición */}
            {zoomImages.length > 1 && (
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-xs text-gray-200 bg-black/60 px-3 py-1 rounded-full">
                {zoomIndex + 1} / {zoomImages.length}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
