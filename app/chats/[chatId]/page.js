"use client";

import { useParams } from "next/navigation";
import ChatPageClient from "../../../components/ChatPageClient";

export default function ChatPageWrapper() {
  const params = useParams();
  const chatId = params?.chatId; // 👈 viene de la URL /chats/ALGO

  return <ChatPageClient chatId={chatId} />;
}

