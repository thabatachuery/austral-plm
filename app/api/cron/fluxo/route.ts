import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase-server";
import { linxParaFluxo } from "@/lib/linx-fluxo";
import { sincronizarPedidosProducao } from "@/lib/pedidos-producao-sync";
import { sincronizarVarianteCompras } from "@/lib/variante-compras-sync";
import { dispararAvisosPre } from "@/lib/avisos-pre";
import { encadearAutomaticos, gravarMovimento, provasDaFicha, refCancelada, type FluxoEstado } from "@/lib/fluxo";

// Rotina diária (vercel.json) do Kanban de Fluxo: aplica as mesmas regras
// automáticas que o quadro aplica ao abrir — Linx (cadastro e pedido) e ficha
// (provas) —, para os cards andarem mesmo se ninguém abrir o quadro.
// O plano gratuito da Vercel só agenda uma vez por dia.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Sem CRON_SECRET a rota fica fechada: ela grava com a service role, então
  // não pode ficar aberta por falta de configuração. A Vercel manda o
  // "Bearer <CRON_SECRET>" sozinho quando a variável existe no projeto.
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const db = adminClient();
  // Pré-Produção: registra a entrega dos pedidos que saíram do Linx, mesmo
  // se ninguém abrir a aba. Falha aqui não impede o kanban.
  await sincronizarPedidosProducao(db).catch(e => console.error("cron sincronizarPedidosProducao:", e));
  // Compra x Variante: qtd / pedido / entrega de cada cor vindos do Linx.
  const vc = await sincronizarVarianteCompras(db).catch(e => ({ erro: String(e?.message || e) }));
  console.log("cron variante-compras:", JSON.stringify(vc));
  // E-mails de cobrança da pré (15 dias / 5 dias da entrega da produção).
  const avisos = await dispararAvisosPre(db).catch(e => ({ erro: String(e?.message || e) }));
  console.log("cron avisos pré:", JSON.stringify(avisos));
  const { data: linhas, error } = await db.from("controle_fluxo").select("produto_ref, etapa, ciclo, etapa_desde, fluxo_meta").in("etapa", [3, 6, 9, 10, 11, 16]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!linhas?.length) return NextResponse.json({ movidos: 0 });

  const refs = linhas.map((l: any) => l.produto_ref);
  const [{ data: fichas }, { data: prods }, linx] = await Promise.all([
    db.from("fichas_tecnicas").select("produto_ref, prova_info").in("produto_ref", refs),
    db.from("produtos").select("ref, status").in("ref", refs),
    linxParaFluxo().catch(() => null),
  ]);
  const provas: Record<string, any[]> = {};
  (fichas || []).forEach((f: any) => { (provas[f.produto_ref] ||= []).push(f.prova_info); });
  const cadastrados = new Set(linx?.cadastrados || []);

  const canceladas = new Set((prods || []).filter((p: any) => refCancelada(p.status)).map((p: any) => p.ref));

  let movidos = 0;
  for (const l of linhas as any[]) {
    if (canceladas.has(l.produto_ref)) continue;
    const e: FluxoEstado = { ref: l.produto_ref, etapa: l.etapa, ciclo: l.ciclo || 1, desde: l.etapa_desde, meta: l.fluxo_meta || {} };
    const { movimentos, estado, fotoPedidos } = encadearAutomaticos(e, provasDaFicha(provas[e.ref] || []), linx, cadastrados);
    if (fotoPedidos) await db.from("controle_fluxo").update({ fluxo_meta: estado.meta }).eq("produto_ref", e.ref).eq("etapa", 16);
    for (const m of movimentos) {
      const err = await gravarMovimento(db, e.ref, m);
      if (err) break;
      movidos++;
    }
  }
  return NextResponse.json({ movidos });
}
