// app/terminos/page.jsx

const TERMS_TEXT = `
📜 TÉRMINOS Y CONDICIONES — MTG Subastas Perú
Última actualización: 12/12/2025

Bienvenido a MTG Subastas Perú (en adelante, “la Plataforma”).

Al acceder, registrarte o utilizar la Plataforma, aceptas cumplir estos Términos y Condiciones.
Si no estás de acuerdo con alguno de ellos, no debes utilizar la Plataforma.

1. Objeto de la Plataforma
La Plataforma facilita la publicación y visualización de subastas de cartas y productos relacionados con Magic: The Gathering,
así como permitir la comunicación directa entre compradores y vendedores.
👉 La Plataforma NO actúa como intermediario de pagos, ni participa en la negociación, cobro, entrega o verificación de transacciones entre usuarios.

2. Registro de Usuarios
Para acceder a determinadas funcionalidades, el usuario debe registrarse y proporcionar información veraz, actualizada y completa.
El usuario es responsable de mantener la confidencialidad de su cuenta y de todas las actividades realizadas desde su cuenta.
La Plataforma se reserva el derecho de suspender o eliminar cuentas que incumplan estos Términos.

3. Edad Mínima y Capacidad Legal
El uso de la Plataforma está permitido únicamente a personas mayores de 18 años o con capacidad legal para contratar.
Al registrarse, el usuario declara cumplir con este requisito.

4. Subastas y Publicaciones
Los usuarios pueden publicar subastas bajo su exclusiva responsabilidad.
El vendedor es responsable de la veracidad de la información publicada (precios, descripciones, imágenes, estado del producto, número de copias, etc.).
La Plataforma no verifica la autenticidad de los productos ni la identidad real de los usuarios.

5. Pagos y Transacciones (IMPORTANTE)
⚠️ Los pagos, entregas, envíos y acuerdos se realizan fuera de la Plataforma, directamente entre comprador y vendedor.
La Plataforma:
❌ No procesa pagos
❌ No retiene dinero
❌ No actúa como intermediario
❌ No garantiza el cumplimiento de acuerdos
❌ No se hace responsable por fraudes, estafas o incumplimientos
El uso de la Plataforma es bajo responsabilidad exclusiva de los usuarios.

6. Funcionamiento Técnico y Errores
La Plataforma utiliza sistemas automatizados para subastas, temporizadores, pujas y compras directas.
No se garantiza que el servicio esté libre de errores técnicos, fallos de conexión, interrupciones o comportamientos inesperados.
La Plataforma no será responsable por resultados derivados de errores técnicos o fallos del sistema.

7. Conducta de los Usuarios
Prohibido: contenido falso/ilegal, estafas, suplantación, manipulación fraudulenta, acoso/hostigamiento, bots/scripts para alterar el servicio.
El incumplimiento puede resultar en eliminación de contenido, suspensión temporal o eliminación permanente.

8. Moderación y Administración
La Plataforma puede eliminar subastas que infrinjan estos Términos, limitar/suspender/cerrar cuentas,
e intervenir ante irregularidades, errores evidentes o denuncias fundadas, sin previo aviso cuando sea necesario para proteger a la comunidad.

9. Propiedad del Contenido
El contenido publicado por los usuarios sigue siendo propiedad del usuario.
Al publicarlo, el usuario otorga a la Plataforma una licencia no exclusiva para mostrarlo dentro del servicio.

10. Disponibilidad del Servicio
La Plataforma se ofrece “tal cual” y puede estar en mantenimiento, cambiar funcionalidades o ser suspendida.
No se garantiza disponibilidad continua ni ausencia de fallos.

11. Limitación de Responsabilidad
La Plataforma NO será responsable por pérdidas económicas, disputas entre usuarios, daños derivados del uso del servicio o contenido de terceros.
El uso es bajo tu propio riesgo.

12. Terminación del Servicio
La Plataforma puede suspender/modificar/finalizar el servicio y/o eliminar cuentas en cualquier momento.

13. Modificaciones de los Términos
Estos Términos pueden modificarse. El uso continuado implica aceptación de cambios.

14. Legislación Aplicable
Se rigen por las leyes de la República del Perú.

15. Contacto
📧 xtrevorr1@gmail.com
`;

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-[#02060b] text-gray-100 px-4 py-8">
      <div className="max-w-3xl mx-auto bg-[#050914] border border-white/10 rounded-2xl p-6">
        <h1 className="text-3xl font-bold mb-2">Términos y Condiciones</h1>
        <p className="text-sm text-gray-400 mb-6">
          Última actualización: 12/12/2025
        </p>

        <div className="text-sm text-gray-200 leading-6 whitespace-pre-wrap">
          {TERMS_TEXT}
        </div>
      </div>
    </main>
  );
}
