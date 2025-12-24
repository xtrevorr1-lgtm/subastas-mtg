"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import UserLink from "../../components/UserLink";
import { getDoc, doc } from "firebase/firestore";

function timestampToMs(t) {
  if (!t) return 0;
  if (typeof t === "number") return t;
  if (t.toMillis) return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  return 0;
}import MyProfileLink from "../../components/MyProfileLink";

export default function ChatsPage() {
  const router = useRouter();   // 👈 AQUÍ SIEMPRE
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setChats([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.uid),
      orderBy("lastMessageAt", "desc")
    );

    const unsub = onSnapshot(
  q,
  async (snap) => {
    const arr = await Promise.all(
      snap.docs.map(async (docSnap) => {
        const data = docSnap.data();

        let compradorPhoto = null;
        let vendedorPhoto = null;

        // Foto del comprador
        try {
          const refC = doc(db, "users", data.compradorUid);
          const snapC = await getDoc(refC);
          if (snapC.exists()) {
            const u = snapC.data();
            compradorPhoto = u.avatarUrl || u.photoURL || null;
          }
        } catch {}

        // Foto del vendedor
        try {
          const refV = doc(db, "users", data.vendedorUid);
          const snapV = await getDoc(refV);
          if (snapV.exists()) {
            const u = snapV.data();
            vendedorPhoto = u.avatarUrl || u.photoURL || null;
          }
        } catch {}

        return {
          id: docSnap.id,
          ...data,
          compradorPhoto,
          vendedorPhoto,
        };
      })
    );

    setChats(
  arr.filter((chat) => {
    // si NO está eliminado para el usuario → mostrarlo
    if (!chat.deletedFor || !user) return true;

    return chat.deletedFor[user.uid] !== true;
  })
);

    setLoading(false);
  },
  (err) => {
    console.error("Error cargando chats:", err);
    setLoading(false);
  }
);


    return () => unsub();
  }, [user]);

 const handleLogout = async () => {
  try {
    await signOut(auth);
    router.push("/");   // 👈 REDIRECCIONA AL HOME
  } catch (err) {
    console.error(err);
    alert("Error al cerrar sesión: " + (err.message || err));
  }
};


  const getOtherParticipant = (chat, currentUser) => {
    if (!currentUser) return { name: "Usuario", role: "", initial: "U" };

    const isVendedor = chat.vendedorUid === currentUser.uid;
    const otherName = isVendedor
      ? chat.compradorNameSnapshot || "Comprador"
      : chat.vendedorNameSnapshot || "Vendedor";

    const role = isVendedor ? "Comprador" : "Vendedor";
    const initial =
      otherName && typeof otherName === "string"
        ? otherName.trim().charAt(0).toUpperCase()
        : "U";

    return { name: otherName, role, initial };
  };

  const hasUnread = (chat, currentUser) => {
  if (!currentUser) return false;
  if (!chat.lastMessageAt) return false;

  const lastMsgMs = timestampToMs(chat.lastMessageAt);
  const lastReadForUser =
    chat.lastReadAt && chat.lastReadAt[currentUser.uid];

  // 🛑 1. Si el último mensaje es mío → JAMÁS puede ser no leído
  if (chat.lastMessageSenderUid === currentUser.uid) {
    return false;
  }

  // 🛑 2. Si nunca lo ha abierto → sí hay no leídos PERO solo si el mensaje NO es mío
  if (!lastReadForUser) {
    return true;
  }

  const lastReadMs = timestampToMs(lastReadForUser);

  // 🟢 3. Si la fecha del último mensaje del OTRO > mi fecha de lectura → no leído
  return lastMsgMs > lastReadMs;
};


  const getPreviewText = (chat, currentUser) => {
    if (!chat.lastMessage) {
      return "Chat creado automáticamente para esta subasta.";
    }

    const isMine =
      currentUser &&
      chat.lastMessageSenderUid &&
      chat.lastMessageSenderUid === currentUser.uid;

    if (isMine) {
      return `Tú: ${chat.lastMessage}`;
    }

    return chat.lastMessage;
  };

  const unreadCount = user
    ? chats.filter((c) => hasUnread(c, user)).length
    : 0;

  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-6">
<header className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#02060b]/95 backdrop-blur">
          <div>
            <h1 className="text-2xl font-bold">
              Chats{" "}
              {unreadCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs rounded-full bg-red-600 text-white">
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-400">
              Conversaciones entre vendedores y compradores.
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
                <MyProfileLink className="text-gray-300" />

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

        {loading ? (
          <p className="text-gray-300 text-sm">Cargando chats...</p>
        ) : !user ? (
          <p className="text-gray-400 text-sm">
            Debes iniciar sesión para ver tus chats.
          </p>
        ) : chats.length === 0 ? (
          <p className="text-gray-400 text-sm">
            Aún no tienes chats. Cuando ganes o cierres una subasta, se creará uno.
          </p>
        ) : (
          <div className="space-y-3">
            {chats.map((chat) => {
              const { name, role, initial } = getOtherParticipant(
                chat,
                user
              );
              const otherPhoto =
  chat.vendedorUid === user.uid
    ? chat.compradorPhoto
    : chat.vendedorPhoto;

              const previewText = getPreviewText(chat, user);
              const unread = hasUnread(chat, user);

              return (
                <Link
                  key={chat.id}
                  href={`/chats/${chat.id}`}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                    unread
                      ? "border-emerald-500 bg-emerald-900/20"
                      : "border-white/10 bg-black/30 hover:bg-black/50"
                  }`}
                >
                  {/* Avatar con inicial de la otra persona */}
                  {otherPhoto ? (
  <img
    src={otherPhoto}
    alt={name}
    className="w-10 h-10 rounded-full object-cover border border-white/20 shrink-0"
  />
) : (
  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-emerald-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
    {initial}
  </div>
)}


                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm truncate ${
                        unread
                          ? "font-bold text-white"
                          : "font-semibold text-white"
                      }`}
                    >
                    <span className="text-emerald-400">
  {name}
</span>



                      {role && (
                        <span className="ml-2 text-[11px] text-gray-400">
                          ({role})
                        </span>
                      )}
                      {unread && (
                        <span className="ml-1 inline-block w-2 h-2 rounded-full bg-emerald-400 align-middle" />
                      )}
                    </p>

                    {/* Info de la última subasta asociada */}
                    {chat.lastSubastaTitulo && (
                      <p className="text-xs text-gray-400 truncate">
                        Subasta: {chat.lastSubastaTitulo}
                      </p>
                    )}
                    {chat.lastSubastaPrecioFinal != null && (
                      <p className="text-xs text-gray-500">
                        Precio final: S/{" "}
                        {Number(chat.lastSubastaPrecioFinal).toFixed(2)}
                      </p>
                    )}

                    {/* Previsualización del último mensaje */}
                    <p
                      className={`text-xs mt-1 line-clamp-2 ${
                        unread ? "text-gray-100" : "text-gray-300"
                      }`}
                    >
                      {previewText}
                    </p>
                  </div>

                  {/* Miniatura de la subasta, si hay */}
                  {chat.lastSubastaImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={chat.lastSubastaImageUrl}
                      alt={chat.lastSubastaTitulo || "Subasta"}
                      className="w-10 h-14 object-cover rounded"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}




