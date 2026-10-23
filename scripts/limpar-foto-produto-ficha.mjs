// Tira a foto do produto (frente/costas da aba Liberação) das fichas das refs
// passadas, em todas as temporadas — a ficha passa a mostrar a do catálogo
// Teceo (app/api/teceo/foto). Imprime as URLs antigas antes, pra dar pra
// voltar; o arquivo continua no Storage.
//
//   node scripts/limpar-foto-produto-ficha.mjs 21060345 21060350          (só mostra)
//   node scripts/limpar-foto-produto-ficha.mjs 21060345 21060350 --gravar
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => l.includes("="))
  .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
// Mesma limpeza da URL que o import-skus-linx faz (barra / "/rest/v1" no fim).
const SUPABASE_URL = String(env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const sb = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const gravar = process.argv.includes("--gravar");
const refs = process.argv.slice(2).filter(a => !a.startsWith("--"));

const { data, error } = await sb.from("fichas_tecnicas").select("id, produto_ref, colecao, imagem_frente, imagem_costas").in("produto_ref", refs);
if (error) throw error;
for (const f of data) console.log(f.produto_ref, f.colecao || "(sem temporada)", "id", f.id, "| frente:", f.imagem_frente || "—", "| costas:", f.imagem_costas || "—");
const faltando = refs.filter(r => !data.some(f => f.produto_ref === r));
if (faltando.length) console.log("Sem ficha:", faltando.join(", "));

if (gravar) {
  const ids = data.filter(f => f.imagem_frente || f.imagem_costas).map(f => f.id);
  if (ids.length) {
    const { error: e } = await sb.from("fichas_tecnicas").update({ imagem_frente: "", imagem_costas: "" }).in("id", ids);
    if (e) throw e;
  }
  console.log(`Foto própria retirada de ${ids.length} ficha(s).`);
}
