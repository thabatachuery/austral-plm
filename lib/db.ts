import { getSupabase } from "./supabase";
const sb = () => getSupabase();

// ── Cache simples em memória com TTL de 5 minutos ─────────────────────────
const _cache: Record<string, { data: any; exp: number }> = {};
const TTL = 5 * 60 * 1000;
function fromCache<T>(key: string): T | null {
  const c = _cache[key];
  return c && Date.now() < c.exp ? c.data : null;
}
function toCache(key: string, data: any) {
  _cache[key] = { data, exp: Date.now() + TTL };
}
export function invalidateCache(key?: string) {
  if (key) delete _cache[key]; else Object.keys(_cache).forEach(k => delete _cache[k]);
}

// A API do Supabase devolve no máximo 1000 linhas por requisição, sem avisar
// que cortou. Toda leitura de tabela inteira precisa paginar — sem isso o dado
// some silenciosamente (foi o que escondeu os tecidos de P a Z, incluindo o
// "TABHAE1054 - SPINNING PLUS", do campo de seleção).
const PAGINA = 1000;
async function selectAll<T = any>(
  build: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: any }>,
  rotulo: string,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await build(de, de + PAGINA - 1);
    if (error) { console.error(`${rotulo}:`, error); break; }
    const lote = data || [];
    todas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todas;
}

// ══ CADASTROS ══
export async function fetchCadastros() {
  const cached = fromCache<Record<string, string[]>>("cadastros");
  if (cached) return cached;
  const data = await selectAll((de, ate) => sb().from("cadastros").select("*").order("nome").range(de, ate), "fetchCadastros");
  const g: Record<string, string[]> = {};
  data.forEach((i: any) => { if (!g[i.tabela]) g[i.tabela] = []; g[i.tabela].push(i.nome); });
  toCache("cadastros", g);
  return g;
}
export async function addCadastro(tabela: string, nome: string) {
  const { error } = await sb().from("cadastros").insert({ tabela, nome });
  if (error) console.error("addCadastro:", error);
  invalidateCache("cadastros");
}
export async function removeCadastro(tabela: string, nome: string) {
  const { error } = await sb().from("cadastros").delete().eq("tabela", tabela).eq("nome", nome);
  if (error) console.error("removeCadastro:", error);
  invalidateCache("cadastros");
}
// Insere vários itens de uma vez num cadastro (usado na importação do Linx).
export async function addCadastrosBulk(tabela: string, nomes: string[]): Promise<string | null> {
  if (!nomes.length) return null;
  const rows = nomes.map(nome => ({ tabela, nome }));
  const { error } = await sb().from("cadastros").insert(rows);
  if (error) { console.error("addCadastrosBulk:", error); return error.message || "Erro ao importar"; }
  invalidateCache("cadastros");
  return null;
}

// ══ TECIDOS ══
export async function fetchTecidos() {
  const cached = fromCache<any[]>("tecidos");
  if (cached) return cached;
  const data = await selectAll((de, ate) => sb().from("tecidos").select("*").order("nome").range(de, ate), "fetchTecidos");
  const result = data.map((t: any) => ({
    nome: t.nome, forn: t.fornecedor, comp: t.composicao, preco: t.preco || "",
    // Dados técnicos (podem estar vazios até alguém preencher no cadastro)
    gramatura: t.gramatura ?? "", oz: t.oz ?? "", largura: t.largura ?? "",
    enc_largura: t.encolhimento_largura ?? "", enc_altura: t.encolhimento_altura ?? "",
    rendimento: t.rendimento ?? "", imagem: t.imagem ?? "",
  }));
  toCache("tecidos", result);
  return result;
}

// Aceita "1,60" (vírgula) e devolve null quando vazio — os campos técnicos
// são opcionais e NUMERIC no banco.
const numOuNull = (v: any) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(n) ? null : n;
};

export type TecidoTecnico = {
  gramatura?: any; oz?: any; largura?: any; enc_largura?: any; enc_altura?: any; rendimento?: any;
};

export async function addTecido(t: { nome: string; forn: string; comp: string; preco: string; imagem?: string } & TecidoTecnico) {
  const { error } = await sb().from("tecidos").insert({
    nome: t.nome, fornecedor: t.forn, composicao: t.comp, preco: numOuNull(t.preco),
    gramatura: numOuNull(t.gramatura), oz: numOuNull(t.oz), largura: numOuNull(t.largura),
    encolhimento_largura: numOuNull(t.enc_largura), encolhimento_altura: numOuNull(t.enc_altura),
    rendimento: numOuNull(t.rendimento), imagem: t.imagem || "",
  });
  if (error) console.error("addTecido:", error);
  invalidateCache("tecidos");
}

// Atualiza campos do tecido pelo nome (chave única). Só envia o que veio.
export async function updateTecido(nome: string, patch: { forn?: string; comp?: string; preco?: any; imagem?: string } & TecidoTecnico) {
  const mapa: Record<string, string> = {
    forn: "fornecedor", comp: "composicao", preco: "preco",
    gramatura: "gramatura", oz: "oz", largura: "largura",
    enc_largura: "encolhimento_largura", enc_altura: "encolhimento_altura",
    rendimento: "rendimento", imagem: "imagem",
  };
  const numericos = new Set(["preco", "gramatura", "oz", "largura", "enc_largura", "enc_altura", "rendimento"]);
  const upd: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!mapa[k]) continue;
    upd[mapa[k]] = numericos.has(k) ? numOuNull(v) : v;
  }
  if (!Object.keys(upd).length) return;
  const { error } = await sb().from("tecidos").update(upd).eq("nome", nome);
  if (error) console.error("updateTecido:", error);
  invalidateCache("tecidos");
}
export async function removeTecido(nome: string) {
  const { error } = await sb().from("tecidos").delete().eq("nome", nome);
  if (error) console.error("removeTecido:", error);
  invalidateCache("tecidos");
}

// ══ AVIAMENTOS ══
export async function fetchAviamentos() {
  const cached = fromCache<any[]>("aviamentos");
  if (cached) return cached;
  const data = await selectAll((de, ate) => sb().from("aviamentos").select("*").order("nome").range(de, ate), "fetchAviamentos");
  const result = data.map((a: any) => ({ cod: a.codigo, nome: a.nome, preco: Number(a.preco) || 0, localizacao_padrao: a.localizacao_padrao || "", imagem: a.imagem || "", imagens_cores: a.imagens_cores || {}, cores_disponiveis: a.cores_disponiveis || [], fornecedor: a.fornecedor || "", codigo_fornecedor: a.codigo_fornecedor || "", unidade: a.unidade || "", cores_fabricante: a.cores_fabricante || [] }));
  toCache("aviamentos", result);
  return result;
}
export async function addAviamento(a: { cod: string; nome: string; preco: number; localizacao_padrao?: string; imagem?: string; fornecedor?: string; codigo_fornecedor?: string }): Promise<string | null> {
  const { error } = await sb().from("aviamentos").insert({
    codigo: a.cod, nome: a.nome, preco: a.preco,
    localizacao_padrao: a.localizacao_padrao || "",
    imagem: a.imagem || "",
    fornecedor: a.fornecedor || "",
    codigo_fornecedor: a.codigo_fornecedor || "",
  });
  if (error) { console.error("addAviamento:", error); return error.message || "Erro ao adicionar aviamento"; }
  invalidateCache("aviamentos");
  return null;
}
export async function updateAviamento(cod: string, data: { localizacao_padrao?: string; imagem?: string; imagens_cores?: Record<string, string>; nome?: string; preco?: number; cores_disponiveis?: string[]; fornecedor?: string; codigo_fornecedor?: string; unidade?: string; cores_fabricante?: { cor: string; ref: string }[] }) {
  const { error } = await sb().from("aviamentos").update(data).eq("codigo", cod);
  if (error) console.error("updateAviamento:", error);
  invalidateCache("aviamentos");
}
// Insere vários aviamentos de uma vez (usado na importação do Linx).
export async function addAviamentosBulk(items: { cod: string; nome: string; preco?: number; fornecedor?: string; codigo_fornecedor?: string; unidade?: string; cores_disponiveis?: string[]; cores_fabricante?: { cor: string; ref: string }[] }[]): Promise<string | null> {
  if (!items.length) return null;
  const rows = items.map(a => ({
    codigo: a.cod, nome: a.nome, preco: a.preco || 0, fornecedor: a.fornecedor || "",
    codigo_fornecedor: a.codigo_fornecedor || "", unidade: a.unidade || "",
    cores_disponiveis: a.cores_disponiveis || [], cores_fabricante: a.cores_fabricante || [],
  }));
  const { error } = await sb().from("aviamentos").insert(rows);
  if (error) { console.error("addAviamentosBulk:", error); return error.message || "Erro ao importar aviamentos"; }
  invalidateCache("aviamentos");
  return null;
}
export async function removeAviamento(cod: string) {
  const { error } = await sb().from("aviamentos").delete().eq("codigo", cod);
  if (error) console.error("removeAviamento:", error);
  invalidateCache("aviamentos");
}

// ══ PRODUTOS ══
export async function fetchProdutos() {
  const [data, tecidos] = await Promise.all([
    selectAll((de, ate) => sb().from("produtos").select("*").order("ref").range(de, ate), "fetchProdutos"),
    selectAll((de, ate) => sb().from("tecidos").select("nome, composicao").range(de, ate), "fetchProdutos/tecidos"),
  ]);

  const tecidoCompMap: Record<string, string> = {};
  tecidos.forEach((t: any) => { if (t.composicao) tecidoCompMap[t.nome] = t.composicao; });
  return data.map((p: any) => ({
    id: p.id, ref: p.ref, desc: p.descricao || "", tecido: p.tecido || "",
    composicao: p.composicao || tecidoCompMap[p.tecido] || "",
    forn_tecido: p.forn_tecido || "", status: p.status || "",
    piloto_most: p.piloto_most || "", colecao: p.colecao || "",
    grupo: p.grupo || "", subgrupo: p.subgrupo || "",
    operacao: p.operacao || "", fornecedor: p.fornecedor || "",
    grade: p.grade || "", categoria: p.categoria || "",
    subcategoria: p.subcategoria || "", lavagem: p.lavagem || "",
    tab_medidas: p.tab_medidas || "", tipo: p.tipo || "",
    linha: p.linha || "", drop: p.drop_num || "", estilista: p.estilista || "",
    custo_inicial:   p.custo_inicial  != null ? Number(p.custo_inicial)  : null,
    markup_inicial:  p.markup_inicial != null ? Number(p.markup_inicial) : null,
    preco_target:    p.preco_target   != null ? Number(p.preco_target)   : null,
    custo_final:     p.custo_final    != null ? Number(p.custo_final)    : null,
    varejo_final:    p.varejo_final   != null ? Number(p.varejo_final)   : null,
    status_preco:    p.status_preco   || "",
    status_compras:  p.status_compras || "",
    qtd_compra1:     p.qtd_compra1    != null ? Number(p.qtd_compra1)  : null,
    pedido1:         p.pedido1        || "",
    data_entrega1:   p.data_entrega1  || "",
    qtd_compra2:     p.qtd_compra2    != null ? Number(p.qtd_compra2)  : null,
    pedido2:         p.pedido2        || "",
    data_entrega2:   p.data_entrega2  || "",
  }));
}
export async function insertProduto(p: any): Promise<{ data: any; error: string | null }> {
  const { data, error } = await sb().from("produtos").insert({
    ref: p.ref || "", descricao: p.desc || "", tecido: p.tecido || "",
    forn_tecido: p.forn_tecido || "", status: p.status || "DESENVOLVIMENTO",
    piloto_most: p.piloto_most || "", colecao: p.colecao || "",
    grupo: p.grupo || "", subgrupo: p.subgrupo || "",
    operacao: p.operacao || "", fornecedor: p.fornecedor || "",
    grade: p.grade || "", categoria: p.categoria || "",
    subcategoria: p.subcategoria || "", lavagem: p.lavagem || "",
    tab_medidas: p.tab_medidas || "", tipo: p.tipo || "",
    linha: p.linha || "", drop_num: p.drop || "", estilista: p.estilista || "",
  }).select().single();
  if (error) console.error("insertProduto:", error);
  return { data, error: error ? (error.message || "Erro ao criar produto") : null };
}
export async function updateProdutoField(id: number, field: string, value: any): Promise<string | null> {
  const m: Record<string, string> = { desc: "descricao", drop: "drop_num" };
  const { error } = await sb().from("produtos").update({ [m[field] || field]: value }).eq("id", id);
  if (error) { console.error("updateProdutoField:", error); return error.message || "Erro ao salvar"; }
  return null;
}
export async function deleteProduto(id: number, ref?: string): Promise<string | null> {
  const { error } = await sb().from("produtos").delete().eq("id", id);
  if (error) { console.error("deleteProduto:", error); return error.message || "Erro ao excluir"; }
  if (ref) {
    const { deleteImagesByPrefix } = await import("./storage");
    await deleteImagesByPrefix(ref);
  }
  return null;
}
export async function cloneProduto(sourceId: number, newRef: string): Promise<{ data: any; error: string | null }> {
  const { data: src, error: fetchErr } = await sb().from("produtos").select("*").eq("id", sourceId).single();
  if (fetchErr || !src) return { data: null, error: "Produto original não encontrado" };
  const { id: _id, ref: _ref, created_at: _ca, updated_at: _ua, ...rest } = src;
  const { data, error } = await sb().from("produtos").insert({ ...rest, ref: newRef, status: "DESENVOLVIMENTO" }).select().single();
  if (error) { console.error("cloneProduto:", error); return { data: null, error: error.message || "Erro ao clonar" }; }
  return { data, error: null };
}
export async function bulkUpdateStatus(ids: number[], status: string): Promise<string | null> {
  const { error } = await sb().from("produtos").update({ status }).in("id", ids);
  if (error) { console.error("bulkUpdateStatus:", error); return error.message || "Erro ao atualizar status"; }
  return null;
}

// ══ COMPRAS POR VARIANTE ══
export async function fetchVarianteCompras(): Promise<Record<string, any>> {
  const data = await selectAll((de, ate) => sb().from("produto_variante_compras").select("*").range(de, ate), "fetchVarianteCompras");
  const map: Record<string, any> = {};
  data.forEach((r: any) => {
    map[`${r.produto_id}:${r.cor}`] = r;
  });
  return map;
}

export async function upsertVarianteCompra(produtoId: number, cor: string, field: string, value: any): Promise<string | null> {
  // Use upsert: inserts if not exists, updates only the specified field on conflict
  const { error } = await sb()
    .from("produto_variante_compras")
    .upsert(
      { produto_id: produtoId, cor, [field]: value },
      { onConflict: "produto_id,cor" }
    );
  if (error) { console.error("upsertVarianteCompra:", { produtoId, cor, field, value, error }); return error.message || "Erro ao salvar"; }
  return null;
}

// ══ FICHAS TÉCNICAS ══
export async function fetchFichasColecoes(ref: string): Promise<string[]> {
  const { data } = await sb().from("fichas_tecnicas").select("colecao, ordem").eq("produto_ref", ref).not("colecao", "is", null).order("ordem", { ascending: true }).order("id", { ascending: true });
  return (data || []).map((f: any) => f.colecao).filter(Boolean);
}

// Persiste a nova ordem dos pills de temporada (arrastar-e-soltar na ficha).
// Temporadas ainda não salvas (criadas via "+ Adicionar temporada" mas sem
// nenhum save ainda) simplesmente não têm linha pra atualizar — no-op.
export async function reorderFichaColecoes(ref: string, colecoesEmOrdem: string[]): Promise<void> {
  await Promise.all(colecoesEmOrdem.map((colecao, i) =>
    sb().from("fichas_tecnicas").update({ ordem: i }).eq("produto_ref", ref).eq("colecao", colecao)
  ));
}

// Exclui a ficha de uma temporada específica de um clássico (tecidos,
// aviamentos, provas etc. são apagados via ON DELETE CASCADE).
export async function deleteFichaColecao(ref: string, colecao: string): Promise<string | null> {
  const { error } = await sb().from("fichas_tecnicas").delete().eq("produto_ref", ref).eq("colecao", colecao);
  if (error) { console.error("deleteFichaColecao:", error); return error.message || "Erro ao excluir temporada"; }
  return null;
}

// Referências "clássicos" (ver isClassic em FichaModal.tsx) têm 1 ficha por
// temporada — não existe linha com colecao=null pra elas. Quem não tem UI de
// seletor de temporada (ex. o laudo de pré-produção) precisa desse fallback
// pra achar a ficha mesmo assim, senão trata a referência como "sem ficha".
export async function fetchFichaResolvida(ref: string) {
  const direta = await fetchFicha(ref);
  if (direta) return direta;
  const colecoes = await fetchFichasColecoes(ref);
  return colecoes.length ? fetchFicha(ref, colecoes[0]) : null;
}

export async function fetchFicha(ref: string, colecao?: string | null) {
  let q = sb().from("fichas_tecnicas").select("*").eq("produto_ref", ref);
  if (colecao) q = q.eq("colecao", colecao);
  else q = q.is("colecao", null);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  const fid = data.id;
  const [tec, avi, pil, prv, ant] = await Promise.all([
    sb().from("ficha_tecidos").select("*").eq("ficha_id", fid).order("id"),
    sb().from("ficha_aviamentos").select("*").eq("ficha_id", fid).order("id"),
    sb().from("ficha_pilotagem").select("*").eq("ficha_id", fid).order("id"),
    sb().from("ficha_provas").select("*").eq("ficha_id", fid),
    sb().from("ficha_anotacoes").select("*").eq("ficha_id", fid),
  ]);
  const result: any = {
    id: fid, produto_ref: data.produto_ref,
    imagem_url: data.imagem_url || null,
    imagem_modelo: data.imagem_modelo || null,
    imagem_modo_medir: data.imagem_modo_medir || null,
    imagem_frente: data.imagem_frente || null,
    imagem_costas: data.imagem_costas || null,
    observacoes: data.observacoes || "", obsFechamento: data.obs_fechamento || "", ncm: data.ncm || "",
    pantones: (data.pantones as Record<string,string>) || {},
    statusLiberacao: data.status_liberacao || "",
    provaInfo: data.prova_info || null,
    custoDet: data.custo_det || null,
    obsCusto: data.obs_custo || "",
    pesoCalculo: data.peso_calculo || null,
    tingimento: data.tingimento || null,
    qtdMost: {
      var01: data.qtd_most_var01 ?? null, var02: data.qtd_most_var02 ?? null,
      var03: data.qtd_most_var03 ?? null, var04: data.qtd_most_var04 ?? null,
      var05: data.qtd_most_var05 ?? null, var06: data.qtd_most_var06 ?? null,
    },
    tecidos: (tec.data || []).map((t: any) => ({ artigo: t.artigo, forn: t.fornecedor, preco: Number(t.preco) || 0, cores: t.cores || [] })),
    aviamentos: (avi.data || []).map((a: any) => ({ item: a.item, cod: a.codigo, qtd: a.qtd, valor: Number(a.valor) || 0, local: a.localizacao || "", var01: a.var01 || "", var02: a.var02 || "", var03: a.var03 || "", var04: a.var04 || "", var05: a.var05 || "", var06: a.var06 || "" })),
    pilotagem: (pil.data || []).map((p: any) => ({ num: p.num, lacre: p.lacre || "", envio: p.data_envio || "", receb: p.data_recebimento || "", prova: p.data_prova || "", status: p.status || "" })),
    provas: Object.fromEntries((prv.data || []).map((p: any) => [p.ponto_cod, { p1: p.prova1, p2: p.prova2, p3: p.prova3 }])),
    anotacoes: Object.fromEntries((ant.data || []).map((a: any) => [`p${a.prova_num}`, { texto: a.anotacao || "", video: a.video_link || "" }])),
    estamparia: data.estamparia && Object.keys(data.estamparia).length > 0 ? data.estamparia : { artes: [{ posicao: "FRENTE", imagem: "", largura: "", localizacao: "" }, { posicao: "COSTAS", imagem: "", largura: "", localizacao: "" }, { posicao: "TAGLESS", imagem: "", largura: "", localizacao: "" }], tecnicas: [], simulacoes: { var01: { nome: "", imgSim: "", imgFoto: "", status: "" }, var02: { nome: "", imgSim: "", imgFoto: "", status: "" }, var03: { nome: "", imgSim: "", imgFoto: "", status: "" }, var04: { nome: "", imgSim: "", imgFoto: "", status: "" } }, observacoes: "" },
    tabelaEspecialAtiva: data.tabela_especial_ativa || false,
    pontosEspeciais: [] as any[],
    gradEspecial: [] as any[],
  };
  if (result.tabelaEspecialAtiva) {
    const [pe, ge] = await Promise.all([
      sb().from("ficha_pontos_especiais").select("*").eq("ficha_id", fid).order("ordem"),
      sb().from("ficha_graduacao_especial").select("*").eq("ficha_id", fid).order("ordem"),
    ]);
    result.pontosEspeciais = (pe.data || []).map((p: any) => ({ cod: p.cod, desc: p.descricao, tabela: p.valor_base, tol: p.tolerancia }));
    result.gradEspecial = (ge.data || []).map((g: any) => ({ desc: g.descricao, valores: g.valores || {}, ampliacoes: g.ampliacoes || {}, tol: g.tolerancia }));
  }
  return result;
}

// Temporadas diferentes de um clássico podem apontar pro mesmo arquivo de
// imagem, já que uma temporada nova nasce copiando a anterior. Antes de apagar
// o arquivo do Storage é preciso saber se outra ficha da mesma referência ainda
// o usa — senão trocar o desenho numa temporada quebra a imagem das outras.
export async function imagemUsadaEmOutraFicha(ref: string, fichaId: number | null, url: string): Promise<boolean> {
  if (!url) return false;
  const { data, error } = await sb().from("fichas_tecnicas").select("*").eq("produto_ref", ref);
  // Na dúvida (erro de consulta), prefere manter o arquivo a apagar algo em uso.
  if (error) { console.error("imagemUsadaEmOutraFicha:", error); return true; }
  return (data || []).some((f: any) =>
    f.id !== fichaId &&
    [f.imagem_url, f.imagem_modelo, f.imagem_modo_medir, f.imagem_frente, f.imagem_costas].includes(url)
  );
}

export async function saveFichaImagem(fichaId: number, field: string, url: string) {
  const { error } = await sb().from("fichas_tecnicas").update({ [field]: url }).eq("id", fichaId);
  if (error) console.error("saveFichaImagem:", error);
}

export async function upsertFicha(ref: string, f: any, colecao?: string | null) {
  // Campos base (sempre existem)
  const fichaBase = {
    observacoes: f.observacoes || "", obs_fechamento: f.obsFechamento || "",
    ncm: f.ncm || "", imagem_url: f.imagem_url || "", imagem_modelo: f.imagem_modelo || "",
    pantones: f.pantones || {}, estamparia: f.estamparia || {},
    status_liberacao: f.statusLiberacao || "",
    qtd_most_var01: f.qtdMost?.var01 ?? null, qtd_most_var02: f.qtdMost?.var02 ?? null,
    qtd_most_var03: f.qtdMost?.var03 ?? null, qtd_most_var04: f.qtdMost?.var04 ?? null,
    qtd_most_var05: f.qtdMost?.var05 ?? null, qtd_most_var06: f.qtdMost?.var06 ?? null,
  };
  // Campos extras (requerem migration SQL)
  const fichaExtras = {
    imagem_modo_medir: f.imagem_modo_medir || "",
    prova_info: f.provaInfo || null,
    custo_det: f.custoDet || null,
    obs_custo: f.obsCusto || "",
    peso_calculo: f.pesoCalculo || null,
    tingimento: f.tingimento || null,
    imagem_frente: f.imagem_frente || "",
    imagem_costas: f.imagem_costas || "",
  };
  let fid = f.id;
  if (!fid) {
    // Tenta inserir com todos os campos; se falhar por coluna ausente, insere sem extras
    let result = await sb().from("fichas_tecnicas").insert({
      produto_ref: ref, colecao: colecao || null, ...fichaBase, ...fichaExtras,
    }).select().single();
    if (result.error) {
      result = await sb().from("fichas_tecnicas").insert({
        produto_ref: ref, colecao: colecao || null, ...fichaBase,
      }).select().single();
    }
    if (result.error) { console.error("upsertFicha insert:", result.error); return null; }
    fid = result.data.id;
  } else {
    // Update com todos os campos
    let { error } = await sb().from("fichas_tecnicas").update({ ...fichaBase, ...fichaExtras }).eq("id", fid);
    // Se falhou (coluna não existe), tenta só com campos base
    if (error) {
      const retry = await sb().from("fichas_tecnicas").update(fichaBase).eq("id", fid);
      error = retry.error;
    }
    if (error) { console.error("upsertFicha update:", error); return null; }
  }
  // Deletar tudo em paralelo, depois inserir tudo em paralelo (mais rápido)
  await Promise.all([
    sb().from("ficha_tecidos").delete().eq("ficha_id", fid),
    sb().from("ficha_aviamentos").delete().eq("ficha_id", fid),
    sb().from("ficha_pilotagem").delete().eq("ficha_id", fid),
    sb().from("ficha_provas").delete().eq("ficha_id", fid),
    sb().from("ficha_anotacoes").delete().eq("ficha_id", fid),
  ]);

  // Inserir tudo em paralelo
  const insertResults = await Promise.all([
    // Tecidos
    f.tecidos?.length
      ? sb().from("ficha_tecidos").insert(f.tecidos.map((t: any) => ({ ficha_id: fid, artigo: t.artigo, fornecedor: t.forn || "", preco: t.preco || 0, cores: t.cores || [] })))
      : Promise.resolve(),
    // Aviamentos
    f.aviamentos?.length
      ? sb().from("ficha_aviamentos").insert(f.aviamentos.map((a: any) => ({ ficha_id: fid, item: a.item, codigo: a.cod, qtd: a.qtd || 1, valor: a.valor || 0, localizacao: a.local || "", var01: a.var01 || "", var02: a.var02 || "", var03: a.var03 || "", var04: a.var04 || "", var05: a.var05 || "", var06: a.var06 || "" })))
      : Promise.resolve(),
    // Pilotagem
    f.pilotagem?.length
      ? sb().from("ficha_pilotagem").insert(f.pilotagem.map((p: any) => ({ ficha_id: fid, num: p.num || "", lacre: p.lacre || "", data_envio: p.envio || null, data_recebimento: p.receb || null, data_prova: p.prova || null, status: p.status || "" })))
      : Promise.resolve(),
    // Provas
    (async () => {
      if (f.provas && Object.keys(f.provas).length > 0) {
        const provasRows = Object.entries(f.provas)
          .filter(([, v]: any) => v.p1 || v.p2 || v.p3)
          .map(([cod, v]: any) => ({ ficha_id: fid, ponto_cod: cod, prova1: v.p1 || "", prova2: v.p2 || "", prova3: v.p3 || "" }));
        if (provasRows.length) return sb().from("ficha_provas").insert(provasRows);
      }
    })(),
    // Anotações
    (async () => {
      if (f.anotacoes) {
        const anotRows = Object.entries(f.anotacoes).map(([k, v]: any) => {
          const n = parseInt(k.replace("p", ""));
          return !isNaN(n) ? { ficha_id: fid, prova_num: n, anotacao: v.texto || "", video_link: v.video || "" } : null;
        }).filter(Boolean);
        if (anotRows.length) {
          const { error } = await sb().from("ficha_anotacoes").insert(anotRows);
          if (error) console.error("Erro ao salvar anotações:", error.message);
        }
      }
    })(),
  ]);
  // Verificar se houve erros nos inserts
  insertResults.forEach((result: any, idx: number) => {
    if (result?.error) {
      const tableName = ["ficha_tecidos", "ficha_aviamentos", "ficha_pilotagem", "ficha_provas"][idx];
      console.error(`Erro ao salvar ${tableName}:`, result.error.message);
    }
  });
  // Tabela especial
  if (f.tabelaEspecialAtiva !== undefined) await sb().from("fichas_tecnicas").update({ tabela_especial_ativa: f.tabelaEspecialAtiva }).eq("id", fid);
  if (f.tabelaEspecialAtiva && f.pontosEspeciais) {
    await sb().from("ficha_pontos_especiais").delete().eq("ficha_id", fid);
    if (f.pontosEspeciais.length) await sb().from("ficha_pontos_especiais").insert(f.pontosEspeciais.map((p: any, i: number) => ({ ficha_id: fid, cod: p.cod, descricao: p.desc, valor_base: p.tabela || "", tolerancia: p.tol || "1,0 + OU -", ordem: i })));
  }
  if (f.tabelaEspecialAtiva && f.gradEspecial) {
    await sb().from("ficha_graduacao_especial").delete().eq("ficha_id", fid);
    if (f.gradEspecial.length) await sb().from("ficha_graduacao_especial").insert(f.gradEspecial.map((g: any, i: number) => ({ ficha_id: fid, descricao: g.desc, valores: g.valores || {}, ampliacoes: g.ampliacoes || {}, tolerancia: g.tol || "1,0 + OU -", ordem: i })));
  }
  return fid;
}

// ══ EXPLOSÃO DE AVIAMENTOS ══
export async function fetchExplosaoData() {
  const [fichas, avFichas, avLib, comprasVar, tecFichas] = await Promise.all([
    selectAll((de, ate) => sb().from("fichas_tecnicas").select("id, produto_ref, qtd_most_var01, qtd_most_var02, qtd_most_var03, qtd_most_var04, qtd_most_var05, qtd_most_var06").range(de, ate), "fetchExplosaoData/fichas"),
    selectAll((de, ate) => sb().from("ficha_aviamentos").select("ficha_id, codigo, qtd, valor, localizacao, var01, var02, var03, var04, var05, var06").range(de, ate), "fetchExplosaoData/avFichas"),
    selectAll((de, ate) => sb().from("aviamentos").select("codigo, nome, fornecedor, preco, imagem, imagens_cores, codigo_fornecedor").range(de, ate), "fetchExplosaoData/avLib"),
    // As datas de entrega entram porque a explosão em modo Produção só conta
    // pedido ainda não entregue (data vazia ou de hoje pra frente).
    selectAll((de, ate) => sb().from("produto_variante_compras").select("produto_id, cor, qtd_compra1, data_entrega1, qtd_compra2, data_entrega2").range(de, ate), "fetchExplosaoData/comprasVar"),
    // Cores do tecido por ficha (1º tecido, "Tec.01") — é o que define qual
    // variante (VAR 01, VAR 02...) tem qual cor de peça, pra casar com a cor
    // do aviamento escolhida na mesma variante.
    selectAll((de, ate) => sb().from("ficha_tecidos").select("ficha_id, cores").order("id").range(de, ate), "fetchExplosaoData/tecFichas"),
  ]);
  return {
    fichas: fichas as { id: number; produto_ref: string; qtd_most_var01: number|null; qtd_most_var02: number|null; qtd_most_var03: number|null; qtd_most_var04: number|null; qtd_most_var05: number|null; qtd_most_var06: number|null }[],
    avFichas: avFichas as { ficha_id: number; codigo: string; qtd: number; valor: number; localizacao: string; var01: string; var02: string; var03: string; var04: string; var05: string; var06: string }[],
    avLib: avLib as { codigo: string; nome: string; fornecedor: string; preco: number; imagem: string; imagens_cores: Record<string, string>; codigo_fornecedor: string }[],
    comprasVar: comprasVar as { produto_id: number; cor: string; qtd_compra1: number|null; data_entrega1: string|null; qtd_compra2: number|null; data_entrega2: string|null }[],
    tecFichas: tecFichas as { ficha_id: number; cores: string[] }[],
  };
}

// ══ TABELAS DE MEDIDAS ══
export async function fetchTabelasMedidas() {
  // Tenta buscar com imagem_modo_medir; se a coluna não existir, busca só id e nome
  const { data, error } = await sb().from("tabelas_medidas").select("id, nome, imagem_modo_medir, tamanhos, tamanho_base, area_media").order("nome");
  if (error) {
    const { data: fallback } = await sb().from("tabelas_medidas").select("id, nome").order("nome");
    return fallback || [];
  }
  return data || [];
}
export async function saveTabelaImagemModoMedir(id: number, url: string) {
  const { error } = await sb().from("tabelas_medidas").update({ imagem_modo_medir: url }).eq("id", id);
  if (error) console.error("saveTabelaImagemModoMedir (coluna pode não existir ainda):", error);
}
// Área média da modelagem, em m² por peça (vazio = null)
export async function saveTabelaAreaMedia(id: number, area: string) {
  const n = parseFloat(String(area ?? "").replace(",", "."));
  const { error } = await sb().from("tabelas_medidas").update({ area_media: isNaN(n) ? null : n }).eq("id", id);
  if (error) console.error("saveTabelaAreaMedia:", error);
}
export async function fetchTabelaPontos(tabelaId: number) {
  const { data, error } = await sb().from("tabela_medida_pontos").select("*").eq("tabela_id", tabelaId).order("ordem");
  if (error) console.error("fetchTabelaPontos:", error);
  return data || [];
}
export async function fetchGraduacoes(tabelaId: number) {
  const { data, error } = await sb().from("graduacoes").select("*").eq("tabela_id", tabelaId).order("ordem");
  if (error) console.error("fetchGraduacoes:", error);
  return data || [];
}
export async function createTabelaMedidas(nome: string, tamanhos: string[] = [], tamanhoBase = "") {
  const { data, error } = await sb().from("tabelas_medidas").insert({ nome, tamanhos, tamanho_base: tamanhoBase }).select().single();
  if (error) console.error("createTabelaMedidas:", error);
  return data;
}
export async function deleteTabelaMedidas(id: number) {
  const { error } = await sb().from("tabelas_medidas").delete().eq("id", id);
  if (error) console.error("deleteTabelaMedidas:", error);
}
export async function upsertPontos(tabelaId: number, pontos: any[]) {
  await sb().from("tabela_medida_pontos").delete().eq("tabela_id", tabelaId);
  if (pontos.length) { const rows = pontos.map((p, i) => ({ tabela_id: tabelaId, cod: p.cod, descricao: p.desc || p.descricao, valor_base: p.tabela || p.valor_base || "", tolerancia: p.tol || p.tolerancia || "1,0 + OU -", ordem: i })); await sb().from("tabela_medida_pontos").insert(rows); }
}
export async function upsertGraduacoes(tabelaId: number, grads: any[]) {
  await sb().from("graduacoes").delete().eq("tabela_id", tabelaId);
  if (grads.length) { const rows = grads.map((g, i) => ({ tabela_id: tabelaId, descricao: g.desc || g.descricao, valores: g.valores || {}, ampliacoes: g.ampliacoes || {}, tolerancia: g.tol || g.tolerancia || "1,0 + OU -", ordem: i })); await sb().from("graduacoes").insert(rows); }
}
export async function fetchPontosByTabelaNome(nome: string) {
  const { data: tab } = await sb().from("tabelas_medidas").select("id").eq("nome", nome).maybeSingle();
  if (!tab) return [];
  const { data } = await sb().from("tabela_medida_pontos").select("*").eq("tabela_id", tab.id).order("ordem");
  return (data || []).map((p: any) => ({ cod: p.cod, desc: p.descricao, tabela: p.valor_base, tol: p.tolerancia }));
}

// Devolve a graduação junto com o esquema de tamanhos da tabela — a ficha
// precisa saber quais tamanhos existem e qual é a base para montar as colunas.
export async function fetchGraduacoesByTabelaNome(nome: string): Promise<{ tamanhos: string[]; base: string; linhas: any[] }> {
  const vazio = { tamanhos: [], base: "", linhas: [] };
  const { data: tab } = await sb().from("tabelas_medidas").select("id, tamanhos, tamanho_base").eq("nome", nome).maybeSingle();
  if (!tab) return vazio;
  const { data } = await sb().from("graduacoes").select("*").eq("tabela_id", tab.id).order("ordem");
  return {
    tamanhos: tab.tamanhos || [],
    base: tab.tamanho_base || "",
    linhas: (data || []).map((g: any) => ({ desc: g.descricao, valores: g.valores || {}, ampliacoes: g.ampliacoes || {}, tol: g.tolerancia })),
  };
}

// Fetch only tables that have at least 1 point
export async function fetchTabelasComPontos() {
  const { data, error } = await sb().rpc('get_tabelas_com_pontos').order('nome' as any);
  if (error) {
    // Fallback: fetch all points in parallel, group by tabela_id
    const tabelas = await fetchTabelasMedidas();
    const pontos = await selectAll((de, ate) => sb().from("tabela_medida_pontos").select("tabela_id").range(de, ate), "fetchTabelasComPontos");
    const tabelasComPontos = new Set(pontos.map((p: any) => p.tabela_id));
    return tabelas.filter((t: any) => tabelasComPontos.has(t.id)).map((t: any) => t.nome);
  }
  return (data || []).map((t: any) => t.nome);
}

// ══ LAUDO DE PRÉ-PRODUÇÃO ══
// Uma referência pode ter vários pedidos de produção, cada um medido em
// cores diferentes e aprovado/reprovado separadamente — por isso o laudo é
// por PEDIDO (ficha_laudo_pp_pedidos), não por ficha. As medidas em si
// (ficha_laudo_pp) apontam pro pedido.
export type LaudoPPPedido = { id: number; numero_pedido: string; status: string; updated_at: string };

export async function fetchLaudoPPPedidos(fichaId: number): Promise<LaudoPPPedido[]> {
  const { data, error } = await sb().from("ficha_laudo_pp_pedidos").select("id, numero_pedido, status, updated_at").eq("ficha_id", fichaId).order("updated_at", { ascending: false });
  if (error) { console.error("fetchLaudoPPPedidos:", error); return []; }
  return data || [];
}

export async function criarLaudoPPPedido(fichaId: number): Promise<number | null> {
  const { data, error } = await sb().from("ficha_laudo_pp_pedidos").insert({ ficha_id: fichaId }).select("id").single();
  if (error) { console.error("criarLaudoPPPedido:", error); return null; }
  return data.id;
}

export async function fetchLaudoPPPedido(id: number): Promise<{ numero_pedido: string; status: string; comentarios: string; fotos: string[]; cores_tamanho: Record<string, string> } | null> {
  const { data, error } = await sb().from("ficha_laudo_pp_pedidos").select("numero_pedido, status, comentarios, fotos, cores_tamanho").eq("id", id).maybeSingle();
  if (error) { console.error("fetchLaudoPPPedido:", error); return null; }
  if (!data) return null;
  return {
    numero_pedido: data.numero_pedido || "", status: data.status || "",
    comentarios: data.comentarios || "", fotos: data.fotos || [], cores_tamanho: data.cores_tamanho || {},
  };
}

export async function upsertLaudoPPPedido(id: number, patch: { numero_pedido?: string; status?: string; comentarios?: string; fotos?: string[]; cores_tamanho?: Record<string, string> }) {
  const { error } = await sb().from("ficha_laudo_pp_pedidos").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("upsertLaudoPPPedido:", error);
}

// As medidas em ficha_laudo_pp caem junto via ON DELETE CASCADE (laudo_pedido_id).
export async function deleteLaudoPPPedido(id: number): Promise<string | null> {
  const { error } = await sb().from("ficha_laudo_pp_pedidos").delete().eq("id", id);
  if (error) { console.error("deleteLaudoPPPedido:", error); return error.message || "Erro ao excluir laudo"; }
  return null;
}

// Medida aferida por ponto e por tamanho da grade (diferente de ficha_provas,
// que guarda só 1 valor por ponto — aqui é preciso medir cada tamanho).
export async function fetchLaudoPPMedidas(laudoPedidoId: number): Promise<Record<string, Record<string, string>>> {
  const { data, error } = await sb().from("ficha_laudo_pp").select("ponto_cod, valores").eq("laudo_pedido_id", laudoPedidoId);
  if (error) { console.error("fetchLaudoPPMedidas:", error); return {}; }
  return Object.fromEntries((data || []).map((r: any) => [r.ponto_cod, r.valores || {}]));
}

export async function upsertLaudoPPMedidas(laudoPedidoId: number, medidas: Record<string, Record<string, string>>) {
  await sb().from("ficha_laudo_pp").delete().eq("laudo_pedido_id", laudoPedidoId);
  const rows = Object.entries(medidas)
    .filter(([, valores]) => Object.values(valores || {}).some(v => String(v ?? "").trim() !== ""))
    .map(([ponto_cod, valores]) => ({ laudo_pedido_id: laudoPedidoId, ponto_cod, valores }));
  if (!rows.length) return;
  const { error } = await sb().from("ficha_laudo_pp").insert(rows);
  if (error) console.error("upsertLaudoPPMedidas:", error);
}

// Fetch all product variants (ref -> cores[]) from ficha_tecidos
export async function fetchAllVariantes(): Promise<Record<string, string[]>> {
  const tecidos = await selectAll((de, ate) => sb().from("ficha_tecidos").select("ficha_id, cores, fichas_tecnicas!inner(produto_ref, colecao)").order("id").range(de, ate), "fetchAllVariantes");
  const result: Record<string, string[]> = {};
  tecidos.forEach((t: any) => {
    const ref = t.fichas_tecnicas?.produto_ref;
    if (!ref || !t.cores?.length) return;
    if (!result[ref]) result[ref] = [];
    t.cores.forEach((c: string) => { if (c && !result[ref].includes(c)) result[ref].push(c); });
  });
  return result;
}

// Fetch season-specific variants for classic refs: ref -> colecao -> cores[]
export async function fetchVariantesPorColecao(): Promise<Record<string, Record<string, string[]>>> {
  const tecidos = await selectAll((de, ate) => sb().from("ficha_tecidos").select("cores, fichas_tecnicas!inner(produto_ref, colecao)").order("id").range(de, ate), "fetchVariantesPorColecao");
  const result: Record<string, Record<string, string[]>> = {};
  tecidos.forEach((t: any) => {
    const ref = t.fichas_tecnicas?.produto_ref;
    const col = t.fichas_tecnicas?.colecao;
    if (!ref || !col || !t.cores?.length) return;
    if (!result[ref]) result[ref] = {};
    if (!result[ref][col]) result[ref][col] = [];
    t.cores.forEach((c: string) => { if (c && !result[ref][col].includes(c)) result[ref][col].push(c); });
  });
  return result;
}

// ══ CONTROLE DE FLUXO ══
export async function fetchControleFluxo() {
  return await selectAll<Record<string, any>>((de, ate) => sb().from("controle_fluxo").select("*").range(de, ate), "fetchControleFluxo");
}

export async function fetchControleFluxoByRef(produto_ref: string) {
  const { data, error } = await sb().from("controle_fluxo").select("*").eq("produto_ref", produto_ref).maybeSingle();
  if (error) { console.error("fetchControleFluxoByRef:", error); return null; }
  return data;
}

export async function upsertControleFluxo(produto_ref: string, field: string, value: string | null): Promise<string | null> {
  const { error } = await sb()
    .from("controle_fluxo")
    .upsert({ produto_ref, [field]: value || null, updated_at: new Date().toISOString() }, { onConflict: "produto_ref" });
  if (error) { console.error("upsertControleFluxo:", error); return error.message || "Erro ao salvar"; }
  return null;
}

// ══ CALENDÁRIO ══
export type CalendarioTarefa = {
  id: number;
  tarefa: string;
  colecao: string;
  responsavel: string;
  status: string;
  data_inicio: string;
  data_fim: string;
  descricao: string;
};

export async function fetchCalendarioTarefas(): Promise<CalendarioTarefa[]> {
  return await selectAll<CalendarioTarefa>((de, ate) => sb().from("calendario_tarefas").select("*").order("data_inicio").range(de, ate), "fetchCalendarioTarefas");
}

export async function createCalendarioTarefa(t: Omit<CalendarioTarefa, "id">): Promise<{ data: CalendarioTarefa | null; error: string | null }> {
  const { data, error } = await sb().from("calendario_tarefas").insert(t).select().single();
  if (error) { console.error("createCalendarioTarefa:", error); return { data: null, error: error.message || "Erro ao criar tarefa" }; }
  return { data: data as CalendarioTarefa, error: null };
}

export async function updateCalendarioTarefa(id: number, fields: Partial<Omit<CalendarioTarefa, "id">>): Promise<string | null> {
  const { error } = await sb().from("calendario_tarefas").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) { console.error("updateCalendarioTarefa:", error); return error.message || "Erro ao salvar"; }
  return null;
}

export async function deleteCalendarioTarefa(id: number): Promise<string | null> {
  const { error } = await sb().from("calendario_tarefas").delete().eq("id", id);
  if (error) { console.error("deleteCalendarioTarefa:", error); return error.message || "Erro ao excluir"; }
  return null;
}

// ══ MAPA DE COLEÇÃO ══
export async function fetchMapaColecao() {
  const [prods, fichas, tecidos, ficTecidos] = await Promise.all([
    selectAll((de, ate) => sb().from("produtos").select("*").order("grupo").order("ref").range(de, ate), "fetchMapaColecao/produtos"),
    selectAll((de, ate) => sb().from("fichas_tecnicas").select("produto_ref, imagem_url, imagem_modelo, imagem_frente, imagem_costas").range(de, ate), "fetchMapaColecao/fichas"),
    selectAll((de, ate) => sb().from("tecidos").select("nome, composicao, imagem").range(de, ate), "fetchMapaColecao/tecidos"),
    selectAll((de, ate) => sb().from("ficha_tecidos").select("ficha_id, cores, fichas_tecnicas!inner(produto_ref, colecao)").range(de, ate), "fetchMapaColecao/ficha_tecidos"),
  ]);

  const imgMap: Record<string, string> = {};
  const fotoMap: Record<string, string> = {};
  const frenteMap: Record<string, string> = {};
  const costasMap: Record<string, string> = {};
  fichas.forEach((f: any) => {
    if (f.imagem_url) imgMap[f.produto_ref] = f.imagem_url;
    if (f.imagem_modelo) fotoMap[f.produto_ref] = f.imagem_modelo;
    if (f.imagem_frente) frenteMap[f.produto_ref] = f.imagem_frente;
    if (f.imagem_costas) costasMap[f.produto_ref] = f.imagem_costas;
  });

  const tecidoCompMap: Record<string, string> = {};
  const tecidoImgMap: Record<string, string> = {};
  tecidos.forEach((t: any) => {
    if (t.composicao) tecidoCompMap[t.nome] = t.composicao;
    if (t.imagem) tecidoImgMap[t.nome] = t.imagem;
  });

  const coresMap: Record<string, string[]> = {};
  const fichasPorColecaoMap: Record<string, Record<string, string[]>> = {};
  ficTecidos.forEach((t: any) => {
    const ref = t.fichas_tecnicas?.produto_ref;
    const fichaColecao = t.fichas_tecnicas?.colecao;
    if (!ref || !t.cores?.length) return;
    if (fichaColecao) {
      if (!fichasPorColecaoMap[ref]) fichasPorColecaoMap[ref] = {};
      if (!fichasPorColecaoMap[ref][fichaColecao]) fichasPorColecaoMap[ref][fichaColecao] = [];
      t.cores.forEach((c: string) => { if (c && !fichasPorColecaoMap[ref][fichaColecao].includes(c)) fichasPorColecaoMap[ref][fichaColecao].push(c); });
    } else {
      if (!coresMap[ref]) coresMap[ref] = [];
      t.cores.forEach((c: string) => { if (c && !coresMap[ref].includes(c)) coresMap[ref].push(c); });
    }
  });

  return prods.map((p: any) => ({
    id: p.id, ref: p.ref, desc: p.descricao || "",
    tecido: p.tecido || "", forn_tecido: p.forn_tecido || "",
    composicao: p.composicao || tecidoCompMap[p.tecido] || "",
    // Foto do tecido (cadastro) — aparece junto do desenho no card e no zoom
    tecido_imagem: tecidoImgMap[p.tecido] || "",
    fornecedor: p.fornecedor || "", colecao: p.colecao || "",
    grupo: p.grupo || "", subgrupo: p.subgrupo || "", operacao: p.operacao || "",
    categoria: p.categoria || "", subcategoria: p.subcategoria || "",
    tab_medidas: p.tab_medidas || "", tipo: p.tipo || "",
    linha: p.linha || "", drop: p.drop_num || "", estilista: p.estilista || "",
    piloto_most: p.piloto_most || "", status: p.status || "",
    imagem_url: imgMap[p.ref] || "",
    imagem_modelo: fotoMap[p.ref] || "",
    imagem_frente: frenteMap[p.ref] || "",
    imagem_costas: costasMap[p.ref] || "",
    cores: coresMap[p.ref] || [],
    fichas_por_colecao: fichasPorColecaoMap[p.ref] || {},
  }));
}

// ══ MAPA DE ENTREGAS ══
export async function fetchMapaEntregas() {
  const [prods, fichas, tecidos, varCompras, laudosPedidos] = await Promise.all([
    selectAll((de, ate) => sb().from("produtos").select("*").range(de, ate), "fetchMapaEntregas/produtos"),
    selectAll((de, ate) => sb().from("fichas_tecnicas").select("id, produto_ref, imagem_url, imagem_modelo, imagem_frente, imagem_costas").range(de, ate), "fetchMapaEntregas/fichas"),
    selectAll((de, ate) => sb().from("tecidos").select("nome, composicao, imagem").range(de, ate), "fetchMapaEntregas/tecidos"),
    selectAll((de, ate) => sb().from("produto_variante_compras").select("*").range(de, ate), "fetchMapaEntregas/varCompras"),
    selectAll((de, ate) => sb().from("ficha_laudo_pp_pedidos").select("ficha_id, numero_pedido, status").range(de, ate), "fetchMapaEntregas/laudosPedidos"),
  ]);

  const imgMap: Record<string, string> = {};
  const fotoMap: Record<string, string> = {};
  const frenteMap: Record<string, string> = {};
  const costasMap: Record<string, string> = {};
  const fichaRefMap: Record<number, string> = {};
  fichas.forEach((f: any) => {
    if (f.imagem_url) imgMap[f.produto_ref] = f.imagem_url;
    if (f.imagem_modelo) fotoMap[f.produto_ref] = f.imagem_modelo;
    if (f.imagem_frente) frenteMap[f.produto_ref] = f.imagem_frente;
    if (f.imagem_costas) costasMap[f.produto_ref] = f.imagem_costas;
    fichaRefMap[f.id] = f.produto_ref;
  });

  // Laudos de pré-produção por referência — casados com "Ped. X" do mapa por
  // número idêntico (os dois são texto livre, sem vínculo estrutural entre si).
  const laudosPorRef: Record<string, { numero_pedido: string; status: string }[]> = {};
  laudosPedidos.forEach((l: any) => {
    if (!l.numero_pedido) return;
    const ref = fichaRefMap[l.ficha_id];
    if (!ref) return;
    (laudosPorRef[ref] ||= []).push({ numero_pedido: l.numero_pedido, status: l.status || "" });
  });

  const tecidoCompMap: Record<string, string> = {};
  const tecidoImgMap: Record<string, string> = {};
  tecidos.forEach((t: any) => {
    if (t.composicao) tecidoCompMap[t.nome] = t.composicao;
    if (t.imagem) tecidoImgMap[t.nome] = t.imagem;
  });

  const prodMap: Record<number, any> = {};
  prods.forEach((p: any) => { prodMap[p.id] = p; });

  const entryMap: Record<string, any> = {};

  varCompras.forEach((vc: any) => {
    const prod = prodMap[vc.produto_id];
    if (!prod) return;
    const base = {
      ref: prod.ref, desc: prod.descricao || "", status: prod.status || "",
      tecido: prod.tecido || "", composicao: prod.composicao || tecidoCompMap[prod.tecido] || "",
      tecido_imagem: tecidoImgMap[prod.tecido] || "",
      forn_tecido: prod.forn_tecido || "", fornecedor: prod.fornecedor || "",
      colecao: prod.colecao || "", grupo: prod.grupo || "", subgrupo: prod.subgrupo || "",
      operacao: prod.operacao || "", categoria: prod.categoria || "",
      subcategoria: prod.subcategoria || "", tipo: prod.tipo || "",
      linha: prod.linha || "", drop: prod.drop_num || "", estilista: prod.estilista || "",
      imagem_url: imgMap[prod.ref] || "", imagem_modelo: fotoMap[prod.ref] || "", imagem_frente: frenteMap[prod.ref] || "", imagem_costas: costasMap[prod.ref] || "",
      laudosPP: laudosPorRef[prod.ref] || [],
    };
    if (vc.data_entrega1 && (vc.qtd_compra1 || 0) > 0) {
      const key = `${prod.ref}|${vc.data_entrega1}|1`;
      if (!entryMap[key]) entryMap[key] = { ...base, data_entrega: vc.data_entrega1, compra_num: 1, variantes: [] };
      if (vc.cor) entryMap[key].variantes.push({ cor: vc.cor, qtd: vc.qtd_compra1 || 0, pedido: vc.pedido1 || "" });
    }
    if (vc.data_entrega2 && (vc.qtd_compra2 || 0) > 0) {
      const key = `${prod.ref}|${vc.data_entrega2}|2`;
      if (!entryMap[key]) entryMap[key] = { ...base, data_entrega: vc.data_entrega2, compra_num: 2, variantes: [] };
      if (vc.cor) entryMap[key].variantes.push({ cor: vc.cor, qtd: vc.qtd_compra2 || 0, pedido: vc.pedido2 || "" });
    }
  });

  return Object.values(entryMap).sort((a: any, b: any) =>
    a.data_entrega.localeCompare(b.data_entrega) || a.ref.localeCompare(b.ref)
  );
}

// ══ ALERTAS DE ALTERAÇÃO EM FICHA/SKU LIBERADO ══
// Popup bloqueante para os outros usuários quando um SKU já em MOSTRUÁRIO
// LIBERADO / PRODUÇÃO LIBERADA / REPILOTANDO PRODUÇÃO tem campo/cor/tecido/
// aviamento alterado. Persistido: fica pendente por usuário até ele dar
// "ciente" (tabela alerta_ciente), mesmo que estivesse offline na hora.
export type NovoAlerta = {
  produtoRef: string;
  categoria: "CAMPO" | "STATUS" | "COR" | "TECIDO" | "AVIAMENTO";
  campo: string;
  valorAnterior: string;
  valorNovo: string;
  statusProduto: string;
  alteradoPorNome: string;
  alteradoPorUserId: string;
};

export async function criarAlerta(a: NovoAlerta) {
  const { error } = await sb().from("alertas").insert({
    produto_ref: a.produtoRef,
    categoria: a.categoria,
    campo: a.campo,
    valor_anterior: a.valorAnterior,
    valor_novo: a.valorNovo,
    status_produto: a.statusProduto,
    alterado_por_nome: a.alteradoPorNome,
    alterado_por_user_id: a.alteradoPorUserId,
  });
  if (error) console.error("criarAlerta:", error);
}

export async function fetchAlertasPendentes(userId: string): Promise<any[]> {
  const acks = await selectAll((de, ate) => sb().from("alerta_ciente").select("alerta_id").eq("user_id", userId).range(de, ate), "fetchAlertasPendentes/ciente");
  const ackedIds = acks.map((a: any) => a.alerta_id);

  return await selectAll((de, ate) => {
    let q = sb().from("alertas").select("*").neq("alterado_por_user_id", userId).order("created_at", { ascending: true });
    if (ackedIds.length) q = q.not("id", "in", `(${ackedIds.join(",")})`);
    return q.range(de, ate);
  }, "fetchAlertasPendentes");
}

export async function marcarAlertaCiente(alertaId: number, userId: string) {
  const { error } = await sb().from("alerta_ciente").insert({ alerta_id: alertaId, user_id: userId });
  if (error) console.error("marcarAlertaCiente:", error);
}
