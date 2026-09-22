"use client";
import { useEffect, useRef, useState } from "react";
import FichaPDF from "@/components/ficha/FichaPDF";
import { carregarFichaParaPDF } from "@/lib/ficha-export";

type Props = {
  rows: any[];
  sections: { ficha: boolean; estamparia: boolean; liberacao: boolean; graduacao: boolean };
  onDone: () => void;
};

function nomeArquivo(ref: string) {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${ref} - ${dd}-${mm}-${d.getFullYear()}`;
}

// Imprimir antes das imagens carregarem gera PDF com quadro em branco no lugar
// da foto. O doExport da modal resolve com 300ms fixos, que bastam para uma
// ficha já aberta (imagens em cache) — no lote elas são baixadas na hora, então
// aqui se espera de fato, com teto para não travar se alguma imagem falhar.
function esperarImagens(el: HTMLElement | null, tetoMs = 8000): Promise<void> {
  if (!el) return Promise.resolve();
  const imgs = Array.from(el.querySelectorAll("img"));
  const pendentes = imgs.filter(i => !i.complete);
  if (!pendentes.length) return Promise.resolve();
  return new Promise(resolve => {
    let faltam = pendentes.length;
    const fim = () => { if (--faltam <= 0) resolve(); };
    pendentes.forEach(i => { i.addEventListener("load", fim, { once: true }); i.addEventListener("error", fim, { once: true }); });
    setTimeout(resolve, tetoMs);
  });
}

export default function FichaExportLote({ rows, sections, onDone }: Props) {
  const [fichas, setFichas] = useState<any[]>([]);
  const [carregadas, setCarregadas] = useState(0);
  const [erros, setErros] = useState<string[]>([]);
  const [idx, setIdx] = useState(-1); // -1 = ainda carregando
  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelado = useRef(false);

  // ── Fase 1: carrega os dados de todas as fichas ──
  // Uma de cada vez: são 8 consultas por ficha, e disparar tudo de uma vez em
  // 15 SKUs derruba o limite de conexões do Supabase.
  useEffect(() => {
    (async () => {
      const out: any[] = [];
      const falhas: string[] = [];
      for (const row of rows) {
        if (cancelado.current) return;
        try { out.push(await carregarFichaParaPDF(row)); }
        catch (e: any) { falhas.push(`${row.ref}: ${e?.message || "erro ao carregar"}`); }
        setCarregadas(c => c + 1);
      }
      if (cancelado.current) return;
      setFichas(out);
      setErros(falhas);
      setIdx(out.length ? 0 : -2); // -2 = nada a imprimir
    })();
    return () => { cancelado.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fase 2: imprime uma por vez, cada uma com seu próprio nome de arquivo ──
  useEffect(() => {
    if (idx < 0 || idx >= fichas.length) return;
    let vivo = true;
    const tituloAnterior = document.title;

    const seguinte = () => {
      window.removeEventListener("afterprint", seguinte);
      document.title = tituloAnterior;
      document.body.classList.remove("printing-pdf");
      // Um respiro entre os diálogos: sem ele, o Chrome às vezes engole a
      // segunda chamada de print() disparada no mesmo quadro.
      setTimeout(() => { if (vivo) setIdx(i => i + 1); }, 250);
    };

    (async () => {
      await esperarImagens(overlayRef.current);
      if (!vivo) return;
      document.title = nomeArquivo(fichas[idx].row.ref);
      document.body.classList.add("printing-pdf");
      window.addEventListener("afterprint", seguinte);
      window.print();
    })();

    return () => {
      vivo = false;
      window.removeEventListener("afterprint", seguinte);
      document.title = tituloAnterior;
      document.body.classList.remove("printing-pdf");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, fichas]);

  // ── Fim ──
  useEffect(() => {
    if (idx === -2 || (fichas.length > 0 && idx >= fichas.length)) {
      document.body.classList.remove("printing-pdf");
      onDone();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, fichas.length]);

  const emImpressao = idx >= 0 && idx < fichas.length;

  return (
    <>
      {/* O overlay precisa estar no DOM para o print enxergar — o CSS de
          .printing-pdf é que esconde o resto da tela. */}
      {emImpressao && (
        <div className="print-overlay" ref={overlayRef}>
          <FichaPDF {...(fichas[idx] as any)} sections={sections} />
        </div>
      )}

      <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[6px] no-print">
        <div role="dialog" aria-modal="true" className="bg-[var(--bg-primary)] rounded-2xl w-full max-w-[420px] shadow-[0_24px_80px_rgba(0,0,0,0.3)] p-6">
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 10 }}>
            {emImpressao ? "Salvando as fichas" : "Preparando as fichas"}
          </h3>

          {!emImpressao && idx < 0 && (
            <>
              <p className="text-[13px] text-[var(--label-secondary)]">Carregando {carregadas} de {rows.length}...</p>
              <div className="h-1.5 bg-[var(--bg-secondary)] rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-[var(--system-blue)] transition-all" style={{ width: `${Math.round((carregadas / Math.max(1, rows.length)) * 100)}%` }} />
              </div>
            </>
          )}

          {emImpressao && (
            <>
              <p className="text-[13px] text-[var(--label-secondary)]">
                Ficha {idx + 1} de {fichas.length} — <strong>{fichas[idx].row.ref}</strong>
              </p>
              <p className="text-[12px] text-[var(--label-tertiary)] mt-2">
                Vai abrir uma caixa de salvar por referência. O nome já vem pronto — é só confirmar.
              </p>
              <div className="h-1.5 bg-[var(--bg-secondary)] rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-[var(--system-blue)] transition-all" style={{ width: `${Math.round(((idx + 1) / fichas.length) * 100)}%` }} />
              </div>
            </>
          )}

          {erros.length > 0 && (
            <p className="text-[12px] text-[var(--system-red)] mt-3">
              {erros.length} ficha(s) não carregaram: {erros.slice(0, 3).join("; ")}
            </p>
          )}

          <div className="flex justify-end mt-5">
            <button onClick={() => { cancelado.current = true; document.body.classList.remove("printing-pdf"); onDone(); }} className="apple-btn-secondary">
              {emImpressao ? "Parar" : "Cancelar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
