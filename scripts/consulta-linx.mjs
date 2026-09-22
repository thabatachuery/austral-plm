// Consulta no Linx o estoque atual, o futuro (pedidos de produção pendentes) e
// a carteira de venda de uma ou mais referências, quebrado por cor.
//
// Uso:
//   npm run linx 21030063
//   npm run linx 11030104 11030107 20030039
//   npm run linx -- --desc "HAVANA"        (busca por trecho da descrição)
//
// Lê LINX_API_BASE_URL e LINX_API_KEY do .env.local. A chave é de servidor —
// este script roda na máquina, nunca no navegador.

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

const BASE = process.env.LINX_API_BASE_URL
const KEY = process.env.LINX_API_KEY
if (!BASE || !KEY) {
  console.error('Faltam LINX_API_BASE_URL e LINX_API_KEY no .env.local')
  process.exit(1)
}

const args = process.argv.slice(2)
const iDesc = args.indexOf('--desc')
const termo = iDesc !== -1 ? args[iDesc + 1] : null
const refsPedidas = args.filter(a => /^\d+$/.test(a))

if (!termo && !refsPedidas.length) {
  console.error('Passe uma ou mais refs, ou --desc "trecho da descrição".')
  process.exit(1)
}

// Descrição no Linx não usa abreviação: "ML" está escrito "MANGA LONGA". Sem
// tirar acento e normalizar espaço, "ESTONIA" não acha "ESTÔNIA".
const norm = s => String(s || '').toUpperCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

const pega = p => fetch(BASE + p, { headers: { 'X-API-Key': KEY } }).then(r => {
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`)
  return r.json()
})

const [produtos, estoque, pedidos, cores, tamanhos, carteira] = await Promise.all([
  pega('/produtos'), pega('/estoque'), pega('/pedidos-produto'),
  pega('/cores'), pega('/tamanhos'), pega('/carteira-venda'),
])

const refs = termo
  ? produtos.filter(p => norm(p.descricao).includes(norm(termo))).map(p => String(p.produto_pai).trim())
  : refsPedidas

if (termo) console.log(`"${termo}" -> ${refs.length} referência(s)\n`)

for (const ref of refs) {
  const info = produtos.find(p => String(p.produto_pai).trim() === ref)
  const est = estoque.filter(x => String(x.produto_pai).trim() === ref)
  const ped = pedidos.filter(x => String(x.produto_pai).trim() === ref)
  const cart = carteira.filter(x => String(x.produto_pai).trim() === ref)

  console.log('═'.repeat(78))
  if (!info) { console.log(`${ref} — NÃO ENCONTRADA em /produtos\n`); continue }
  console.log(`${ref} — ${info.descricao}`)
  console.log(`${info.colecao_nome || info.colecao} · ${info.grupo} / ${info.subgrupo} · ${info.categoria} / ${info.subcategoria || '—'} · ${info.fabricante || '—'}`)

  const grade = est[0]?.grade
  const rotulos = (tamanhos[grade] || []).filter(Boolean)

  const atual = {}, futuro = {}, cartPorCor = {}
  for (const x of est) {
    const a = atual[x.cor] || (atual[x.cor] = { tot: 0, tam: [0, 0, 0, 0, 0, 0] })
    a.tot += Number(x.estoque_total) || 0
    for (let i = 0; i < 6; i++) a.tam[i] += Number(x['est_' + (i + 1)]) || 0
  }
  for (const x of ped) futuro[x.cor] = (futuro[x.cor] || 0) + (Number(x.quantidade_pendente) || 0)
  for (const x of cart) cartPorCor[x.cor] = (Number(x.pedidos_franquia) || 0) + (Number(x.pedidos_atacado) || 0)

  const todas = [...new Set([...Object.keys(atual), ...Object.keys(futuro), ...Object.keys(cartPorCor)])].sort()
  if (!todas.length) { console.log('\n  sem estoque, sem pedido e sem carteira\n'); continue }

  console.log(`\n  COR                       ATUAL  FUTURO  CARTEIRA` + (rotulos.length ? `   ${rotulos.map(t => t.padStart(4)).join('')}` : ''))
  let ta = 0, tf = 0, tc = 0
  for (const c of todas) {
    const a = atual[c] || { tot: 0, tam: [0, 0, 0, 0, 0, 0] }
    ta += a.tot; tf += futuro[c] || 0; tc += cartPorCor[c] || 0
    const porTam = rotulos.length ? '   ' + a.tam.slice(0, rotulos.length).map(n => String(n).padStart(4)).join('') : ''
    console.log(`  ${c.padEnd(5)} ${(cores[c] || '').padEnd(18)} ${String(a.tot).padStart(6)}  ${String(futuro[c] || 0).padStart(6)}  ${String(cartPorCor[c] || 0).padStart(8)}${porTam}`)
  }
  console.log(`  ${'TOTAL'.padEnd(24)} ${String(ta).padStart(6)}  ${String(tf).padStart(6)}  ${String(tc).padStart(8)}`)

  // Saldo negativo é real na base (faturamento antes da entrada, acerto de
  // inventário) — vale destacar em vez de somar calado.
  const negativos = est.filter(x => Number(x.estoque_total) < 0)
  if (negativos.length) {
    console.log('\n  ATENÇÃO — saldo negativo:')
    for (const x of negativos) console.log(`    ${x.filial} · cor ${x.cor}: ${x.estoque_total}`)
  }

  if (est.length) {
    console.log('\n  POR FILIAL:')
    for (const x of est.filter(x => Number(x.estoque_total) !== 0)) {
      console.log(`    ${String(x.filial).padEnd(24)} ${String(x.cor).padEnd(5)} ${String(x.estoque_total).padStart(5)}`)
    }
  }

  if (ped.length) {
    console.log('\n  PEDIDOS EM ABERTO:')
    for (const x of ped) {
      console.log(`    cor ${x.cor} · pedido ${x.numero_pedido} · pendente ${x.quantidade_pendente} de ${x.quantidade} · ${x.data_programada} · ${x.situacao || ''} · ${x.fornecedor || ''}`)
    }
  }
  console.log('')
}
