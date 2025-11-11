// Clear, unambiguous banner handling + robust CSV load
const ASSET_VERSION = 'v7';

const $ = (s) => document.querySelector(s);
const qEl = $('#q');
const countBadge = $('#countBadge');

function bannerOk(msg){
  const b = document.getElementById('banner'); if(!b) return;
  b.classList.add('ok'); b.innerHTML = msg; b.style.display = 'block';
  setTimeout(()=>{ if(b.classList.contains('ok')) b.style.display='none'; }, 2500);
}
function bannerWarn(msg){
  const b = document.getElementById('banner'); if(!b) return;
  b.classList.remove('ok'); b.innerHTML = msg; b.style.display = 'block';
}
window.addEventListener('error', (e)=>{
  const m = String(e?.error?.message || e?.message || 'Unknown error');
  const f = e?.filename ? ` <code>${e.filename}:${e.lineno||''}</code>` : '';
  bannerWarn(`⚠️ Script error: ${m}${f} — see Console for details.`);
});

// ---------- Lightweight CSV parser ----------
function detectDelimiter(firstLine){
  if(firstLine.includes('\t')) return '\t';
  if(firstLine.includes(','))  return ',';
  if(firstLine.includes(';'))  return ';';
  return ',';
}
function parseCSV(text){
  const nl = text.indexOf('\n');
  const headerLine = nl >= 0 ? text.slice(0,nl) : text;
  const DELIM = detectDelimiter(headerLine);

  const rows=[]; let row=[], field='', i=0, q=false;
  const pushF=()=>{ row.push(field); field=''; };
  const pushR=()=>{ rows.push(row); row=[]; };

  while(i<text.length){
    const c = text[i];
    if(q){
      if(c === '"'){ if(text[i+1] === '"'){ field+='"'; i+=2; continue; } q=false; i++; continue; }
      field += c; i++; continue;
    }
    if(c === '"'){ q=true; i++; continue; }
    if(c === DELIM){ pushF(); i++; continue; }
    if(c === '\r'){ i++; continue; }
    if(c === '\n'){ pushF(); pushR(); i++; continue; }
    field += c; i++;
  }
  pushF(); pushR();
  if(rows.length && rows.at(-1).length===1 && rows.at(-1)[0]==='') rows.pop();
  if(!rows.length) return { header:[], rows:[] };

  const header = rows[0].map(h=>h.trim());
  const objs = rows.slice(1).map(r=>{
    const o = {};
    header.forEach((h,idx)=>{ o[h] = (r[idx] ?? '').trim(); });
    return o;
  });
  return { header, rows: objs };
}

// ---------- Normalization ----------
function normalize(arr){
  return arr.map(o=>({
    name: String(o.name||'').trim(),
    rarity: String(o.rarity||'').trim(),
    category: String(o.category||'').trim(),
    uses: Array.isArray(o.uses) ? o.uses.map(String)
        : String(o.uses||'').split(/[;|]/).map(s=>s.trim()).filter(Boolean),
    recycle: {
      safe: String(o.recycle_safe||'').trim() || 'Unknown',
      outputs: Array.isArray(o.recycle_outputs) ? o.recycle_outputs.map(String)
            : String(o.recycle_outputs||'').split(/[;|]/).map(s=>s.trim()).filter(Boolean)
    },
    notes: String(o.notes||'').trim(),
    sources: Array.isArray(o.sources) ? o.sources.map(String)
           : String(o.sources||'').split(/[;|]/).map(s=>s.trim()).filter(Boolean)
  })).filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name));
}

// ---------- Data ----------
const SAMPLE = [
  { name:'Dog Collar', rarity:'Rare', category:'Special / Scrappy',
    uses:['Train Scrappy to Level 2'],
    recycle:{ safe:'Keep', outputs:['Fabric','Metal Parts'] },
    notes:'Needed for companion upgrade. Keep until upgrade complete.', sources:[] },
  { name:'ARC Alloy', rarity:'Uncommon', category:'Topside Material',
    uses:['Explosives/Medical/Utility Station I unlocks','Projects I ×80'],
    recycle:{ safe:'Yes', outputs:['ARC Slag'] },
    notes:'Base resource.', sources:['Topside nodes'] },
];

// Returns {data:Array, from:'csv'|'sample'}
async function loadItems(){
  // hard cache-bust for CSV
  const csvUrl = `items.csv?${ASSET_VERSION}=${Date.now()}`;
  try{
    const res = await fetch(csvUrl, { cache:'no-store' });
    if(!res.ok) throw new Error(`items.csv HTTP ${res.status}`);
    const text = await res.text();
    const parsed = parseCSV(text);
    if(!parsed.header.length) throw new Error('CSV has no header row');
    const n = normalize(parsed.rows);
    if(!n.length) throw new Error('CSV parsed but 0 usable rows');
    return { data: n, from: 'csv' };
  }catch(err){
    console.warn('CSV load failed, falling back to SAMPLE:', err);
    return { data: normalize(SAMPLE), from: 'sample' };
  }
}

// ---------- Search & render ----------
function tokenize(q){ return String(q||'').toLowerCase().split(/\s+/).filter(Boolean); }
function search(q, data){
  const toks = tokenize(q);
  if(!toks.length) return data;
  return data.filter(it=>{
    const hay = [
      it.name, it.rarity, it.category,
      (it.uses||[]).join(' '),
      it.recycle?.safe||'',
      (it.recycle?.outputs||[]).join(' '),
      it.notes||'',
      (it.sources||[]).join(' ')
    ].join(' ').toLowerCase();
    return toks.every(t => hay.includes(t));
  });
}
function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}
function getRowsEl(){ return document.getElementById('tbody'); }

let DATA = [];
let FILTERED = [];
let selectedIndex = -1;

function openDetail(rowEl, item){
  const rowsEl = getRowsEl(); if(!rowsEl) return;
  // close existing
  rowsEl.querySelectorAll('tr.detail-row').forEach(tr=>tr.remove());
  [...rowsEl.children].forEach(tr=>tr.classList.remove('is-selected'));
  rowEl.classList.add('is-selected');

  const dtr = document.createElement('tr');
  dtr.className = 'detail-row';
  const td = document.createElement('td');
  td.colSpan = 5;
  td.innerHTML = `
    <h3>${escapeHtml(item.name)}</h3>
    <div class="kv"><b>Rarity</b><div class="pill r-${(item.rarity||'').toLowerCase()}">${escapeHtml(item.rarity||'')}</div></div>
    <div class="kv"><b>Category</b><div>${escapeHtml(item.category||'')}</div></div>
    <div class="kv"><b>Uses</b><div class="stack">${(item.uses||[]).map(u=>`<span class="pill">${escapeHtml(u)}</span>`).join(' ')||'<span class="muted">—</span>'}</div></div>
    <div class="kv"><b>Recycle</b>
      <div>${item.recycle?.safe?`<span class="pill">${escapeHtml(item.recycle.safe)}</span>`:'<span class="muted">—</span>'}
      ${(item.recycle?.outputs||[]).length?`<div class="stack" style="margin-top:6px">${item.recycle.outputs.map(o=>`<span class="pill">${escapeHtml(o)}</span>`).join(' ')}</div>`:''}
      </div>
    </div>
    <div class="kv"><b>Notes</b><div>${escapeHtml(item.notes||'')}</div></div>
    <div class="kv"><b>Sources</b><div class="stack">${(item.sources||[]).map(s=>`<span class="pill">${escapeHtml(s)}</span>`).join(' ')||'<span class="muted">—</span>'}</div></div>
  `;
  dtr.appendChild(td);
  rowsEl.insertBefore(dtr, rowEl.nextSibling);
}

function render(){
  const rowsEl = getRowsEl(); if(!rowsEl) return;
  const q = qEl && qEl.value ? qEl.value : '';
  FILTERED = search(q, DATA);
  if(countBadge) countBadge.textContent = `${FILTERED.length} item${FILTERED.length===1?'':'s'}`;
  rowsEl.innerHTML = '';
  selectedIndex = -1;

  if(!FILTERED.length){
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5; td.className = 'muted';
    td.textContent = 'No items match your search.';
    tr.appendChild(td); rowsEl.appendChild(tr);
    return;
  }

  FILTERED.forEach((it, i)=>{
    const tr = document.createElement('tr');
    tr.tabIndex = 0;

    const nameTd = document.createElement('td');
    const a = document.createElement('a');
    a.className = 'item-name'; a.href='javascript:void(0)'; a.textContent = it.name;
    a.addEventListener('click', (e)=>{ e.preventDefault(); selectedIndex = i; openDetail(tr, it); });
    nameTd.appendChild(a);

    const rarityTd = document.createElement('td');
    rarityTd.innerHTML = `<span class="pill r-${(it.rarity||'').toLowerCase()}">${escapeHtml(it.rarity||'')}</span>`;
    const catTd = document.createElement('td'); catTd.textContent = it.category||'';
    const safeTd = document.createElement('td');
    safeTd.innerHTML = it.recycle?.safe ? `<span class="pill">${escapeHtml(it.recycle.safe)}</span>` : '<span class="muted">—</span>';
    const outTd = document.createElement('td');
    outTd.innerHTML = (it.recycle?.outputs||[]).length ? it.recycle.outputs.map(o=>`<span class="pill">${escapeHtml(o)}</span>`).join(' ') : '<span class="muted">—</span>';

    tr.appendChild(nameTd);
    tr.appendChild(rarityTd);
    tr.appendChild(catTd);
    tr.appendChild(safeTd);
    tr.appendChild(outTd);

    tr.addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){ selectedIndex = i; openDetail(tr, it); }
      if(e.key==='ArrowDown'){ e.preventDefault(); const next = tr.nextElementSibling; if(next) next.focus(); }
      if(e.key==='ArrowUp'){ e.preventDefault(); const prev = tr.previousElementSibling; if(prev) prev.focus(); }
    });

    rowsEl.appendChild(tr);
  });
}

// ---------- Export buttons ----------
function toCSV(arr){
  const header = ['name','rarity','category','uses','recycle_safe','recycle_outputs','notes','sources'];
  const rows = arr.map(it=>[
    it.name, it.rarity, it.category,
    (it.uses||[]).join('|'),
    (it.recycle?.safe||''),
    (it.recycle?.outputs||[]).join('|'),
    it.notes||'',
    (it.sources||[]).join('|')
  ].map(v=>`"${String(v).replace(/"/g,'""')}"`));
  return [header.join(','), ...rows].join('\n');
}
function download(filename, content, type){
  const blob = new Blob([content], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}
document.addEventListener('click', (e)=>{
  if(e.target && e.target.id === 'downloadCSV'){
    const src = (FILTERED && FILTERED.length) ? FILTERED : DATA;
    download('arc-raiders-items.csv', toCSV(src), 'text/csv');
  } else if(e.target && e.target.id === 'downloadJSON'){
    const src = (FILTERED && FILTERED.length) ? FILTERED : DATA;
    download('arc-raiders-items.json', JSON.stringify(src, null, 2), 'application/json');
  } else if(e.target && e.target.id === 'clearBtn'){
    if(qEl){ qEl.value=''; render(); qEl.focus(); }
  }
});

// ---------- Kickoff ----------
async function start(){
  // clear any old service workers
  if('serviceWorker' in navigator){ navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); }
  // load
  const {data, from} = await loadItems();
  DATA = data;
  if(from === 'csv'){
    bannerOk(`Loaded <b>${DATA.length}</b> items from <code>items.csv</code>.`);
  }else{
    bannerWarn(`Loaded <b>${DATA.length}</b> sample items (no <code>items.csv</code> found).`);
  }
  // initial render + search hook
  render();
  if(qEl){ qEl.addEventListener('input', render); }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', start);
}else{
  start();
}
