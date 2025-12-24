// app/lib/admin.js
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function isUserAdmin(uid) {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() && snap.data()?.isAdmin === true;
  } catch {
    return false;
  }
}

export async function getUserFlags(uid) {
  if (!uid) return { isAdmin: false, banned: false };
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return { isAdmin: false, banned: false };
    const d = snap.data();
    return { isAdmin: !!d.isAdmin, banned: !!d.banned };
  } catch {
    return { isAdmin: false, banned: false };
  }
}
