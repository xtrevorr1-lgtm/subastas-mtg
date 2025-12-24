// app/lib/chatUtils-helpers.js

// Genera un ID de chat único y ordenado para dos usuarios
export function getChatIdForUsers(uidA, uidB) {
  if (!uidA || !uidB) throw new Error("getChatIdForUsers: faltan UIDs");
  const [a, b] = [uidA, uidB].sort();
  return `${a}_${b}`;
}

// app/lib/chatUtils-helpers.js

export function buildAutoWinMessage(template, data) {
  const montoNum = Number(data.monto ?? 0);

  const cantidadNum = Number(data.cantidad ?? 0);
  let qtySuffix = "";
  if (Number.isFinite(cantidadNum) && cantidadNum > 0) {
    qtySuffix = cantidadNum === 1 ? " (1 copia)" : ` (${cantidadNum} copias)`;
  }

  const fallback = `¡Felicitaciones! Ganaste la subasta "${
    data.titulo
  }"${qtySuffix} por ${data.moneda} ${montoNum.toFixed(
    2
  )}. Puedes comunicarte al ${
    data.telefono || "contacto no indicado"
  }.`; 

  const base = template && template.trim().length > 0 ? template : fallback;

  return base
    .replace(/{{titulo}}/g, data.titulo ?? "")
    .replace(
      /{{monto}}/g,
      data.monto != null ? Number(data.monto).toFixed(2) : ""
    )
    .replace(/{{moneda}}/g, data.moneda ?? "S/")
    .replace(/{{telefono}}/g, data.telefono ?? "")
    .replace(
      /{{diasLimite}}/g,
      data.diasLimite != null ? String(data.diasLimite) : ""
    )
    .replace(/{{idSubasta}}/g, data.idSubasta ?? "")
    .replace(/{{fechaCierre}}/g, data.fechaCierre ?? "")
    .replace(
      /{{cantidad}}/g,
      data.cantidad != null ? String(data.cantidad) : ""
    );
}




