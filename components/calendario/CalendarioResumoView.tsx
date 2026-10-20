"use client";

import { useState, useMemo } from "react";
import type { CalendarioTarefa } from "@/lib/db";
import { getColecaoColor } from "@/lib/collection-colors";
import { parseISO, isSameDay, toISO } from "@/lib/calendario-utils";

const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MAX_VISIVEL = 3;

type Props = {
  tarefas: CalendarioTarefa[];
  loading: boolean;
  onEditTask: (t: CalendarioTarefa) => void;
};

export default function CalendarioResumoView({ tarefas, loading, onEditTask }: Props) {
  const hoje = new Date();
  const [cursor, setCursor] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1));

  const dias = useMemo(() => {
    const primeiroDoMes = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const ultimoDoMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

    const gridStart = new Date(primeiroDoMes);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // volta até Domingo
    const gridEnd = new Date(ultimoDoMes);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay())); // avança até Sábado

    const out: Date[] = [];
    const d = new Date(gridStart);
    while (d <= gridEnd) { out.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return out;
  }, [cursor]);

  const tarefasPorDia = useMemo(() => {
    const m = new Map<string, CalendarioTarefa[]>();
    for (const dia of dias) {
      const key = toISO(dia);
      const doDia = tarefas.filter(t => {
        const ini = parseISO(t.data_inicio);
        const fim = parseISO(t.data_fim);
        return dia >= ini && dia <= fim;
      }).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio) || a.colecao.localeCompare(b.colecao));
      m.set(key, doDia);
    }
    return m;
  }, [dias, tarefas]);

  // Dias com mais de uma tarefa — é exatamente a sobreposição que se quer destacar.
  // Só conta dias do mês exibido (a grade também mostra alguns dias do mês
  // anterior/seguinte só para completar as semanas).
  const diasComSobreposicao = useMemo(() => {
    return dias
      .filter(d => d.getMonth() === cursor.getMonth() && (tarefasPorDia.get(toISO(d))?.length || 0) >= 2)
      .map(d => d.getDate());
  }, [dias, tarefasPorDia, cursor]);

  const resumoSobreposicao = useMemo(() => {
    const n = diasComSobreposicao.length;
    if (n === 0) return "Sem sobreposições neste mês";
    if (n <= 6) return `Dia${n > 1 ? "s" : ""} ${diasComSobreposicao.join(", ")} ${n > 1 ? "têm" : "tem"} mais de um compromisso`;
    return `${n} dias neste mês têm mais de um compromisso no mesmo dia`;
  }, [diasComSobreposicao]);

  const irParaHoje = () => setCursor(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const mesAnterior = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const proximoMes = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1));

  if (loading) {
    return <div className="plm-loading" style={{ padding: "48px 0" }}><div className="plm-loading-spinner" /></div>;
  }

  return (
    <div>
      {/* Navegação de mês */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <button onClick={irParaHoje} className="apple-btn-secondary text-[13px] flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Hoje
        </button>
        <div className="flex items-center gap-2">
          <button onClick={mesAnterior} className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--separator)] hover:bg-[var(--bg-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="text-[16px] font-bold min-w-[160px] text-center">{MESES[cursor.getMonth()]} {cursor.getFullYear()}</div>
          <button onClick={proximoMes} className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--separator)] hover:bg-[var(--bg-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div className="text-[12px] text-[var(--label-tertiary)]">
          {resumoSobreposicao}
        </div>
      </div>

      {/* Grid mensal */}
      <div className="border border-[var(--separator)] rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 bg-[var(--bg-secondary)] border-b border-[var(--separator)]">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="px-3 py-2 text-[12px] font-semibold text-[var(--label-secondary)] truncate">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((dia, idx) => {
            const key = toISO(dia);
            const doDia = tarefasPorDia.get(key) || [];
            const foraDoMes = dia.getMonth() !== cursor.getMonth();
            const ehHoje = isSameDay(dia, hoje);
            const mostrarMes = dia.getDate() === 1 || idx === 0;
            const temSobreposicao = doDia.length >= 2;

            return (
              <div
                key={key}
                className="border-r border-b border-[var(--separator)] min-h-[110px] p-2"
                style={{ background: foraDoMes ? "var(--bg-secondary)" : undefined }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  {ehHoje ? (
                    <span className="w-5 h-5 rounded-full bg-[var(--system-blue)] text-white text-[11px] font-bold flex items-center justify-center">
                      {dia.getDate()}
                    </span>
                  ) : (
                    <span className={`text-[12px] font-semibold ${foraDoMes ? "text-[var(--label-quaternary)]" : "text-[var(--label-primary)]"}`}>
                      {dia.getDate()}
                    </span>
                  )}
                  {mostrarMes && <span className="text-[11px] text-[var(--label-tertiary)]">{MESES_ABREV[dia.getMonth()]}</span>}
                  {temSobreposicao && (
                    <span
                      title={`${doDia.length} tarefas neste dia`}
                      className="ml-auto w-4 h-4 rounded-full bg-[#ff9500] text-white text-[9px] font-bold flex items-center justify-center"
                    >
                      {doDia.length}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  {doDia.slice(0, MAX_VISIVEL).map(t => {
                    const cor = getColecaoColor(t.colecao);
                    return (
                      <button
                        key={t.id}
                        onClick={() => onEditTask(t)}
                        title={`${t.tarefa} (${t.colecao})`}
                        className="text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate w-full hover:opacity-80 transition-opacity"
                        style={{ background: cor.bar, color: cor.text }}
                      >
                        {t.tarefa}
                      </button>
                    );
                  })}
                  {doDia.length > MAX_VISIVEL && (
                    <div className="text-[10px] text-[var(--label-tertiary)] font-medium px-1.5">
                      +{doDia.length - MAX_VISIVEL} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
