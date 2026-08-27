import type { Metadata } from "next";
import "@/styles/globals.css";
import { AuthProvider } from "@/lib/auth-context";
import AvisoVersao from "@/components/ui/AvisoVersao";

export const metadata: Metadata = {
  title: "Austral PLM",
  description: "Product Lifecycle Management — Austral",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <AvisoVersao />
      </body>
    </html>
  );
}
