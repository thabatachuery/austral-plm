// Reduz as fotos do Storage que subiram no tamanho original.
//
// Até 25/11/2026 o CSP (middleware.ts) não permitia "blob:" em img-src, então
// a redução para 1200px de lib/storage.ts falhava e a foto do celular subia
// inteira (12–48 MP, 3–30 MB). Este script regrava essas fotos no MESMO
// caminho (os links nas fichas e laudos continuam valendo), em JPEG de até
// 1200px no lado maior, qualidade 80 — o mesmo que o app faz hoje.
//
// Uso:
//   node scripts/reduzir-fotos.mjs              (só lista o que faria)
//   node scripts/reduzir-fotos.mjs --aplicar    (guarda os originais e reduz)
//   node scripts/reduzir-fotos.mjs --aplicar --sem-backup
//
// Só mexe em .jpg fora de envios/ (o que o uploadImage grava). Não toca em
// PDF, vídeo nem nos arquivos dos Envios, que são originais de propósito.
// Antes de sobrescrever, guarda o original em scripts/backups/fotos-originais-<data>/.

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
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

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !CHAVE) { console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local'); process.exit(1) }
const sb = createClient(URL_BASE, CHAVE, { auth: { persistSession: false } })

const BUCKET = 'fichas-imagens'
const MAX_SIDE = 1200
const QUALIDADE = 80
const LIMITE_BYTES = 450 * 1024   // abaixo disso já está reduzida (1200px q80 ≈ 100–300 KB)
const aplicar = process.argv.includes('--aplicar')
const semBackup = process.argv.includes('--sem-backup')

async function listaRecursivo(prefixo = '') {
  const out = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefixo, { limit: 100, offset })
    if (error) throw error
    for (const item of data) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
      if (item.id === null) { if (caminho !== 'envios') out.push(...await listaRecursivo(caminho)) }
      else out.push({ caminho, tamanho: item.metadata?.size ?? 0 })
    }
    if (data.length < 100) break
  }
  return out
}

const mb = b => (b / 1048576).toFixed(1) + ' MB'

console.log(`Lendo o bucket "${BUCKET}"...`)
const todos = await listaRecursivo()
const alvos = todos.filter(a => /\.jpe?g$/i.test(a.caminho) && !a.caminho.startsWith('envios/') && a.tamanho > LIMITE_BYTES)
const totalAntes = alvos.reduce((s, a) => s + a.tamanho, 0)
console.log(`${todos.length} arquivos (fora envios/); ${alvos.length} fotos .jpg acima de ${mb(LIMITE_BYTES)}, somando ${mb(totalAntes)}.`)

if (!aplicar) {
  for (const a of alvos.slice().sort((x, y) => y.tamanho - x.tamanho).slice(0, 15)) console.log(`  ${mb(a.tamanho).padStart(9)}  ${a.caminho}`)
  if (alvos.length > 15) console.log(`  ... e mais ${alvos.length - 15}`)
  console.log('\nNada foi alterado. Para reduzir: node scripts/reduzir-fotos.mjs --aplicar')
  process.exit(0)
}

const pastaBackup = path.join(process.cwd(), 'scripts', 'backups', `fotos-originais-${Date.now()}`)
let ok = 0, pulou = 0, falhou = 0, totalDepois = 0
for (const [i, a] of alvos.entries()) {
  const tag = `[${i + 1}/${alvos.length}] ${a.caminho}`
  try {
    const { data, error } = await sb.storage.from(BUCKET).download(a.caminho)
    if (error) throw error
    const original = Buffer.from(await data.arrayBuffer())
    // rotate() aplica a orientação do EXIF (foto de celular em pé), como o navegador fazia.
    const reduzida = await sharp(original, { failOn: 'none' })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALIDADE, mozjpeg: true })
      .toBuffer()
    if (reduzida.length >= original.length) { pulou++; totalDepois += original.length; console.log(`${tag}: já está pequena, mantida`); continue }
    if (!semBackup) {
      const destino = path.join(pastaBackup, a.caminho)
      fs.mkdirSync(path.dirname(destino), { recursive: true })
      fs.writeFileSync(destino, original)
    }
    const { error: e2 } = await sb.storage.from(BUCKET).upload(a.caminho, reduzida, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
    if (e2) throw e2
    ok++; totalDepois += reduzida.length
    console.log(`${tag}: ${mb(original.length)} -> ${(reduzida.length / 1024).toFixed(0)} KB`)
  } catch (e) {
    falhou++; totalDepois += a.tamanho
    console.log(`${tag}: FALHOU (${e?.message || e}) — original mantido`)
  }
}
console.log(`\nReduzidas ${ok}, mantidas ${pulou}, falhas ${falhou}. ${mb(totalAntes)} -> ${mb(totalDepois)}.`)
if (!semBackup && ok) console.log(`Originais guardados em: ${pastaBackup}`)
