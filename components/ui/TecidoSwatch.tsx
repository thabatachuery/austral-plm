"use client";

/**
 * Foto do tecido (cadastro) sobreposta ao canto da imagem do produto, para ler
 * o tecido junto do desenho técnico sem gastar espaço do card.
 * O container precisa ter position:relative.
 */
export default function TecidoSwatch({ url, nome, size = 48 }: { url?: string; nome?: string; size?: number }) {
  if (!url) return null;
  return (
    <div style={{ position: "absolute", left: 6, bottom: 6, zIndex: 2, pointerEvents: "none" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={nome ? `Tecido ${nome}` : "Tecido"}
        title={nome || undefined}
        style={{
          width: size, height: size, objectFit: "cover",
          borderRadius: 6, border: "2px solid #fff",
          boxShadow: "0 1px 5px rgba(0,0,0,0.28)",
          display: "block", background: "#fff",
        }}
      />
    </div>
  );
}
