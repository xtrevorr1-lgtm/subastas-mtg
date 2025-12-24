import "./globals.css";
import AutoPublisher from "../components/AutoPublisher";
import AppHeader from "../components/AppHeader";
import TermsGuard from "./components/TermsGuard";
import BannedGate from "../components/BannedGate";

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-black text-white">
        <AutoPublisher />
        <AppHeader />

        {/* Gates globales */}
        <BannedGate>
          <TermsGuard />
          <main>{children}</main>
        </BannedGate>
      </body>
    </html>
  );
}
