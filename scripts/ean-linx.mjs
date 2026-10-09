// Preenche o EAN (código de barras do Linx) de uma lista de SKUs e gera um
// Excel com uma linha por SKU (ref × cor × tamanho).
//
// Uso:
//   npm run linx:ean -- lista.xlsx                 (gera lista-ean.xlsx ao lado)
//   npm run linx:ean -- lista.xlsx saida.xlsx
//   npm run linx:ean -- 21030063 210300630010M     (SKUs direto na linha de comando)
//
// A lista é a 1ª aba do Excel (ou CSV). O código sai da coluna SKU / REF /
// REFERENCIA / PRODUTO / PRODUTO_PAI — ou da 1ª coluna, se nenhuma tiver esse
// nome. Aceita os dois jeitos de escrever o SKU:
//   - SKU completo (ref + cor + tamanho, com ou sem separador: 210300630010M,
//     21030063-0010-M, 21030063.0010.M) → sai o EAN daquele SKU;
//   - só a ref (21030063) → sai a grade inteira, ou só a COR/TAMANHO se a lista
//     tiver essas colunas.
//
// Depende do endpoint /codigos-barra da API do BI (ver
// docs/linx-endpoint-codigos-barra.md). Lê LINX_API_BASE_URL e LINX_API_KEY
// do .env.local — chave de servidor, roda só na máquina.

import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'

// O build ESM do SheetJS não enxerga o disco sozinho.
XLSX.set_fs(fs)

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
const arquivo = args.find(a => /\.(xlsx|xls|csv)$/i.test(a) && fs.existsSync(a))
const saidaArg = args.find(a => /\.xlsx$/i.test(a) && a !== arquivo)

const norm = s => String(s ?? '').toUpperCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '')
const limpa = s => String(s ?? '').trim()

// Linhas da lista: [{ codigo, ref, cor?, tamanho? }]
let pedidos = []
if (arquivo) {
  const wb = XLSX.readFile(arquivo, { raw: false })
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
  if (!linhas.length) { console.error(`${arquivo}: aba vazia`); process.exit(1) }
  const cols = Object.keys(linhas[0])
  const acha = nomes => cols.find(c => nomes.includes(norm(c)))
  const cSku = acha(['SKU', 'REF', 'REFERENCIA', 'PRODUTO', 'PRODUTOPAI', 'CODIGO']) || cols[0]
  const cCor = acha(['COR', 'CODCOR', 'CODIGOCOR', 'CORPRODUTO'])
  const cTam = acha(['TAMANHO', 'TAM', 'GRADE'])
  pedidos = linhas
    .map(l => ({ codigo: limpa(l[cSku]), cor: cCor ? limpa(l[cCor]) : '', tamanho: cTam ? limpa(l[cTam]) : '' }))
    .filter(p => p.codigo)
  console.log(`${arquivo}: ${pedidos.length} linha(s) · SKU em "${cSku}"` +
    (cCor ? ` · cor em "${cCor}"` : '') + (cTam ? ` · tamanho em "${cTam}"` : ''))
} else {
  pedidos = args.filter(a => a !== saidaArg).map(codigo => ({ codigo: limpa(codigo), cor: '', tamanho: '' }))
}
if (!pedidos.length) {
  console.error('Passe um Excel/CSV com a lista de SKUs, ou os SKUs direto: npm run linx:ean -- 21030063')
  process.exit(1)
}

// A ref (produto_pai) é o começo do SKU — 8 dígitos no PLM. O resto (cor +
// tamanho) é casado com o que o Linx devolver para aquela ref.
for (const p of pedidos) {
  const m = p.codigo.match(/^(\d{8})/)
  p.ref = m ? m[1] : p.codigo
}

const pega = async p => {
  const r = await fetch(BASE + p, { headers: { 'X-API-Key': KEY } })
  if (r.status === 404 && p.startsWith('/codigos-barra')) {
    console.error('\nO endpoint /codigos-barra ainda não existe na API do BI.')
    console.error('Pedido ao BI: docs/linx-endpoint-codigos-barra.md')
    process.exit(2)
  }
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`)
  return r.json()
}

const refs = [...new Set(pedidos.map(p => p.ref))]
const [barras, cores, produtos] = await Promise.all([
  pega('/codigos-barra?produtos=' + encodeURIComponent(refs.join(','))),
  pega('/cores').catch(() => ({})),
  pega('/produtos').catch(() => []),
])
const descricao = Object.fromEntries(produtos.map(p => [limpa(p.produto_pai), p.descricao || '']))

// EAN-13 / EAN-8 / GTIN-14: confere o dígito verificador. Código interno do
// Linx (não-EAN) aparece, mas marcado — não é para ir para etiqueta de varejo.
function eanValido(cod) {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(cod)) return false
  const d = cod.split('').map(Number)
  const dv = d.pop()
  const soma = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10 === dv
}

// Agrupa por SKU do Linx: o padrão primeiro, os demais como alternativos.
const porSku = new Map()
for (const b of barras) {
  const ref = limpa(b.produto_pai), cor = limpa(b.cor), tam = limpa(b.tamanho)
  const k = `${ref}|${cor}|${tam}`
  const sku = porSku.get(k) || { ref, cor, tamanho: tam, posicao: Number(b.posicao) || 0, codigos: [] }
  sku.codigos.push({ codigo: limpa(b.codigo_barra), padrao: !!b.padrao })
  porSku.set(k, sku)
}

const casa = (a, b) => !a || norm(a) === norm(b) || norm(a) === norm(cores[b])
// SKU completo bate com ref+cor+tamanho (rótulo ou posição na grade), sem separador.
const chaves = s => [s.ref + s.cor + s.tamanho, s.ref + s.cor + s.posicao, s.ref + s.cor + String(s.posicao).padStart(2, '0')].map(norm)

const saida = []
const semEan = []
for (const p of pedidos) {
  const daRef = [...porSku.values()].filter(s => s.ref === p.ref)
  const skuCompleto = norm(p.codigo) !== norm(p.ref)
  const skus = (skuCompleto
    ? daRef.filter(s => chaves(s).includes(norm(p.codigo)))
    : daRef.filter(s => casa(p.cor, s.cor) && (!p.tamanho || norm(p.tamanho) === norm(s.tamanho)))
  ).sort((a, b) => a.cor.localeCompare(b.cor) || a.posicao - b.posicao)

  if (!skus.length) {
    semEan.push(p)
    const obs = descricao[p.ref] === undefined ? 'ref não encontrada no Linx'
      : skuCompleto && daRef.length ? 'SKU não bate com nenhuma cor/tamanho da ref — conferir formato'
      : 'sem código de barras no Linx'
    saida.push({ SKU: p.codigo, REF: p.ref, DESCRICAO: descricao[p.ref] || '', COR: p.cor, NOME_COR: cores[p.cor] || '',
      TAMANHO: p.tamanho, EAN: '', OUTROS_CODIGOS: '', OBS: obs })
    continue
  }
  for (const s of skus) {
    const ordenados = [...s.codigos].sort((a, b) => b.padrao - a.padrao)
    const principal = ordenados[0].codigo
    const obs = []
    if (!s.codigos.some(c => c.padrao) && s.codigos.length > 1) obs.push('mais de um código, nenhum marcado como padrão — conferir')
    if (!eanValido(principal)) obs.push('não é EAN válido (código interno?)')
    saida.push({
      SKU: p.codigo, REF: s.ref, DESCRICAO: descricao[s.ref] || '', COR: s.cor, NOME_COR: cores[s.cor] || '',
      TAMANHO: s.tamanho, EAN: principal,
      OUTROS_CODIGOS: ordenados.slice(1).map(c => c.codigo).join(', '),
      OBS: obs.join('; '),
    })
  }
}

// O mesmo SKU repetido na lista não duplica linha.
const vistos = new Set()
const final = saida.filter(r => {
  const k = `${r.SKU}|${r.COR}|${r.TAMANHO}|${r.EAN}`
  if (vistos.has(k)) return false
  vistos.add(k)
  return true
})

const destino = saidaArg || (arquivo
  ? path.join(path.dirname(arquivo), path.basename(arquivo).replace(/\.\w+$/, '') + '-ean.xlsx')
  : 'ean-linx.xlsx')

const ws = XLSX.utils.json_to_sheet(final, {
  header: ['SKU', 'REF', 'DESCRICAO', 'COR', 'NOME_COR', 'TAMANHO', 'EAN', 'OUTROS_CODIGOS', 'OBS'],
})
// EAN como texto: o Excel come zero à esquerda e vira 7,89E+12 se for número.
for (const addr of Object.keys(ws)) {
  if (addr[0] !== '!' && ws[addr].t === 'n') { ws[addr].t = 's'; ws[addr].v = String(ws[addr].v) }
}
ws['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 36 }, { wch: 7 }, { wch: 20 }, { wch: 8 }, { wch: 15 }, { wch: 20 }, { wch: 40 }]
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'EAN')
XLSX.writeFile(wb, destino)

const comEan = final.filter(r => r.EAN).length
console.log(`\n${comEan} linha(s) com EAN · ${semEan.length} SKU(s) da lista sem código`)
for (const p of semEan.slice(0, 20)) console.log(`  sem EAN: ${p.codigo} ${p.cor} ${p.tamanho}`.trimEnd())
console.log(`→ ${destino}`)
