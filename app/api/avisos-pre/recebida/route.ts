import { NextResponse } from "next/server";
import { requireAuth, adminClient } from "@/lib/supabase-server";
import { textoPreRecebida } from "@/lib/avisos-pre";
import { enviarEmail, emailConfigurado, listaEmails } from "@/lib/email";
import { numeroPedidoNorm } from "@/lib/preproducao";

// POST /api/avisos-pre/recebida { laudoId } -> e-mail "PRÉ PRODUÇÃO RECEBIDA".
// Chamado pela tela sempre que a entrega da pré é preenchida num laudo.
// Destinatários pela estilista da ref:
//   EMAIL_PRE_RECEBIDA_<ESTILISTA> (ex.: EMAIL_PRE_RECEBIDA_THABATA, _LIVIA)
//   com cópia para EMAIL_PRE_PARA (Catiana e Marcelo).
// Estilista sem lista própria: vai só para EMAIL_PRE_PARA.
// Cada laudo gera um e-mail só (tabela avisos_pre_email, tipo "recebida").
export const dynamic = "force-dynamic";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { laudoId } = await req.json().catch(() => ({}));
  if (!laudoId) return NextResponse.json({ error: "laudoId obrigatório." }, { status: 400 });

  const falta = emailConfigurado();
  if (falta) return NextResponse.json({ enviado: false, motivo: falta });

  const db = adminClient();
  const { data: laudo } = await db.from("ficha_laudo_pp_pedidos").select("id, ficha_id, numero_pedido, data_entrega_producao, data_entrega_pre").eq("id", laudoId).maybeSingle();
  if (!laudo?.data_entrega_pre) return NextResponse.json({ enviado: false, motivo: "Laudo sem entrega da pré." });
  const { data: ficha } = await db.from("fichas_tecnicas").select("produto_ref").eq("id", laudo.ficha_id).maybeSingle();
  const ref = ficha?.produto_ref;
  if (!ref) return NextResponse.json({ enviado: false, motivo: "Ficha sem referência." });

  const numero = numeroPedidoNorm(laudo.numero_pedido);
  const [{ data: prod }, { data: ped }] = await Promise.all([
    db.from("produtos").select("estilista, fornecedor").eq("ref", ref).maybeSingle(),
    numero
      ? db.from("pedidos_producao").select("fornecedor, data_programada").eq("ref", ref).eq("numero", numero).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);
  const entrega = String(ped?.data_programada || laudo.data_entrega_producao || "").slice(0, 10);
  const fornecedor = String(ped?.fornecedor || prod?.fornecedor || "SEM FORNECEDOR").trim().toUpperCase();

  const copia = listaEmails(process.env.EMAIL_PRE_PARA);
  const daEstilista = prod?.estilista ? listaEmails(process.env[`EMAIL_PRE_RECEBIDA_${semAcento(prod.estilista)}`]) : [];
  const para = daEstilista.length ? daEstilista : copia;
  const cc = daEstilista.length ? copia.filter(e => !daEstilista.includes(e)) : [];
  if (!para.length) return NextResponse.json({ enviado: false, motivo: "Sem destinatários (EMAIL_PRE_RECEBIDA_* / EMAIL_PRE_PARA)." });

  // Trava contra envio repetido: grava antes; se já existia, não manda de novo.
  const registro = { tipo: "recebida", ref, numero: numero || `laudo-${laudo.id}`, data_entrega: entrega || "1900-01-01" };
  const { data: novo, error: errReg } = await db.from("avisos_pre_email")
    .upsert(registro, { onConflict: "tipo,ref,numero,data_entrega", ignoreDuplicates: true }).select();
  if (!errReg && !novo?.length) return NextResponse.json({ enviado: false, motivo: "Já avisado." });

  try {
    const { assunto, texto } = textoPreRecebida([{ ref, numero, entrega, fornecedor }]);
    await enviarEmail(para, assunto, texto, cc);
    return NextResponse.json({ enviado: true });
  } catch (e: any) {
    if (!errReg) await db.from("avisos_pre_email").delete().match(registro);
    return NextResponse.json({ enviado: false, motivo: e?.message || String(e) }, { status: 502 });
  }
}
