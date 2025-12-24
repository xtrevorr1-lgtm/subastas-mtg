// app/privacidad/page.jsx

const PRIVACY_TEXT = `
🔒 POLÍTICA DE PRIVACIDAD

MTG Subastas Perú

Última actualización: 12/12/2025

MTG Subastas Perú (en adelante, “la Plataforma”) respeta la privacidad de sus usuarios y se compromete a proteger la información personal que se recopila a través del servicio.

Al acceder, registrarte o utilizar la Plataforma, aceptas esta Política de Privacidad.

1. Información que recopilamos

La Plataforma puede recopilar la siguiente información:

- Datos de identificación básicos:
  • Nombre visible o alias
  • UID de usuario
  • Correo electrónico (a través de Firebase Authentication)

- Información de perfil:
  • Foto de perfil (si el usuario la proporciona)

- Información de uso:
  • Subastas publicadas
  • Pujas realizadas
  • Compras directas (si aplica)
  • Mensajes y chats entre usuarios
  • Participación en subastas (como comprador o vendedor)

- Datos técnicos:
  • Fechas de creación/actualización de registros
  • Eventos necesarios para el funcionamiento del sistema

2. Cómo utilizamos la información

Utilizamos la información para:

- Permitir el funcionamiento de la Plataforma
- Gestionar cuentas de usuario y perfiles
- Mostrar subastas, información pública del vendedor y listados
- Facilitar la comunicación entre compradores y vendedores
- Mantener la seguridad del servicio y prevenir abuso
- Cumplir obligaciones legales cuando corresponda

3. Almacenamiento y servicios de terceros

Los datos se almacenan en servicios de terceros confiables, principalmente:

- Google Firebase (Authentication, Firestore, Storage)

El tratamiento de estos datos puede estar sujeto también a las políticas de Google/Firebase.

4. Pagos y transacciones

⚠️ La Plataforma NO procesa pagos, NO almacena información financiera y NO actúa como intermediario de dinero.

Los acuerdos de pago, entrega, envío y/o cualquier transacción económica se realizan fuera de la Plataforma, directamente entre comprador y vendedor.

5. Compartición de información

La Plataforma NO vende ni comparte datos personales con terceros, salvo:

- Cuando sea requerido por ley o autoridad competente
- Para el funcionamiento técnico del servicio (Firebase/Google)

6. Chats y comunicaciones

Los chats son comunicaciones entre usuarios.

La Plataforma no revisa ni monitorea activamente el contenido de los mensajes, salvo que:
- exista un reporte,
- sea necesario para moderación por seguridad,
- o exista un requerimiento legal.

7. Seguridad

Aplicamos medidas razonables de seguridad para proteger la información.
Aun así, ningún sistema es 100% seguro, por lo que el usuario acepta este riesgo inherente.

8. Conservación de datos

Conservamos los datos mientras sea necesario para:
- operar la Plataforma,
- cumplir obligaciones legales,
- y/o resolver disputas.

9. Derechos del usuario

El usuario puede solicitar:

- Acceso a su información
- Corrección/actualización de datos
- Eliminación de cuenta y datos asociados (según posibilidades técnicas y obligaciones legales)

10. Menores de edad

La Plataforma está dirigida a personas mayores de 18 años.
No recopilamos conscientemente información de menores.

11. Cambios a esta Política

Esta Política puede actualizarse.
El uso continuado de la Plataforma implica aceptación de los cambios.

12. Contacto

Para consultas o solicitudes relacionadas con esta Política:

📧 xtrevorr1@gmail.com
`;

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100 px-4 py-8">
      <div className="max-w-3xl mx-auto bg-[#050914] border border-white/10 rounded-2xl p-6">
        <h1 className="text-3xl font-bold mb-2">Política de Privacidad</h1>
        <p className="text-sm text-gray-400 mb-6">
          Última actualización: 12/12/2025
        </p>

        <div className="text-sm text-gray-200 leading-6 whitespace-pre-wrap">
          {PRIVACY_TEXT}
        </div>
      </div>
    </main>
  );
}
