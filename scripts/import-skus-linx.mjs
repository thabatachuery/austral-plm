// Cria linhas de Desenvolvimento a partir do cadastro de produtos do Linx.
//
// Uso:
//   node scripts/import-skus-linx.mjs 22.06.03.52 21.06.03.46 ...   (simulação)
//   node scripts/import-skus-linx.mjs --apply 22.06.03.52 ...       (grava)
//
// A referência pode vir pontuada (22.06.03.52) ou não (22060352) — no Linx e no
// PLM ela é sempre sem pontos. Referência que já existe no PLM é MANTIDA como
// está: nada é sobrescrito e nada é duplicado (é o caso dos clássicos, que já
// entraram no sistema em outra temporada).
//
// Lê as credenciais de .env.local (LINX_API_*, NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY). A service role ignora RLS — script de servidor.

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const linha of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

// A URL do Supabase pode estar gravada com o sufixo /rest/v1 (é o endereço que
// o painel mostra); o supabase-js quer só a origem e monta o caminho sozinho.
const SUPABASE_URL = String(env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const LINX_URL = String(env.LINX_API_BASE_URL || "https://bi.austral.com.br/api/linx").replace(/\/+$/, "");

for (const [nome, valor] of [["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL], ["SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY], ["LINX_API_KEY", env.LINX_API_KEY]]) {
  if (!valor) { console.error(`Falta ${nome} em .env.local`); process.exit(1); }
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const refs = args.filter(a => !a.startsWith("--")).map(a => a.replace(/\D/g, ""));
if (!refs.length) { console.error("Informe ao menos uma referência."); process.exit(1); }

const sb = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const linx = async path => {
  const res = await fetch(LINX_URL + path, { headers: { "X-API-Key": env.LINX_API_KEY } });
  if (!res.ok) throw new Error(`Linx ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

// O PLM guarda os cadastros em MAIÚSCULAS; o Linx mistura ("V27 - Verao 27").
const up = v => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

const [produtosLinx, estoque] = await Promise.all([
  linx("/produtos"),
  // A grade não vem no /produtos: sai do estoque. Referência nunca produzida
  // não tem estoque, e aí a grade fica em branco pra ser escolhida na tela.
  linx("/estoque").catch(() => []),
]);

const gradePorRef = {};
for (const e of estoque) {
  const pai = String(e.produto_pai).trim();
  if (!gradePorRef[pai] && e.grade) gradePorRef[pai] = up(e.grade);
}

const { data: existentes, error: errBusca } = await sb.from("produtos").select("ref, descricao").in("ref", refs);
if (errBusca) { console.error("Erro ao consultar o PLM:", errBusca.message); process.exit(1); }
const jaTem = new Set((existentes || []).map(p => p.ref));

const novos = [];
const semLinx = [];
for (const ref of refs) {
  if (jaTem.has(ref)) continue;
  const p = produtosLinx.find(x => String(x.produto_pai).trim() === ref);
  if (!p) { semLinx.push(ref); continue; }
  novos.push({
    ref,
    descricao: up(p.descricao),
    // Coleção descritiva quando o Linx tem ("V27 - VERAO 27"); senão o código.
    colecao: up(p.colecao_nome || p.colecao),
    grupo: up(p.grupo),
    subgrupo: up(p.subgrupo),
    categoria: up(p.categoria),
    subcategoria: up(p.subcategoria),
    linha: up(p.linha),
    // O Linx só tem "fabricante" — é o que o PLM chama de fornecedor.
    fornecedor: up(p.fabricante),
    grade: gradePorRef[ref] || "",
    status: "DESENVOLVIMENTO",
  });
}

console.log(`Referências pedidas: ${refs.length} · já no PLM: ${jaTem.size} · a criar: ${novos.length}${semLinx.length ? ` · sem cadastro no Linx: ${semLinx.length}` : ""}\n`);
for (const p of (existentes || [])) console.log(`  = ${p.ref}  ${p.descricao}  (já existe — mantida)`);
for (const r of semLinx) console.log(`  ! ${r}  NÃO ENCONTRADA no cadastro do Linx`);
for (const p of novos) console.log(`  + ${p.ref}  ${p.descricao}  | ${p.colecao} | ${p.subgrupo} | ${p.categoria}/${p.subcategoria} | ${p.linha} | ${p.fornecedor} | grade: ${p.grade || "—"}`);

if (!novos.length) { console.log("\nNada a criar."); process.exit(0); }
if (!apply) { console.log("\nSimulação — rode de novo com --apply para gravar."); process.exit(0); }

const { data, error } = await sb.from("produtos").insert(novos).select("id, ref");
if (error) { console.error("\nErro ao inserir:", error.message); process.exit(1); }
console.log(`\n${data.length} linha(s) criada(s) em Desenvolvimento: ${data.map(d => d.ref).join(", ")}`);
