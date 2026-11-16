"use client";
import { useState } from "react";

// <img> que tenta as URLs em ordem e passa pra próxima quando uma falha
// (ex. produto sem foto no site → foto de modelo → desenho).
export function ImgCandidatas({ srcs, alt, style }: { srcs: string[]; alt: string; style?: React.CSSProperties }) {
  const chave = srcs.join("|");
  const [estado, setEstado] = useState({ chave, i: 0 });
  const i = estado.chave === chave ? estado.i : 0;
  if (i >= srcs.length) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={srcs[i]} alt={alt} loading="lazy" style={style}
      onError={() => setEstado({ chave, i: i + 1 })} />
  );
}
