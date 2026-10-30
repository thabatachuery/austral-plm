"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ehPartido, urlsDasPartes } from "@/lib/arquivo-partes";

const TIPOS: Record<string, string> = {
  pdf: "application/pdf", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime",
  webm: "video/webm", avi: "video/x-msvideo", mkv: "video/x-matroska",
};

// Link de arquivo de envio. Arquivo pequeno é um <a> comum; arquivo que subiu
// em partes (acima do limite do Storage) é baixado parte a parte e remontado
// aqui no navegador, saindo com o nome original.
export default function LinkArquivo({ url, tamanho, nome, download, className, style, children }: {
  url: string; tamanho: number; nome: string; download?: boolean;
  className?: string; style?: CSSProperties; children: ReactNode;
}) {
  const [pct, setPct] = useState<number | null>(null);

  if (!ehPartido(url)) {
    return <a href={url} target="_blank" rel="noopener noreferrer" download={download || undefined} className={className} style={style}>{children}</a>;
  }

  const baixar = async (ev: React.MouseEvent) => {
    ev.preventDefault();
    if (pct !== null) return;
    setPct(0);
    try {
      const partes: Blob[] = [];
      const urls = urlsDasPartes(url, tamanho);
      for (let i = 0; i < urls.length; i++) {
        const r = await fetch(urls[i]);
        if (!r.ok) throw new Error(`parte ${i}: HTTP ${r.status}`);
        partes.push(await r.blob());
        setPct(Math.round(((i + 1) / urls.length) * 100));
      }
      const ext = (nome.split(".").pop() || "").toLowerCase();
      const blob = new Blob(partes, { type: TIPOS[ext] || "application/octet-stream" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (e) {
      console.error("LinkArquivo:", e);
      alert("Não foi possível baixar o arquivo. Tente de novo.");
    } finally {
      setPct(null);
    }
  };

  return (
    <a href={url} onClick={baixar} className={className} style={style} aria-busy={pct !== null}>
      {children}
      {pct !== null && <span style={{ fontSize: 12, color: "#94A3B8", whiteSpace: "nowrap" }}> baixando {pct}%</span>}
    </a>
  );
}
