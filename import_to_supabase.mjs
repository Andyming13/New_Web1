
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Usage:
// 1) npm init -y && npm i @supabase/supabase-js csv-parse
// 2) node import_to_supabase.mjs products_import_template.csv
//
// Required env:
//   SUPABASE_URL=...
//   SUPABASE_SERVICE_ROLE=...   // service role key (keep secret; do NOT ship to client)
// Optional:
//   DEFAULT_CURRENCY=HKD

import { parse } from 'csv-parse'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'HKD'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in env.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

// Ensure categories exist and return a map slug->id
async function ensureCategories() {
  const slugs = ['cosmetics','care','electronics','food']
  const names = {
    cosmetics: { en: 'Cosmetics', zh_cn: '化妆品', zh_hk: '化妝品' },
    care: { en: 'Care', zh_cn: '护理品', zh_hk: '護理品' },
    electronics: { en: 'Electronics', zh_cn: '电子产品', zh_hk: '電子產品' },
    food: { en: 'Food', zh_cn: '食品', zh_hk: '食品' }
  }
  // read existing
  let { data: existing, error } = await supabase.from('categories').select('*')
  if (error) throw error
  const existingMap = new Map((existing||[]).map(r => [r.slug, r.id]))
  // insert missing
  for (const slug of slugs) {
    if (!existingMap.has(slug)) {
      const { data, error: insErr } = await supabase.from('categories').insert({
        slug,
        name_en: names[slug].en,
        name_zh_cn: names[slug].zh_cn,
        name_zh_hk: names[slug].zh_hk
      }).select()
      if (insErr) throw insErr
      existingMap.set(slug, data[0].id)
    }
  }
  return existingMap
}

function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = []
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', rec => rows.push(rec))
      .on('end', () => resolve(rows))
      .on('error', reject)
  })
}

async function main() {
  const csvFile = process.argv[2] || 'products_import_template.csv'
  if (!fs.existsSync(csvFile)) {
    console.error('CSV not found:', csvFile)
    process.exit(1)
  }
  const catMap = await ensureCategories()
  const rows = await readCSV(csvFile)

  let insertedProducts = 0, insertedInventory = 0
  for (const r of rows) {
    const price = Number(r.price_cents || 0)
    const currency = r.currency || DEFAULT_CURRENCY
    const category_id = catMap.get((r.category_slug||'').trim()) || null
    const payload = {
      title_en: r.title_en || '',
      title_zh_cn: r.title_zh_cn || '',
      title_zh_hk: r.title_zh_hk || '',
      description_en: r.description_en || '',
      description_zh_cn: r.description_zh_cn || '',
      description_zh_hk: r.description_zh_hk || '',
      price_cents: Number.isFinite(price) ? price : 0,
      currency,
      main_image_url: r.main_image_url || null,
      images: r.main_image_url ? [r.main_image_url] : [],
      category_id
    }

    const { data: prod, error: prodErr } = await supabase
      .from('products')
      .insert(payload)
      .select('id')
      .single()

    if (prodErr) {
      console.error('Insert product failed:', prodErr.message, payload.title_en)
      continue
    }
    insertedProducts++

    const inv = {
      product_id: prod.id,
      sku: (r.sku || '').trim() || null,
      stock: Number(r.stock || 0)
    }
    const { error: invErr } = await supabase.from('inventory').insert(inv)
    if (invErr) {
      console.error('Insert inventory failed:', invErr.message, inv)
    } else {
      insertedInventory++
    }
  }

  console.log('Done. Inserted products:', insertedProducts, 'inventory:', insertedInventory)
}

main().catch(e => { console.error(e); process.exit(1) })
