"use client";

import { useEffect, useState, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

export default function usePaginatedMessages(chatId, { enabled = true } = {}) {
  const [messages, setMessages] = useState([]);
  const [lastVisible, setLastVisible] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  // Cargar primeros 20 (y escuchar cambios) SOLO si enabled === true
  useEffect(() => {
    // Reset cada vez que cambia chatId o enabled
    setMessages([]);
    setLastVisible(null);
    setHasMore(true);
    setLoading(true);

    if (!enabled || !chatId) {
      setLoading(false);
      return;
    }

    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "desc"), limit(20));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setMessages(arr.reverse());
        setLastVisible(snap.docs[snap.docs.length - 1] || null);

        // Si son 20 exactos, puede haber más
        setHasMore(snap.docs.length === 20);
        setLoading(false);
      },
      (err) => {
        // 🔥 IMPORTANTÍSIMO: si hay permission-denied, evita que reviente la página
        console.error("usePaginatedMessages snapshot error:", err);

        setMessages([]);
        setLastVisible(null);
        setHasMore(false);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [chatId, enabled]);

  // Cargar más mensajes (sin listener, solo getDocs)
  const loadMore = useCallback(async () => {
    if (!enabled) return;
    if (!chatId) return;
    if (!lastVisible || !hasMore) return;

    try {
      const messagesRef = collection(db, "chats", chatId, "messages");
      const q = query(
        messagesRef,
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(20)
      );

      const snap = await getDocs(q);

      if (!snap.empty) {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setMessages((prev) => [...arr.reverse(), ...prev]);
        setLastVisible(snap.docs[snap.docs.length - 1] || null);

        if (snap.docs.length < 20) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("usePaginatedMessages loadMore error:", err);
      // Si falla por permisos, deja de intentar cargar más
      setHasMore(false);
    }
  }, [enabled, chatId, lastVisible, hasMore]);

  return { messages, loading, hasMore, loadMore };
}
