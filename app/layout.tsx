import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legalizacion de caja menor",
  description: "Registro, evidencias y control de gastos de caja menor.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
