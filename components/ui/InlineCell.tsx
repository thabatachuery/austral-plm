"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import StatusPill from "@/components/ui/StatusPill";

type Props = {
  value: string | number;
  type: "text" | "number" | "select" | "date";
  options?: string[];
  isStatus?: boolean;
  onChange: (val: string | number) => void;
  displayFn?: (v: number) => string;
  displayEl?: React.ReactNode;
};

function fmtDate(v: string | number): string {
  const s = String(v);
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s.split("-").reverse().join("/");
  return s;
}

type Pos = { left: number; top: number; width: number; maxH: number };

export default function InlineCell({ value, type, options, isStatus, onChange, displayFn, displayEl }: Props) {
  const [editing, setEditing] = useState(false);
  const [tmp, setTmp] = useState(value);
  const [query, setQuery] = useState("");
  // Só filtra depois que a pessoa digita: abrindo o campo a lista vem inteira.
  const [digitou, setDigitou] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cancelling = useRef(false);

  const opts = options || [];

  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
  useEffect(() => { setTmp(value); }, [value]);
  // Ao abrir um select, a busca começa vazia (a lista inteira aparece) e o
  // destaque vai para o valor atual. Antes a busca vinha preenchida com o valor,
  // então a lista mostrava só ele — parecia que não dava para pesquisar.
  useEffect(() => {
    if (editing && type === "select") {
      setQuery("");
      setDigitou(false);
      const i = opts.indexOf(String(value ?? ""));
      setActiveIdx(i >= 0 ? i : 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // A lista fica num portal com posição fixa: dentro da célula ela era cortada
  // pelo scroll da tabela (overflow), e nas últimas linhas não aparecia nada.
  const recalcPos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const abaixo = window.innerHeight - r.bottom - 8;
    const acima = r.top - 8;
    const paraCima = abaixo < 180 && acima > abaixo;
    const maxH = Math.min(280, Math.max(120, paraCima ? acima : abaixo));
    const width = Math.max(r.width, 230);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - width));
    setPos({ left, top: paraCima ? Math.max(8, r.top - 4 - maxH) : r.bottom + 4, width, maxH });
  }, []);

  useEffect(() => {
    if (!editing || type !== "select") { setPos(null); return; }
    recalcPos();
    const onMove = () => recalcPos();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [editing, type, recalcPos]);

  // Mantém a opção destacada visível ao navegar com as setas
  useEffect(() => {
    if (!pos) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, pos]);

  const cancel = () => { cancelling.current = true; setTmp(value); setEditing(false); };
  const commit = (v: string | number) => {
    if (cancelling.current) { cancelling.current = false; return; }
    setEditing(false);
    if (v !== value) onChange(v);
  };
  // Campo numérico limpo/invalido mantém o valor anterior em vez de zerar.
  const parseNumOrKeep = (v: string | number) => {
    // Aceita vírgula como separador decimal: parseFloat("12,50") pararia no
    // "," e devolveria 12, perdendo os centavos.
    const n = parseFloat(String(v).replace(",", "."));
    return Number.isNaN(n) ? value : n;
  };

  if (editing) {
    const cls = "w-full text-[13px] px-2.5 py-1.5 rounded-lg bg-white border border-[var(--system-blue)] shadow-[0_0_0_3px_rgba(0,122,255,0.15)] outline-none";
    if (type === "select") {
      const norm = (s: string) => s.toLowerCase();
      const busca = query.trim();
      const filtered = digitou && busca ? opts.filter(o => norm(o).includes(norm(busca))) : opts;
      const idxDe = (o: string) => filtered.indexOf(o);
      return (
        <div ref={anchorRef} className="relative">
          <input
            ref={ref as any}
            type="text"
            className={cls}
            value={query}
            placeholder={value ? `Buscar… (atual: ${value})` : "Digite para buscar…"}
            onChange={e => { setQuery(e.target.value); setDigitou(true); setActiveIdx(0); }}
            onBlur={() => {
              // Sem digitar nada, sair do campo não mexe no valor.
              if (!digitou) { cancel(); return; }
              const exact = opts.find(o => norm(o) === norm(busca));
              if (exact) commit(exact);
              else cancel();
            }}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[activeIdx]) commit(filtered[activeIdx]);
              } else if (e.key === "Escape") cancel();
            }}
          />
          {pos && createPortal(
            <div
              ref={listRef}
              style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH, zIndex: 9999, overflowY: "auto" }}
              className="rounded-lg border border-[var(--separator)] bg-[var(--bg-primary)] shadow-lg"
            >
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => commit("")}
                className="w-full text-left px-2.5 py-2 text-[13px] text-[var(--label-tertiary)] hover:bg-[var(--bg-hover)]">— limpar</button>
              {filtered.length === 0 && (
                <div className="px-2.5 py-2 text-[13px] text-[var(--label-quaternary)]">Nenhum resultado</div>
              )}
              {filtered.map(o => {
                const i = idxDe(o);
                const atual = o === String(value ?? "");
                return (
                  <button key={o} data-idx={i} type="button" onMouseDown={e => e.preventDefault()} onClick={() => commit(o)}
                    className={`w-full text-left px-2.5 py-2 text-[13px] flex items-center gap-1.5 ${i === activeIdx ? "bg-[var(--system-blue)] text-white" : "hover:bg-[var(--bg-hover)]"}`}>
                    <span className={`w-3 shrink-0 ${atual ? "" : "opacity-0"}`}>✓</span>
                    <span className="flex-1">{o}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )}
        </div>
      );
    }
    if (type === "date") {
      return (
        <input ref={ref as any} type="date" className={cls}
          value={tmp as string} onChange={e => setTmp(e.target.value)}
          onBlur={() => commit(tmp)}
          onKeyDown={e => {
            if (e.key === "Enter") commit(tmp);
            if (e.key === "Escape") cancel();
          }} />
      );
    }
    // Campo numérico usa type="text" com teclado decimal: com type="number" o
    // navegador rejeita a vírgula e devolve "", então quem digita "12,50"
    // (a forma natural no Brasil) perdia o que digitou. A conversão é feita
    // por parseNumOrKeep, que aceita vírgula e ponto.
    return (
      <input ref={ref as any} type="text" inputMode={type === "number" ? "decimal" : undefined} className={cls}
        value={tmp} onChange={e => setTmp(e.target.value)}
        onBlur={() => commit(type === "number" ? parseNumOrKeep(tmp) : tmp)}
        onKeyDown={e => {
          if (e.key === "Enter") commit(type === "number" ? parseNumOrKeep(tmp) : tmp);
          if (e.key === "Escape") cancel();
        }} />
    );
  }

  // Select abre com um toque só: no iPad/iPhone o duplo toque não é confiável
  // (o navegador trata como zoom/seleção de texto) e o campo parecia travado.
  const abrirComClique = type === "select";

  if (isStatus && value) {
    return (
      <div onClick={abrirComClique ? () => setEditing(true) : undefined} onDoubleClick={() => setEditing(true)}
        className={`px-1 ${abrirComClique ? "cursor-pointer" : "cursor-default"}`}>
        <StatusPill status={String(value)} />
      </div>
    );
  }

  const isNum = type === "number";
  const isDate = type === "date";
  const numVal = Number(value);
  const display = isNum
    ? (numVal > 0 ? (displayFn ? displayFn(numVal) : `R$ ${numVal.toFixed(2)}`) : "—")
    : isDate
    ? (value ? fmtDate(value) : "—")
    : String(value || "—");

  return (
    <div
      onClick={abrirComClique ? () => setEditing(true) : undefined}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Editar: ${displayEl || display}`}
      title={isDate ? fmtDate(String(value || "")) : String(value || "")}
      className={`text-[13px] px-2.5 py-1.5 rounded-lg min-h-[28px] flex items-center transition-colors hover:bg-black/[0.02] focus:ring-2 focus:ring-[var(--system-blue)] outline-none ${abrirComClique ? "cursor-pointer" : "cursor-default"} ${isNum ? "justify-end tabnum" : ""} ${value ? "text-[var(--label-primary)]" : "text-[var(--label-quaternary)]"}`}
    >
      {displayEl ?? display}
    </div>
  );
}
