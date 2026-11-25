// Simula a carga Linx -> Compra x Variante SEM GRAVAR nada e mostra o resumo
// e alguns exemplos. Uso: node scripts/simular-variante-compras.mjs
import { createClient } from '@supabase/supabase-js'
import jitiFactory from 'jiti'
import { fileURLToPath } from 'url'
import fs from 'fs'
import path from 'path'
import os from 'os'

for (const l of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
const db = createClient(URL_BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// lib/linx.ts importa "server-only", que trava fora do Next: troca por um vazio.
const stub = path.join(os.tmpdir(), 'plm-server-only-stub.cjs')
fs.writeFileSync(stub, 'module.exports = {}')
const jiti = jitiFactory(fileURLToPath(import.meta.url), { alias: { '@': process.cwd(), 'server-only': stub }, interopDefault: true })
const { sincronizarVarianteCompras } = jiti('../lib/variante-compras-sync.ts')
const { sincronizarPedidosProducao } = jiti('../lib/pedidos-producao-sync.ts')
// --aplicar grava (como o botão): antes registra as entregas em pedidos_producao.
const aplicar = process.argv.includes('--aplicar')
if (aplicar) console.log('Entregas:', await sincronizarPedidosProducao(db))

const r = await sincronizarVarianteCompras(db, { gravar: aplicar })
console.log(aplicar ? 'GRAVADO.' : 'Simulação — nada gravado.')
console.log(`Pedidos (ref×cor×nº) em aberto no Linx: ${r.pedidosLinx}`)
console.log(`Variantes ${aplicar ? 'atualizadas' : 'que MUDARIAM'}: ${r.variantesAtualizadas}`)
console.log(`Slots zerados por pedido entregue: ${r.zeradasEntregues}`)
console.log(`Cores com mais de 2 pedidos em aberto: ${r.semEspaco.length}`, r.semEspaco.slice(0, 8))
console.log(`Cores do Linx sem cor na ficha: ${r.semVariante.length}`, r.semVariante.slice(0, 15))
const fmt = s => s.map(x => x.pedido || x.qtd != null ? `[${x.qtd ?? '—'} · ped ${x.pedido || '—'} · ${x.data || '—'}]` : '[vazio]').join(' ')
for (const e of r.exemplos || []) console.log(`\n${e.ref} ${e.cor}\n  antes : ${fmt(e.antes)}\n  depois: ${fmt(e.depois)}`)
