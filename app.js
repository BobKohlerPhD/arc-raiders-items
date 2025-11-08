// ---------- Utilities ----------
function showBanner(msg){ const b=document.getElementById('banner'); if(!b) return; b.innerHTML=msg; b.style.display='block'; }
const $ = s => document.querySelector(s);
const rowsEl = $('#tbody'), detailEl = $('#detail'), qEl = $('#q'), countBadge = $('#countBadge');

// FIXED: proper HTML escape map
function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => (
    {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]
  ));
}

// Optional: surface runtime errors in the banner so they’re obvious
window.addEventListener('error', (e)=>{
  const m = String(e?.error?.message || e?.message || 'Unknown error');
  const f = e?.filename ? ` <code>${e.filename}:${e.lineno||''}</code>` : '';
  showBanner(`⚠️ Script error: ${m}${f} — see Console for details.`);
});

// ---------- CSV/TSV parser ----------
function detectDelimiter(firstLine){
  if(firstLine.includes('\t')) return '\t';
  if(firstLine.includes(',')) return ',';
  if(firstLine.includes(';')) return ';';
  return ','; // default
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
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i+=2; continue; }
        q = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if(c === '"'){ q = true; i++; continue; }
    if(c === DELIM){ pushF(); i++; continue; }
    if(c === '\r'){ i++; continue; }
    if(c === '\n'){ pushF(); pushR(); i++; continue; }
    field += c; i++;
  }
  pushF(); pushR();

  if(rows.length && rows.at(-1).length===1 && rows.at(-1)[0]==='') rows.pop();
  if(!rows.length) return { header:[], rows:[], delimiter: DELIM };

  const header = rows[0].map(h=>h.trim());
  const objs = rows.slice(1).map(r=>{
    const o = {};
    header.forEach((h,idx)=>{ o[h] = (r[idx] ?? '').trim(); });
    return o;
  });
  return { header, rows: objs, delimiter: DELIM };
}

// ---------- Sample + normalize ----------
const SAMPLE = [
  { name:'Dog Collar', rarity:'Rare', category:'Special / Scrappy',
    uses:['Train Scrappy to Level 2'],
    recycle:{ safe:'Keep', outputs:['Fabric','Metal Parts'] },
    notes:'Needed for companion upgrade. Keep until upgrade complete.', sources:[] },
  { name:'ARC Alloy', rarity:'Uncommon', category:'Topside Material',
    uses:['Explosives/Medical/Utility Station I unlocks','Projects I ×80'],
    recycle:{ safe:'Yes', outputs:['Metal Parts ×2'] },
    notes:'Common mid-tier crafting material; keep a healthy stock early game.', sources:[] }
];

window.DATA = [];
window.FILTERED = [];
let selectedIndex = -1;

function normalize(arr){
  return (arr||[]).map(o=>({
    name: String(o.name||'').trim(),
    rarity: String(o.rarity||'').trim(),
    category: String(o.category||'').trim(),
    uses: Array.isArray(o.uses) ? o.uses.map(String)
         : String(o.uses||'').split(/[;|]/).map(s=>s.trim()).filter(Boolean),
    recycle: {
      safe: String(o.recycle_safe ?? (o.recycle && o.recycle.safe) ?? o.safe ?? '').trim(),
      outputs: Array.isArray(o.recycle?.outputs) ? o.recycle.outputs.map(String)
             : String(o.recycle_outputs ?? o.outputs ?? '').split(/[;|]/).map(s=>s.trim()).filter(Boolean)
    },
    notes: String(o.notes||'').trim(),
    sources: Array.isArray(o.sources) ? o.sources.map(String)
           : String(o.sources||'').split(/[;|]/).map(s=>s.trim()).filter(Boolean)
  })).filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name));
}

// ---------- Loaders ----------
async function tryLoadCSV(prevErr){
  try{
    const res = await fetch('items.csv', { cache:'no-store' });
    if(!res.ok) throw new Error('items.csv not found ('+res.status+')');
    const text = await res.text();
    const parsed = parseCSV(text);
    if(!parsed.header.length) throw new Error('CSV has no header row');
    console.log('[CSV] delimiter:', parsed.delimiter, 'header:', parsed.header);
    const arr = parsed.rows.map(r=>({
      name:r.name, rarity:r.rarity, category:r.category,
      uses:r.uses, recycle_safe:r.recycle_safe, recycle_outputs:r.recycle_outputs,
      notes:r.notes, sources:r.sources
    }));
    const n = normalize(arr);
    if(n.length){ window.DATA = n; showBanner('Loaded <b>'+n.length+'</b> items from <code>items.csv</code>.'); return; }
    showBanner('items.csv loaded but had 0 items.'); window.DATA = normalize(SAMPLE);
  }catch(err){
    console.warn('CSV load failed:', err, 'Previous:', prevErr);
    showBanner('Could not load <b>items.csv</b>. Using sample data.');
    window.DATA = normalize(SAMPLE);
  }
}

// MISSING BEFORE → now added: try items.json, then CSV
async function loadData(){
  try{
    const r = await fetch('items.json', { cache:'no-store' });
    if(!r.ok) throw new Error('items.json not found ('+r.status+')');
    const json = await r.json();
    const n = normalize(json);
    if(n.length){ window.DATA = n; showBanner('Loaded <b>'+n.length+'</b> items from <code>items.json</code>.'); }
    else { showBanner('items.json empty. Trying items.csv…'); await tryLoadCSV(); }
  }catch(e){
    await tryLoadCSV(e);
  }
  applyQueryFromURL();
  render();
}

// ---------- Search + render (table) ----------
function search(query){
  const q = (query||'').trim().toLowerCase();
  if(!q) return window.DATA;
  const terms = q.split(/\s+/);
  return window.DATA.filter(it => terms.every(t =>
    it.name.toLowerCase().includes(t) ||
    it.category.toLowerCase().includes(t) ||
    it.rarity.toLowerCase().includes(t) ||
    it.uses.join(' ').toLowerCase().includes(t) ||
    (it.recycle.safe||'').toLowerCase().includes(t) ||
    it.recycle.outputs.join(' ').toLowerCase().includes(t) ||
    it.notes.toLowerCase().includes(t)
  ));
}

function render(){
  const q = qEl.value || '';
  window.FILTERED = search(q);
  countBadge.textContent = `${window.FILTERED.length} item${window.FILTERED.length===1?'':'s'}`;
  rowsEl.innerHTML = '';
  selectedIndex = -1;

  if(!window.FILTERED.length){
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5; td.className = 'muted';
    td.textContent = 'No items match your search.';
    tr.appendChild(td); rowsEl.appendChild(tr);
    detailEl.innerHTML = '';
    return;
  }

  window.FILTERED.forEach((it, i)=>{
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.addEventListener('click', ()=>select(i));
    tr.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ select(i,true); } });

    const recycleClass =
      (it.recycle.safe||'').toLowerCase()==='yes' ? 'recycle-yes' :
      (it.recycle.safe||'').toLowerCase()==='no' ? 'recycle-no' : 'recycle-keep';

    tr.innerHTML = `
      <td><span class="item-name" data-idx="${i}">${escapeHtml(it.name)}</span></td>
      <td><span class="pill">${escapeHtml(it.rarity||'')}</span></td>
      <td><span class="pill">${escapeHtml(it.category||'')}</span></td>
      <td class="${recycleClass}">${escapeHtml(it.recycle.safe||'')}</td>
      <td>${escapeHtml((it.recycle.outputs||[]).join(', '))}</td>
    `;
    rowsEl.appendChild(tr);
  });

  if(window.FILTERED.length === 1){ select(0); }
}

function select(i, scrollDetail){
  selectedIndex = i;
  const it = window.FILTERED[i];
  if(!it){ detailEl.innerHTML=''; return; }

  const recycleClass =
    (it.recycle.safe||'').toLowerCase()==='yes' ? 'recycle-yes' :
    (it.recycle.safe||'').toLowerCase()==='no' ? 'recycle-no' : 'recycle-keep';

  const srcLinks = (it.sources||[]).map(s=>`<a href="${s}" target="_blank" rel="noopener">source</a>`).join(' · ');

  detailEl.innerHTML = `
    <h2>${escapeHtml(it.name)}</h2>
    <div class="kv"><b>Rarity</b><div>${escapeHtml(it.rarity||'')}</div></div>
    <div class="kv"><b>Category</b><div>${escapeHtml(it.category||'')}</div></div>
    <div class="kv"><b>Uses</b><div class="stack">${
      it.uses.length ? it.uses.map(u=>`<span class="pill">${escapeHtml(u)}</span>`).join(' ') : '<span class="muted">—</span>'
    }</div></div>
    <div class="kv"><b>Safe to recycle?</b><div class="${recycleClass}">${escapeHtml(it.recycle.safe||'')}</div></div>
    <div class="kv"><b>Recycles into</b><div>${escapeHtml((it.recycle.outputs||[]).join(', ') || '—')}</div></div>
    <div class="kv"><b>Notes</b><div>${escapeHtml(it.notes||'')}</div></div>
    <div class="kv"><b>Sources</b><div class="srcs">${srcLinks || '<span class="muted">—</span>'}</div></div>
    <div class="kv"><b>Link to this</b><div><a id="permalink" href="#">Copy link</a></div></div>
  `;

  const url = new URL(location);
  if(qEl.value){ url.searchParams.set('q', qEl.value); } else { url.searchParams.delete('q'); }
  url.hash = encodeURIComponent(it.name);
  history.replaceState(null, '', url);

  const linkEl = document.getElementById('permalink');
  linkEl.href = url.toString();
  linkEl.onclick = (e)=>{ e.preventDefault(); navigator.clipboard.writeText(url.toString()); linkEl.textContent='Copied!'; setTimeout(()=>linkEl.textContent='Copy link',1200); }
  if(scrollDetail) detailEl.scrollIntoView({behavior:'smooth', block:'start'});
}

function focusItem(i){ select(i,true); return false; }
window.focusItem = focusItem;

// ---------- Keyboard + search ----------
document.addEventListener('keydown', e=>{
  if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if(e.key==='ArrowDown'){ e.preventDefault(); if(selectedIndex < window.FILTERED.length-1) select(++selectedIndex); }
  if(e.key==='ArrowUp'){ e.preventDefault(); if(selectedIndex > 0) select(--selectedIndex); }
});

let t;
qEl.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>{ syncQueryToURL(); render(); }, 120); });
$('#clearBtn').addEventListener('click', ()=>{ qEl.value=''; syncQueryToURL(); render(); qEl.focus(); });

function syncQueryToURL(){
  const url = new URL(location);
  if(qEl.value){ url.searchParams.set('q', qEl.value); } else { url.searchParams.delete('q'); }
  history.replaceState(null, '', url);
}

function applyQueryFromURL(){
  const url = new URL(location);
  const q = url.searchParams.get('q') || '';
  const anchor = decodeURIComponent(location.hash.slice(1));
  if(q){ qEl.value = q; }
  window.FILTERED = search(qEl.value||'');
  if(anchor){
    const idx = window.FILTERED.findIndex(x=>x.name.toLowerCase()===anchor.toLowerCase());
    if(idx>=0) { select(idx); }
  }
}

// ---------- Downloads ----------
function toCSV(items){
  const header=['name','rarity','category','uses','safe_to_recycle','recycles_into','notes','sources'];
  const esc = s => '"'+String(s??'').replace(/"/g,'""')+'"';
  const rows = items.map(it=>[
    esc(it.name), esc(it.rarity), esc(it.category),
    esc((it.uses||[]).join('; ')), esc(it.recycle.safe||''),
    esc((it.recycle.outputs||[]).join('; ')), esc(it.notes||''),
    esc((it.sources||[]).join('; '))
  ].join(','));
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
$('#downloadCSV').addEventListener('click', ()=>{
  const csv = toCSV(window.FILTERED.length?window.FILTERED:window.DATA);
  download('arc-raiders-items.csv', csv, 'text/csv');
});
$('#downloadJSON').addEventListener('click', ()=>{
  download('arc-raiders-items.json', JSON.stringify(window.FILTERED.length?window.FILTERED:window.DATA, null, 2), 'application/json');
});

// ---------- Kickoff ----------
loadData();
