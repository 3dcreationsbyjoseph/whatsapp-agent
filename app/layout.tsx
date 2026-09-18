import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WhatsApp Agent",
  description: "Agente IA de atención al cliente por WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
