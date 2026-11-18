import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import AvisoVersao from "@/components/ui/AvisoVersao";

// Fonte da identidade AUSTRAL PLM by AusTab — igual em Mac e Windows.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Austral PLM",
  description: "Product Lifecycle Management — Austral",
  // Aberto pelo ícone da tela de início, o iPhone mostra o PLM em tela cheia,
  // sem a barra do Safari.
  appleWebApp: { capable: true, title: "PLM", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // usa a tela toda; o notch é compensado no CSS (safe-area)
  themeColor: "#FAF8F5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <AvisoVersao />
      </body>
    </html>
  );
}
