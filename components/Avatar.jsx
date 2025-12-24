"use client";

import { useMemo, useState } from "react";

function initialsFromName(name) {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || a.toUpperCase() || "?";
}

export default function Avatar({
  name,
  src,
  size = 36, // px
  className = "",
}) {
  const [imgOk, setImgOk] = useState(true);

  const showImg = !!src && imgOk;

  const initials = useMemo(() => initialsFromName(name), [name]);

  if (!showImg) {
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-gray-700 text-white font-semibold ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(12, size * 0.38) }}
        aria-label={name || "Usuario"}
      >
        {initials}
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={name || "Usuario"}
      width={size}
      height={size}
      className={`rounded-full object-cover ${className}`}
      onError={() => setImgOk(false)}
      referrerPolicy="no-referrer"
    />
  );
}
