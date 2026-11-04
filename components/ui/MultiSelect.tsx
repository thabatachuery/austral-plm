"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// Filtro de múltipla escolha: abre uma lista com caixinhas para marcar uma ou
// várias opções (ex.: dois ou três fornecedores ao mesmo tempo). Nada marcado
// = "Todos". Visual de select do design system, destacado quando há filtro.

type Props = {
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
  todos?: string;            // texto quando nada está marcado ("Todos", "Todas"...)
  className?: string;
  id?: string;
  rotulo?: (v: string) => string; // texto exibido para cada opção
};

export default function MultiSelect({ value, options, onChange, todos = "Todos", className = "", id, rotulo }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  // A lista flutua por cima de tudo (position: fixed) — os painéis de filtro
  // cortam o que passa da borda deles.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    if (!aberto) return;
    const medir = () => {
      const r = botaoRef.current?.getBoundingClientRect();
      if (!r) return;
      const largura = Math.max(r.width, 200);
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - largura - 8)), width: r.width });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => { window.removeEventListener("resize", medir); window.removeEventListener("scroll", medir, true); };
  }, [aberto]);
  const txt = (v: string) => (rotulo ? rotulo(v) : v);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  useEffect(() => { if (!aberto) setBusca(""); }, [aberto]);

  const marcados = new Set(value);
  // Marcado que sumiu das opções (ex.: outro filtro tirou) continua visível para dar pra desmarcar.
  const todas = useMemo(() => Array.from(new Set([...options, ...value])), [options, value]);
  const termo = busca.trim().toUpperCase();
  const visiveis = termo ? todas.filter(o => txt(o).toUpperCase().includes(termo)) : todas;

  const alternar = (o: string) => onChange(marcados.has(o) ? value.filter(v => v !== o) : [...value, o]);
  const ativo = value.length > 0;
  const resumo = !ativo ? todos : value.length === 1 ? txt(value[0]) : `${value.length} selecionados`;

  return (
    <div ref={ref} className="relative">
      <button
        ref={botaoRef}
        id={id}
        type="button"
        onClick={() => setAberto(a => !a)}
        title={ativo ? value.map(txt).join(", ") : undefined}
        className={`apple-select w-full text-left truncate ${ativo ? "!border-[var(--system-blue)] !bg-blue-50/60 text-[var(--system-blue)] font-semibold" : ""} ${className}`}
      >
        {resumo}
      </button>
      {aberto && pos && (
        <div className="fixed z-[10000] apple-card shadow-xl p-2 text-[12px] bg-[var(--bg-primary)]" style={{ top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 200), width: "max-content", maxWidth: 320 }}>
          {todas.length > 8 && (
            <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." className="apple-input w-full !py-1 text-[12px] mb-1.5" />
          )}
          <div className="flex items-center justify-between px-1.5 pb-1.5 mb-1 border-b border-[var(--separator)]">
            <button type="button" onClick={() => onChange(Array.from(new Set([...value, ...visiveis])))} className="text-[var(--system-blue)] font-medium">Marcar {termo ? "visíveis" : "todos"}</button>
            <button type="button" onClick={() => onChange([])} disabled={!ativo} className="text-[var(--label-tertiary)] font-medium disabled:opacity-40">Limpar</button>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {visiveis.length === 0 && <div className="px-2 py-1.5 text-[var(--label-tertiary)]">Nada encontrado</div>}
            {visiveis.map(o => (
              <label key={o} className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-[var(--bg-secondary)] cursor-pointer select-none">
                <input type="checkbox" checked={marcados.has(o)} onChange={() => alternar(o)} className="w-3.5 h-3.5 accent-[var(--system-blue)] shrink-0" />
                <span className="truncate">{txt(o)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Filtros salvos antes eram um valor só (string); agora são listas.
export function normalizarFiltros(fl: any): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!fl || typeof fl !== "object") return out;
  for (const [k, v] of Object.entries(fl)) {
    const lista = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
    if (lista.length) out[k] = lista;
  }
  return out;
}

// Atualiza uma chave do mapa de filtros, apagando quando fica vazia.
export function comFiltro(fl: Record<string, string[]>, k: string, v: string[]): Record<string, string[]> {
  const n = { ...fl };
  if (v.length) n[k] = v; else delete n[k];
  return n;
}
