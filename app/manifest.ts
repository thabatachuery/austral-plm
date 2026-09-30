import type { MetadataRoute } from "next";

// Permite instalar o PLM como app ("Adicionar à Tela de Início").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Austral PLM",
    short_name: "PLM",
    description: "Product Lifecycle Management — Austral",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
