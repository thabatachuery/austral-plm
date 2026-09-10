// Backup completo do PLM: dados do banco + imagens do Storage + esquema.
//
// Uso:
//   npm run db:backup
//   npm run db:backup -- --out "C:/Users/LENOVO/OneDrive - Austral/Backups PLM"
//   npm run db:backup -- --sem-imagens        (só o banco, muito mais rápido)
//
// Lê as credenciais do .env.local. Precisa da SUPABASE_SERVICE_ROLE_KEY para
// enxergar todas as linhas (a chave anon é limitada pelas políticas de RLS).

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------- credenciais

// Carrega o .env.local sem depender de pacote externo.
function carregaEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    let valor = m[2].trim()
    if (/^".*"$/.test(valor) || /^'.*'$/.test(valor)) valor = valor.slice(1, -1)
    if (!process.env[m[1]]) process.env[m[1]] = valor
  }
}
carregaEnv(path.join(process.cwd(), '.env.local'))

// A URL no .env.local vem com o sufixo /rest/v1/ — o supabase-js quer só a raiz.
const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '')

const CHAVE_ADMIN = process.env.SUPABASE_SERVICE_ROLE_KEY
const CHAVE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const CHAVE = CHAVE_ADMIN || CHAVE_ANON

if (!URL_BASE || !CHAVE) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e a chave do Supabase no .env.local')
  process.exit(1)
}
if (!CHAVE_ADMIN) {
  console.warn('AVISO: sem SUPABASE_SERVICE_ROLE_KEY. O backup pode sair incompleto')
  console.warn('       porque a chave anon respeita as políticas de RLS.\n')
}

const sb = createClient(URL_BASE, CHAVE, { auth: { persistSession: false } })

// --------------------------------------------------------------- configuração

// Todas as tabelas do PLM. Uma tabela que não existir mais é apenas avisada.
// Fora da lista de propósito: calendario_status e ficha_laudo_pp_info têm
// migration escrita (007_, 024_) mas nunca aplicada, e o app não as usa.
const TABELAS = [
  'produtos',
  'fichas_tecnicas',
  'ficha_tecidos',
  'ficha_aviamentos',
  'ficha_pilotagem',
  'ficha_provas',
  'ficha_anotacoes',
  'ficha_pontos_especiais',
  'ficha_graduacao_especial',
  'ficha_laudo_pp',
  'ficha_laudo_pp_pedidos',
  'produto_variante_compras',
  'tabelas_medidas',
  'tabela_medida_pontos',
  'graduacoes',
  'tecidos',
  'aviamentos',
  'cadastros',
  'calendario_tarefas',
  'controle_fluxo',
  'alertas',
  'alerta_ciente',
]

const BUCKET = 'fichas-imagens'
const PAGINA = 1000

// ------------------------------------------------------------------ argumentos

const args = process.argv.slice(2)
const semImagens = args.includes('--sem-imagens')
const idxOut = args.indexOf('--out')
const raizDestino = idxOut !== -1 && args[idxOut + 1]
  ? args[idxOut + 1]
  : path.join(process.cwd(), 'backup')

// Pasta com data e hora: 2026-09-10_14-32
const agora = new Date()
const z = (n) => String(n).padStart(2, '0')
const selo = `${agora.getFullYear()}-${z(agora.getMonth() + 1)}-${z(agora.getDate())}`
  + `_${z(agora.getHours())}-${z(agora.getMinutes())}`

// Baixar as imagens leva minutos. Se a última tentativa foi interrompida, a
// pasta dela ficou sem resumo.json — então retoma nela em vez de começar de
// zero e baixar tudo de novo.
function pastaInterrompida() {
  if (!fs.existsSync(raizDestino)) return null
  const candidatas = fs.readdirSync(raizDestino)
    .filter(n => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/.test(n))
    .filter(n => fs.statSync(path.join(raizDestino, n)).isDirectory())
    .filter(n => !fs.existsSync(path.join(raizDestino, n, 'resumo.json')))
    .sort()
  return candidatas.length ? path.join(raizDestino, candidatas[candidatas.length - 1]) : null
}

const retomar = pastaInterrompida()
const destino = retomar ?? path.join(raizDestino, selo)
if (retomar) console.log(`Retomando backup interrompido em ${path.basename(retomar)}`)

fs.mkdirSync(path.join(destino, 'dados'), { recursive: true })

console.log(`Projeto: ${URL_BASE}`)
console.log(`Destino: ${destino}\n`)

// ----------------------------------------------------------------------- banco

// Descobre uma coluna estável para ordenar: sem ORDER BY o Postgres não garante
// que as páginas não se sobreponham nem que nenhuma linha escape.
async function colunaOrdem(tabela) {
  const { data, error } = await sb.from(tabela).select('*').limit(1)
  if (error) throw error
  if (!data || data.length === 0) return null
  const cols = Object.keys(data[0])
  for (const preferida of ['id', 'created_at', 'ref', 'produto_ref']) {
    if (cols.includes(preferida)) return preferida
  }
  return cols[0]
}

async function baixaTabela(tabela) {
  const ordem = await colunaOrdem(tabela)
  if (ordem === null) return []   // tabela vazia

  const linhas = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await sb
      .from(tabela)
      .select('*')
      .order(ordem, { ascending: true })
      .range(inicio, inicio + PAGINA - 1)
    if (error) throw error
    linhas.push(...data)
    if (data.length < PAGINA) break
    process.stdout.write(`\r  ${tabela}: ${linhas.length} linhas...`)
  }
  return linhas
}

const resumo = { projeto: URL_BASE, data: agora.toISOString(), tabelas: {}, arquivos: 0 }
const falhas = []

for (const tabela of TABELAS) {
  try {
    const linhas = await baixaTabela(tabela)
    fs.writeFileSync(
      path.join(destino, 'dados', `${tabela}.json`),
      JSON.stringify(linhas, null, 2),
      'utf8'
    )
    resumo.tabelas[tabela] = linhas.length
    console.log(`\r  OK  ${tabela.padEnd(26)} ${String(linhas.length).padStart(6)} linhas`)
  } catch (e) {
    const msg = e?.message || String(e)
    falhas.push(`${tabela}: ${msg}`)
    console.log(`\r  --  ${tabela.padEnd(26)} ${msg}`)
  }
}

// -------------------------------------------------------------------- usuários

// Só a listagem: o Supabase nunca devolve as senhas, nem em hash. Serve para
// saber quem tinha acesso e com qual papel, e recriar os logins se preciso.
if (CHAVE_ADMIN) {
  try {
    const usuarios = []
    for (let pagina = 1; ; pagina++) {
      const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: 200 })
      if (error) throw error
      usuarios.push(...data.users.map(u => ({
        id: u.id,
        email: u.email,
        criado_em: u.created_at,
        ultimo_login: u.last_sign_in_at,
        metadata: u.user_metadata,
        app_metadata: u.app_metadata,
      })))
      if (data.users.length < 200) break
    }
    fs.writeFileSync(
      path.join(destino, 'usuarios.json'),
      JSON.stringify(usuarios, null, 2),
      'utf8'
    )
    console.log(`  OK  ${'usuarios (auth)'.padEnd(26)} ${String(usuarios.length).padStart(6)} contas`)
    resumo.usuarios = usuarios.length
  } catch (e) {
    falhas.push(`usuarios: ${e?.message || e}`)
    console.log(`  --  usuarios (auth): ${e?.message || e}`)
  }
}

// --------------------------------------------------------------------- imagens

async function listaRecursivo(prefixo = '') {
  const encontrados = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await sb.storage.from(BUCKET)
      .list(prefixo, { limit: 100, offset })
    if (error) throw error
    for (const item of data) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
      // No Storage do Supabase, uma "pasta" vem sem id.
      if (item.id === null) encontrados.push(...await listaRecursivo(caminho))
      else encontrados.push({ caminho, tamanho: item.metadata?.size ?? 0 })
    }
    if (data.length < 100) break
  }
  return encontrados
}

if (semImagens) {
  console.log('\n  (imagens ignoradas: --sem-imagens)')
} else {
  console.log('\nImagens do Storage:')
  try {
    const arquivos = await listaRecursivo()
    console.log(`  ${arquivos.length} arquivos no bucket "${BUCKET}"`)
    let baixados = 0, pulados = 0
    for (const arq of arquivos) {
      const alvo = path.join(destino, 'imagens', arq.caminho)
      // Já existe com o mesmo tamanho: não baixa de novo (permite retomar).
      if (fs.existsSync(alvo) && fs.statSync(alvo).size === arq.tamanho) { pulados++; continue }
      const { data, error } = await sb.storage.from(BUCKET).download(arq.caminho)
      if (error) { falhas.push(`imagem ${arq.caminho}: ${error.message}`); continue }
      fs.mkdirSync(path.dirname(alvo), { recursive: true })
      fs.writeFileSync(alvo, Buffer.from(await data.arrayBuffer()))
      baixados++
      if (baixados % 25 === 0) process.stdout.write(`\r  ${baixados} baixadas...`)
    }
    console.log(`\r  ${baixados} baixadas, ${pulados} já existiam`)
    resumo.arquivos = arquivos.length
  } catch (e) {
    falhas.push(`storage: ${e?.message || e}`)
    console.log(`  -- storage: ${e?.message || e}`)
  }
}

// ---------------------------------------------------------------------- esquema

// Sem o esquema, os JSONs não viram banco de novo. Vai junto para o backup ser
// restaurável por si só, sem depender do GitHub.
const pastaSql = path.join(process.cwd(), 'supabase')
if (fs.existsSync(pastaSql)) {
  const alvoSql = path.join(destino, 'esquema')
  fs.mkdirSync(alvoSql, { recursive: true })
  let n = 0
  for (const f of fs.readdirSync(pastaSql).filter(f => f.endsWith('.sql'))) {
    fs.copyFileSync(path.join(pastaSql, f), path.join(alvoSql, f))
    n++
  }
  console.log(`\nEsquema: ${n} arquivos .sql copiados`)
}

// ---------------------------------------------------------------------- resumo

resumo.falhas = falhas
fs.writeFileSync(path.join(destino, 'resumo.json'), JSON.stringify(resumo, null, 2), 'utf8')

const totalLinhas = Object.values(resumo.tabelas).reduce((a, b) => a + b, 0)

const leiaMe = [
  'BACKUP DO PLM AUSTRAL',
  `Gerado em ${agora.toLocaleString('pt-BR')}`,
  `Projeto Supabase: ${URL_BASE}`,
  '',
  'O QUE TEM AQUI',
  `  dados/        uma tabela por arquivo .json (${totalLinhas} linhas no total)`,
  `  imagens/      arquivos do bucket "${BUCKET}", no mesmo caminho de lá`,
  '  esquema/      os .sql que criam as tabelas do zero',
  '  usuarios.json quem tinha acesso (sem senhas — o Supabase nunca as entrega)',
  '  resumo.json   contagem por tabela e erros, se houve',
  '',
  'COMO RESTAURAR, SE UM DIA PRECISAR',
  '  1. Crie um projeto novo no Supabase.',
  '  2. No SQL Editor, rode esquema/migration.sql e depois os numerados',
  '     (002_, 003_, ...) na ordem.',
  '  3. Ponha a URL e as chaves do projeto novo no .env.local.',
  `  4. Rode:  node scripts/restaurar.mjs "${destino.replace(/\\/g, '/')}"`,
  '  5. Recrie os logins pelo painel do Supabase (Authentication > Users) usando',
  '     usuarios.json como referência. As senhas precisam ser redefinidas.',
  '',
  'Este backup não depende de nada além do Supabase e do código no GitHub.',
  '',
].join('\n')

fs.writeFileSync(path.join(destino, 'LEIA-ME.txt'), leiaMe, 'utf8')

console.log(`\n${totalLinhas} linhas, ${resumo.arquivos} imagens`)
if (falhas.length) {
  console.log(`\n${falhas.length} problema(s) — veja resumo.json:`)
  for (const f of falhas.slice(0, 10)) console.log(`  ${f}`)
} else {
  console.log('Backup concluído sem erros.')
}
console.log(`\n${destino}`)
