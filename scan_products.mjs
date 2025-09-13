// scan_products.mjs
// 用法：node scan_products.mjs "Archive/Untitled_design" > products.json
import fs from 'fs';
import path from 'path';

const dir = process.argv[2] || 'Archive/Untitled_design';
const allow = new Set(['.png','.jpg','.jpeg','.webp','.PNG','.JPG','.JPEG','.WEBP']);

function titleFromFilename(name){
  // 去掉扩展名，转为“暂定-xxx”可后续在后台改
  const base = name.replace(/\.[^.]+$/, '');
  return `暂定 - ${base}`;
}

const files = fs.readdirSync(dir)
  .filter(f => allow.has(path.extname(f)))
  .sort((a,b)=> a.localeCompare(b, 'zh-CN', {numeric:true}));

const products = files.map((file, idx) => ({
  id: `p_${idx+1}`,               // 前端用的简易 id（与数据库 id 分开）
  title_en: "TBD",
  title_zh_cn: titleFromFilename(file),
  title_zh_hk: titleFromFilename(file),
  price_cents: 0,                 // 先 0，后续在后台/CSV 再定价
  currency: "HKD",
  main_image_url: `${dir}/${file}`,
  images: [`${dir}/${file}`],
  // 分类等先留空
}));

console.log(JSON.stringify(products, null, 2));