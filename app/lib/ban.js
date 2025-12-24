import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function isUserBanned(uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, "users", uid));
  return !!snap.data()?.banned;
}
