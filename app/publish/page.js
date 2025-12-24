"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  runTransaction,
  getDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
// 🔑 Clave estable para recordar últimos valores
const LS_KEY = "mtg_publish_defaults";

function loadDefaults() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDefaults(data) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export default function PublishPage() {
  const router = useRouter();   // 👈 AQUÍ SIEMPRE
  const [user, setUser] = useState(null);

  // 🧠 Inicialización leyendo localStorage solo UNA vez

  const [titulo, setTitulo] = useState(() => {
    const d = loadDefaults();
    return d?.titulo ?? "";
  });

  const [precioBase, setPrecioBase] = useState(() => {
    const d = loadDefaults();
    return d?.precioBase != null ? String(d.precioBase) : "";
  });

  const [pujaMinima, setPujaMinima] = useState(() => {
    const d = loadDefaults();
    return d?.pujaMinima != null ? String(d.pujaMinima) : "1";
  });

  const [compraDirecta, setCompraDirecta] = useState(() => {
    const d = loadDefaults();
    if (!d || d.compraDirecta == null || d.compraDirecta === "") return "";
    return String(d.compraDirecta);
  });

  const [cantidad, setCantidad] = useState(() => {
    const d = loadDefaults();
    return d?.cantidad != null ? String(d.cantidad) : "1";
  });

  const [precioReferencial, setPrecioReferencial] = useState(() => {
    const d = loadDefaults();
    return d?.precioReferencial != null ? String(d.precioReferencial) : "";
  });

  const [precioReferencialCurrency, setPrecioReferencialCurrency] = useState(
    () => {
      const d = loadDefaults();
      return d?.precioReferencialCurrency ?? "PEN";
    }
  );

  const [fechaFinal, setFechaFinal] = useState(() => {
    const d = loadDefaults();
    return d?.fechaFinal ?? "";
  });

  const [horaFinal, setHoraFinal] = useState(() => {
    const d = loadDefaults();
    return d?.horaFinal ?? "";
  });

  const [vendedorContacto, setVendedorContacto] = useState(() => {
    const d = loadDefaults();
    return d?.vendedorContacto ?? "";
  });

  const [descripcion, setDescripcion] = useState(() => {
    const d = loadDefaults();
    return d?.descripcion ?? "";
  });

  const [zonaEntrega, setZonaEntrega] = useState(() => {
    const d = loadDefaults();
    return d?.zonaEntrega ?? "";
  });

  const [mensajeAuto, setMensajeAuto] = useState(() => {
    const d = loadDefaults();
    return (
      d?.mensajeAuto ??
      '¡Felicitaciones! Ganaste la subasta "{{titulo}}" por {{moneda}} {{monto}}. Puedes comunicarte al {{telefono}}.'
    );
  });

  // 🔄 NUEVO: modo de publicación (ahora / programada)
  const [publishMode, setPublishMode] = useState(() => {
    const d = loadDefaults();
    return d?.publishMode ?? "now"; // "now" | "scheduled"
  });

  // 🔄 NUEVO: fecha/hora de INICIO (solo si programada)
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = loadDefaults();
    return d?.fechaInicio ?? "";
  });

  const [horaInicio, setHoraInicio] = useState(() => {
    const d = loadDefaults();
    return d?.horaInicio ?? "";
  });

  // Imágenes en memoria (no se guardan en localStorage)
  const [images, setImages] = useState([]); // [{ file, previewUrl, id }]
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Sesión
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Guardar defaults cada vez que cambian los campos (excepto imágenes)
  useEffect(() => {
    saveDefaults({
      titulo,
      precioBase,
      pujaMinima,
      compraDirecta,
      cantidad,
      precioReferencial,
      precioReferencialCurrency,
      fechaFinal,
      horaFinal,
      vendedorContacto,
      descripcion,
      zonaEntrega,
      mensajeAuto,
      publishMode,
      fechaInicio,
      horaInicio,
    });
  }, [
    titulo,
    precioBase,
    pujaMinima,
    compraDirecta,
    cantidad,
    precioReferencial,
    precioReferencialCurrency,
    fechaFinal,
    horaFinal,
    vendedorContacto,
    descripcion,
    zonaEntrega,
    mensajeAuto,
    publishMode,
    fechaInicio,
    horaInicio,
  ]);

  // 📷 Manejo de imágenes
  const handleFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const mapped = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      id: `${file.name}_${file.size}_${file.lastModified}_${Math.random()}`,
    }));

    setImages((prev) => {
      const newArr = [...prev, ...mapped];
      setSelectedIndex(newArr.length - 1); // mostrar siempre la última añadida
      return newArr;
    });

    e.target.value = "";
  };

  const handleRemoveImage = (idx) => {
    setImages((prev) => {
      if (!prev[idx]) return prev;

      // liberar url
      try {
        URL.revokeObjectURL(prev[idx].previewUrl);
      } catch {
        // ignore
      }

      const newArr = prev.filter((_, i) => i !== idx);

      if (!newArr.length) {
        setSelectedIndex(0);
      } else {
        setSelectedIndex((current) => {
          if (current === idx) {
            return Math.max(0, current - 1);
          }
          if (current > idx) {
            return current - 1;
          }
          return current;
        });
      }

      return newArr;
    });
  };

  // 🕒 Fecha/hora FINAL -> timestamp en ms
  const parseFinalizaMs = () => {
    if (!fechaFinal || !horaFinal) return null;

    try {
      const [yearStr, monthStr, dayStr] = fechaFinal.split("-");
      const [hourStr, minStr] = horaFinal.split(":");

      const year = Number(yearStr);
      const month = Number(monthStr) - 1;
      const day = Number(dayStr);
      const hour = Number(hourStr ?? "0");
      const minute = Number(minStr ?? "0");

      const d = new Date(year, month, day, hour, minute, 0, 0);
      const time = d.getTime();
      if (Number.isNaN(time)) return null;
      return time;
    } catch {
      return null;
    }
  };

  // 🕒 NUEVO: Fecha/hora INICIO -> timestamp en ms
  const parseInicioMs = () => {
    if (!fechaInicio || !horaInicio) return null;

    try {
      const [yearStr, monthStr, dayStr] = fechaInicio.split("-");
      const [hourStr, minStr] = horaInicio.split(":");

      const year = Number(yearStr);
      const month = Number(monthStr) - 1;
      const day = Number(dayStr);
      const hour = Number(hourStr ?? "0");
      const minute = Number(minStr ?? "0");

      const d = new Date(year, month, day, hour, minute, 0, 0);
      const time = d.getTime();
      if (Number.isNaN(time)) return null;
      return time;
    } catch {
      return null;
    }
  };

  // 🧾 Publicar subasta
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback("");

    if (!user) {
      alert("Debes iniciar sesión para publicar una subasta.");
      return;
    }

    const tituloTrim = titulo.trim();
    if (!tituloTrim) {
      alert("Ingresa un título para la subasta.");
      return;
    }

    const base = Number(precioBase);
    const min = Number(pujaMinima || 1);
    const cd = compraDirecta ? Number(compraDirecta) : null;
    const qty = Math.max(1, Number(cantidad || 1));

    if (!Number.isFinite(base) || base <= 0) {
      alert("Ingresa un precio base válido (mayor a 0).");
      return;
    }
    if (!Number.isFinite(min) || min <= 0) {
      alert("Ingresa una puja mínima válida (mayor a 0).");
      return;
    }
    if (cd != null && (!Number.isFinite(cd) || cd <= base)) {
      alert(
        "La compra directa debe ser un número mayor al precio base, o deja el campo vacío."
      );
      return;
    }

    const finalizaMs = parseFinalizaMs();
    if (!finalizaMs) {
      alert("Selecciona una fecha y hora de finalización válidas.");
      return;
    }

    let inicioMs = null;
    const ahoraMs = Date.now();

    if (publishMode === "scheduled") {
      inicioMs = parseInicioMs();
      if (!inicioMs) {
        alert("Selecciona una fecha y hora de INICIO válidas.");
        return;
      }
      if (inicioMs <= ahoraMs) {
        alert("La fecha/hora de inicio debe ser en el futuro.");
        return;
      }
      if (inicioMs >= finalizaMs) {
        alert("La fecha/hora de inicio debe ser ANTES de la fecha de finalización.");
        return;
      }
    }

    setSaving(true);
    try {
      // 1️⃣ OBTENER NÚMERO SECUENCIAL CON TRANSACCIÓN
      const counterRef = doc(db, "metadata", "subastaCounter");
      let numeroSecuencial = 0;

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        if (!snap.exists()) {
          throw new Error("El documento 'subastaCounter' no existe en Firestore.");
        }
        const current = snap.data().value || 0;
        const next = current + 1;
        tx.update(counterRef, { value: next });
        numeroSecuencial = next;
      });

      // 2️⃣ Subir imágenes
      let imageUrl = null;
      let imagePath = null;
      const imageUrls = [];
      const imagePaths = [];

      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const file = img.file;
          const storagePath = `subastas/${Date.now()}_${i}_${file.name}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);

          imageUrls.push(url);
          imagePaths.push(storagePath);
        }

        imageUrl = imageUrls[0] ?? null;
        imagePath = imagePaths[0] ?? null;
      }

      const precioRefNum = precioReferencial
        ? Number(precioReferencial)
        : null;
      const precioRefValid =
        precioRefNum != null && Number.isFinite(precioRefNum)
          ? precioRefNum
          : null;

      const multiMode =
        qty > 1
          ? "buyNow" // cada Compra Directa vende 1 copia
          : "bids"; // subasta normal

      const vendedorContactoTrim = vendedorContacto.trim();
      const descripcionTrim = descripcion.trim();
      const zonaEntregaTrim = zonaEntrega.trim();
      // 🔥 Obtener datos reales del vendedor desde users/{uid}
      let vendedorAvatarUrl = user.photoURL || null;
      let vendedorNombre = user.displayName || user.email || "Vendedor";

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();

          vendedorAvatarUrl =
            data.avatarUrl || data.photoURL || user.photoURL || null;

          vendedorNombre = data.displayName || vendedorNombre;
        }
      } catch (err) {
        console.warn("No se pudo leer avatar desde users/:", err);
      }

      // 📄 Datos que realmente se guardan en la subasta
      const baseDocData = {
        // Datos básicos de la subasta
        titulo: tituloTrim,
        precioBase: base,
        pujaMinima: min,
        compraDirecta: cd,
        cantidad: qty,

        // Precio referencial
        precioReferencial: precioRefValid,
        precioReferencialCurrency,

        // Tiempos
        finaliza: finalizaMs,
        createdAt: serverTimestamp(),

        // Datos del vendedor
        vendedorUid: user.uid,
        vendedorName: vendedorNombre,
        vendedorNameSnapshot: vendedorNombre,
        vendedorAvatar: vendedorAvatarUrl,
        vendedorContacto: vendedorContactoTrim || null,

        // Texto extra
        descripcion: descripcionTrim || null,
        zonaEntrega: zonaEntregaTrim || null,

        // Imágenes
        imageUrl,
        imagePath,
        imageUrls,
        imagePaths,

        // Modo multi-copias
        multiMode,

        // Mensaje automático
        mensajeAutoGanadorTemplate:
          mensajeAuto && mensajeAuto.trim().length > 0
            ? mensajeAuto
            : null,

        // Estado de pujas
        precioActual: null,
        ultimoPostorUid: null,
        ultimoPostorName: null,

        // Multi-ganadores (inicial)
        copiasVendidas: 0,
        winners: [],
        winnerUids: [],
        winnerQuantities: {},

        // Número secuencial
        numeroSecuencial,
      };



      let docData = { ...baseDocData };

      let targetCollectionName = "subastas";

      if (publishMode === "now") {
        docData.status = "active";
      } else {
        // programada
        docData.status = "scheduled";
        docData.startAt = inicioMs;
        targetCollectionName = "programadas";
      }

      const colRef = collection(db, targetCollectionName);
      const docRef = await addDoc(colRef, docData);
      console.log(
        `Subasta ${publishMode === "now" ? "creada" : "programada"} con ID:`,
        docRef.id
      );

      setFeedback(
        publishMode === "now"
          ? "✅ Subasta creada y publicada correctamente."
          : "✅ Subasta programada correctamente. Se publicará automáticamente en la fecha/hora indicada."
      );
      // ⬆️ Llevar scroll automáticamente al inicio
try {
  window.scrollTo({ top: 0, behavior: "smooth" });
} catch {}


      // Limpiar solo imágenes (los campos quedan igual para la siguiente)
      images.forEach((img) => {
        try {
          URL.revokeObjectURL(img.previewUrl);
        } catch {
          // ignore
        }
      });
      setImages([]);
      setSelectedIndex(0);
    } catch (err) {
      console.error("Error creando subasta:", err);
      alert("No se pudo crear la subasta. Revisa la consola para más detalles.");
    } finally {
      setSaving(false);
    }
  };

 const handleLogout = async () => {
  try {
    await signOut(auth);
    router.push("/");   // 👈 REDIRECCIONA AL HOME
  } catch (err) {
    console.error(err);
    alert("Error al cerrar sesión: " + (err.message || err));
  }
};


  const selectedImage =
    images.length > 0 && images[selectedIndex]
      ? images[selectedIndex]
      : null;

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* HEADER */}
        <header className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#02060b]/95 backdrop-blur">
          <div>
            <h1 className="text-2xl font-bold">Publicar subasta</h1>
            <p className="text-sm text-gray-400">
              Crea una nueva subasta para la comunidad de MTG Lima.
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm">
            

            <Link
              href="/"
              className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
            >
              Volver al inicio
            </Link>
            {user && (
              <>
                <span className="text-gray-300">
                  {user.displayName || user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
                >
                  Cerrar sesión
                </button>
              </>
            )}
          </div>
        </header>

        {!user ? (
          <p className="text-sm text-gray-300">
            Debes iniciar sesión en la página principal antes de publicar una
            subasta.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-6 bg-[#050914] border border-[#1b2335] rounded-2xl p-5 shadow-lg"
          >
            {feedback && (
              <div className="text-xs bg-emerald-900/40 border border-emerald-600/70 text-emerald-100 rounded-md px-3 py-2 mb-2">
                {feedback}
              </div>
            )}

            {/* Título */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Nombre de la carta / producto
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                           focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Ej: Orcish Bowmasters (foil, NM)"
              />
            </div>

            {/* Precios */}
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Precio base (S/)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={precioBase}
                  onChange={(e) => setPrecioBase(e.target.value)}
                  className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                             focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Puja mínima (S/)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={pujaMinima}
                  onChange={(e) => setPujaMinima(e.target.value)}
                  className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                             focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Compra directa (S/) (opcional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={compraDirecta}
                  onChange={(e) => setCompraDirecta(e.target.value)}
                  className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                             focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Dejar vacío si no aplica"
                />
              </div>
            </div>

            {/* Cantidad */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Cantidad de copias
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                           focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />

              {Number(cantidad || 1) > 1 && (
                <p className="mt-2 text-[11px] text-gray-500">
                  Cuando hay varias copias,{" "}
                  <span className="font-semibold">
                    cada Compra Directa vende 1 copia
                  </span>{" "}
                  y la subasta sigue hasta agotar stock.
                </p>
              )}
            </div>

            {/* Precio referencial */}
            <div className="grid md:grid-cols-[1fr_auto] gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Precio referencial (opcional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={precioReferencial}
                  onChange={(e) => setPrecioReferencial(e.target.value)}
                  className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                             focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Moneda
                </label>
                <select
                  value={precioReferencialCurrency}
                  onChange={(e) =>
                    setPrecioReferencialCurrency(e.target.value)
                  }
                  className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                             focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="PEN">S/ (PEN)</option>
                  <option value="USD">$ (USD)</option>
                </select>
              </div>
            </div>

            {/* MODO DE PUBLICACIÓN */}
            <div className="border border-white/5 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-300 mb-2">
                ¿Cuándo quieres que se publique esta subasta?
              </p>
              <div className="flex flex-col gap-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="publishMode"
                    value="now"
                    checked={publishMode === "now"}
                    onChange={() => setPublishMode("now")}
                  />
                  <span>Publicar ahora (se muestra de inmediato en el listado)</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="publishMode"
                    value="scheduled"
                    checked={publishMode === "scheduled"}
                    onChange={() => setPublishMode("scheduled")}
                  />
                  <span>Programar inicio (se activará automáticamente más adelante)</span>
                </label>
              </div>

              {publishMode === "scheduled" && (
                <div className="mt-3 grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Fecha de INICIO
                    </label>
                    <input
                      type="date"
                      value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)}
                      className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                                 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Hora de INICIO
                    </label>
                    <input
                      type="time"
                      value={horaInicio}
                      onChange={(e) => setHoraInicio(e.target.value)}
                      className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                                 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}

              <p className="mt-2 text-[11px] text-gray-500">
                La fecha de finalización debe ser siempre posterior a la fecha de inicio.
              </p>
            </div>

            {/* Fecha y hora FINAL */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Fecha de finalización
                </label>
                <input
                  type="date"
                  value={fechaFinal}
                  onChange={(e) => setFechaFinal(e.target.value)}
                  className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                             focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Hora de finalización
                </label>
                <input
                  type="time"
                  value={horaFinal}
                  onChange={(e) => setHoraFinal(e.target.value)}
                  className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                             focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Contacto */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Datos de contacto (WhatsApp, celular, etc.)
              </label>
              <input
                type="text"
                value={vendedorContacto}
                onChange={(e) => setVendedorContacto(e.target.value)}
                className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                           focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Ej: 987654321"
              />
            </div>

            {/* Descripción del artículo (opcional) */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Descripción del artículo (opcional)
              </label>
              <textarea
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                           focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                placeholder="Estado, idioma, edición, detalles importantes, etc."
              />
            </div>

            {/* Zona de entrega (opcional) */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Zona de entrega (opcional)
              </label>
              <input
                type="text"
                value={zonaEntrega}
                onChange={(e) => setZonaEntrega(e.target.value)}
                className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                           focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Ej: Miraflores, Centro de Lima, estación Metropolitano, etc."
              />
            </div>

            {/* Imágenes */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Imágenes de la carta / producto (puedes subir varias)
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFilesChange}
                className="block w-full text-xs text-gray-300
                           file:mr-3 file:py-2 file:px-3
                           file:rounded-md file:border-0
                           file:text-xs file:font-semibold
                           file:bg-emerald-700 file:text-white
                           hover:file:bg-emerald-800"
              />

              <div className="mt-3 grid md:grid-cols-[120px_minmax(0,1fr)] gap-3">
                {/* Thumbs */}
                <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible">
                  {images.length === 0 ? (
                    <div className="w-[100px] h-[100px] border border-dashed border-gray-600 rounded-lg flex items-center justify-center text-[11px] text-gray-500">
                      Sin imágenes
                    </div>
                  ) : (
                    images.map((img, idx) => (
                      <div
                        key={img.id}
                        className={`relative w-[80px] h-[80px] rounded-lg overflow-hidden border cursor-pointer ${
                          idx === selectedIndex
                            ? "border-emerald-500"
                            : "border-gray-600"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.previewUrl}
                          alt={`Imagen ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onClick={() => setSelectedIndex(idx)}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-700 text-[10px] text-white flex items-center justify-center shadow"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Preview grande */}
                <div className="min-h-[160px] bg-[#02060b] border border-[#283145] rounded-lg flex items-center justify-center overflow-hidden">
                  {selectedImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedImage.previewUrl}
                      alt="Previsualización grande"
                      className="max-h-[260px] w-auto object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-xs text-gray-500">
                      <span className="text-lg mb-1">🖼️</span>
                      <span>Previsualización</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mensaje automático */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Mensaje automático para el ganador
              </label>
              <textarea
                rows={3}
                value={mensajeAuto}
                onChange={(e) => setMensajeAuto(e.target.value)}
                className="w-full bg-[#02060b] border border-[#283145] rounded-lg px-3 py-2 text-sm text-white
                           focus:outline-none focus:ring-1 focus:ring-emerald-500.resize-none"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Puedes usar:{" "}
                <code className="bg-black/40 px-1 rounded">
                  {"{{titulo}}"}
                </code>
                ,{" "}
                <code className="bg-black/40 px-1 rounded">
                  {"{{monto}}"}
                </code>
                ,{" "}
                <code className="bg-black/40 px-1 rounded">
                  {"{{moneda}}"}
                </code>
                ,{" "}
                <code className="bg-black/40 px-1 rounded">
                  {"{{telefono}}"}
                </code>
                ,{" "}
                <code className="bg-black/40 px-1 rounded">
                  {"{{diasLimite}}"}
                </code>
                ,{" "}
                <code className="bg-black/40 px-1 rounded">
                  {"{{idSubasta}}"}
                </code>
                ,{" "}
                <code className="bg-black/40 px-1 rounded">
                  {"{{fechaCierre}}"}
                </code>
                .
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className={`w-full py-2.5 rounded-full text-sm font-semibold transition
                  ${
                    saving
                      ? "bg-gray-700 text-gray-400 cursor-wait"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white"
                  }`}
              >
                {saving
                  ? "Publicando..."
                  : publishMode === "now"
                  ? "Publicar subasta"
                  : "Programar subasta"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
