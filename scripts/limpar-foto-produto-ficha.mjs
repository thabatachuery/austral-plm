// Tira a foto do produto (frente/costas da aba Liberação) das fichas das refs
// passadas, em todas as temporadas — a ficha passa a mostrar a do catálogo
// Teceo (app/api/teceo/foto). Imprime as URLs antigas antes, pra dar pra
// voltar; o arquivo continua no Storage.
//
//   node scripts/limpar-foto-produto-ficha.mjs 21060345 21060350          (só mostra)
//   node scripts/limpar-foto-produto-ficha.mjs 21060345 21060350 --gravar
//   ... --gravar --so-frente   (ref que no catálogo só tem a foto da frente:
//                               mantém a costas da ficha)
//   node scripts/limpar-foto-produto-ficha.mjs --teceo [--gravar]
//                              (todas as refs que estão no catálogo Teceo)
//
// Com --gravar, as URLs antigas vão antes pra
// scripts/backups/fotos-produto-<data-hora>.json.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => l.includes("="))
  .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
// Mesma limpeza da URL que o import-skus-linx faz (barra / "/rest/v1" no fim).
const SUPABASE_URL = String(env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const sb = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const gravar = process.argv.includes("--gravar");
const soFrente = process.argv.includes("--so-frente");
let refs = process.argv.slice(2).filter(a => !a.startsWith("--"));

// Mesmo catálogo e cabeçalhos de app/api/teceo/foto/route.ts.
async function refsDoTeceo() {
  const ID = "0e552090-11df-423b-8c9a-00ce255a268e";
  const H = { Accept: "application/json", "x-public-id": ID, "x-team-id": "423cd1e1-9be0-4dc3-9171-a0176c47e6ea", "x-brand-id": "729a96b8-7200-466d-a407-8423c541b6d7" };
  const codigos = new Set();
  for (let skip = 0; skip < 5000; skip += 100) {
    const r = await fetch(`https://api.app.teceo.co/catalogs/${ID}/products?active=true&isAdminSeller=false&limit=100&skip=${skip}&order%5Bposition%5D=ASC`, { headers: H });
    if (!r.ok) throw new Error(`Teceo respondeu ${r.status}`);
    const pagina = await r.json();
    for (const { item } of pagina) if (item?.code && item.medias?.length) codigos.add(String(item.code).trim());
    if (pagina.length < 100) break;
  }
  return [...codigos];
}
if (process.argv.includes("--teceo")) refs = await refsDoTeceo();

const { data, error } = await sb.from("fichas_tecnicas").select("id, produto_ref, colecao, imagem_frente, imagem_costas").in("produto_ref", refs);
if (error) throw error;
for (const f of data) if (f.imagem_frente || f.imagem_costas) console.log(f.produto_ref, f.colecao || "(sem temporada)", "id", f.id, "| frente:", f.imagem_frente || "—", "| costas:", f.imagem_costas || "—");
const faltando = refs.filter(r => !data.some(f => f.produto_ref === r));
console.log(`${refs.length} ref(s), ${data.length} ficha(s), ${data.filter(f => f.imagem_frente || f.imagem_costas).length} com foto própria.`);
if (faltando.length) console.log("Sem ficha:", faltando.join(", "));

if (gravar) {
  const alvo = data.filter(f => f.imagem_frente || (!soFrente && f.imagem_costas));
  const ids = alvo.map(f => f.id);
  if (ids.length) {
    fs.mkdirSync("scripts/backups", { recursive: true });
    const arq = `scripts/backups/fotos-produto-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
    fs.writeFileSync(arq, JSON.stringify(alvo, null, 2));
    console.log("Backup:", arq);
    const { error: e } = await sb.from("fichas_tecnicas").update(soFrente ? { imagem_frente: "" } : { imagem_frente: "", imagem_costas: "" }).in("id", ids);
    if (e) throw e;
  }
  console.log(`Foto própria retirada de ${ids.length} ficha(s).`);
}
