// Restaura um backup gerado por scripts/backup.mjs para o projeto Supabase
// configurado no .env.local. Use só em emergência ou para montar um ambiente
// de teste — ele grava por cima das linhas com o mesmo id.
//
// Uso:
//   node scripts/restaurar.mjs "backup/2026-09-10_14-32"
//   node scripts/restaurar.mjs "backup/2026-09-10_14-32" --sem-imagens
//
// ANTES DE RODAR: o esquema já tem que existir no projeto de destino. Rode os
// .sql da pasta esquema/ no SQL Editor do Supabase primeiro.

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

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

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '')
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASE || !CHAVE) {
  console.error('Restaurar exige NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.')
  process.exit(1)
}

const args = process.argv.slice(2)
const origem = args.find(a => !a.startsWith('--'))
const semImagens = args.includes('--sem-imagens')

if (!origem || !fs.existsSync(path.join(origem, 'dados'))) {
  console.error('Passe a pasta do backup. Ex.: node scripts/restaurar.mjs "backup/2026-09-10_14-32"')
  process.exit(1)
}

const sb = createClient(URL_BASE, CHAVE, { auth: { persistSession: false } })

// Ordem de inserção: pai antes de filho, senão a chave estrangeira recusa.
const ORDEM = [
  'cadastros',
  'tecidos',
  'aviamentos',
  'tabelas_medidas',
  'tabela_medida_pontos',
  'graduacoes',
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
  'calendario_tarefas',
  'controle_fluxo',
  'alertas',
  'alerta_ciente',
]

const LOTE = 500
const BUCKET = 'fichas-imagens'

console.log(`Origem : ${origem}`)
console.log(`Destino: ${URL_BASE}\n`)

const falhas = []

for (const tabela of ORDEM) {
  const arquivo = path.join(origem, 'dados', `${tabela}.json`)
  if (!fs.existsSync(arquivo)) continue

  const linhas = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  if (linhas.length === 0) {
    console.log(`  --  ${tabela.padEnd(26)} vazia`)
    continue
  }

  let gravadas = 0
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE)
    const { error } = await sb.from(tabela).upsert(lote)
    if (error) {
      falhas.push(`${tabela} (lote ${i}): ${error.message}`)
      break
    }
    gravadas += lote.length
    process.stdout.write(`\r  ${tabela}: ${gravadas}/${linhas.length}...`)
  }
  const marca = gravadas === linhas.length ? 'OK ' : '!! '
  console.log(`\r  ${marca} ${tabela.padEnd(26)} ${String(gravadas).padStart(6)}/${linhas.length}`)
}

// --------------------------------------------------------------------- imagens

function listaLocal(dir, base = dir) {
  const saida = []
  if (!fs.existsSync(dir)) return saida
  for (const nome of fs.readdirSync(dir)) {
    const cheio = path.join(dir, nome)
    if (fs.statSync(cheio).isDirectory()) saida.push(...listaLocal(cheio, base))
    // O Storage usa barra normal, mesmo vindo de caminho do Windows.
    else saida.push({ cheio, chave: path.relative(base, cheio).split(path.sep).join('/') })
  }
  return saida
}

if (!semImagens) {
  const arquivos = listaLocal(path.join(origem, 'imagens'))
  if (arquivos.length) {
    console.log(`\nImagens: ${arquivos.length} arquivos`)
    let enviadas = 0
    for (const arq of arquivos) {
      const { error } = await sb.storage.from(BUCKET)
        .upload(arq.chave, fs.readFileSync(arq.cheio), { upsert: true })
      if (error) { falhas.push(`imagem ${arq.chave}: ${error.message}`); continue }
      enviadas++
      if (enviadas % 25 === 0) process.stdout.write(`\r  ${enviadas} enviadas...`)
    }
    console.log(`\r  ${enviadas} enviadas`)
  }
}

if (falhas.length) {
  console.log(`\n${falhas.length} problema(s):`)
  for (const f of falhas.slice(0, 20)) console.log(`  ${f}`)
  process.exitCode = 1
} else {
  console.log('\nRestauração concluída sem erros.')
}
console.log('\nOs logins não voltam por aqui: recrie em Authentication > Users,')
console.log('usando usuarios.json como referência.')
