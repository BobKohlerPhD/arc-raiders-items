
function showBanner(msg){ const b=document.getElementById('banner'); if(!b) return; b.innerHTML=msg; b.style.display='block'; }
const $ = s => document.querySelector(s);
const qEl = $('#q'), countBadge = $('#countBadge');


function getRowsEl(){ return document.getElementById('tbody'); }


function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}


window.addEventListener('error', (e)=>{
  const m = String(e?.error?.message || e?.message || 'Unknown error');
  const f = e?.filename ? ` <code>${e.filename}:${e.lineno||''}</code>` : '';
  showBanner(`⚠️ Script error: ${m}${f} — see Console for details.`);
});


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
  if(!rows.length) return { header:[], rows:[], delimiter: DELIM };

  const header = rows[0].map(h=>h.trim());
  const objs = rows.slice(1).map(r=>{
    const o = {};
    header.forEach((h,idx)=>{ o[h] = (r[idx] ?? '').trim(); });
    return o;
  });
  return { header, rows: objs, delimiter: DELIM };
}


const SAMPLE = [
  { name:'Dog Collar', rarity:'Rare', category:'Special / Scrappy',
    uses:['Train Scrappy to Level 2'],
    recycle:{ safe:'Keep', outputs:['Fabric','Metal Parts'] },
    notes:'Needed for companion upgrade. Keep until upgrade complete.', sources:[] },
  { name:'ARC Alloy', rarity:'Uncommon', category:'Topside Material',
    uses:['Explosives/Medical/Utility Station I unlocks','Projects I ×80'],
    recycle:{ safe:'Yes', outputs:['Metal Parts ×2'] },
    notes:'Common mid-tier crafting material.', sources:[] }
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


async function tryLoadCSV(prevErr){
  try{
    const res = await fetch('items.csv', { cache:'no-store' });
    if(!res.ok) throw new Error('items.csv not found ('+res.status+')');
    const text = await res.text();
    const parsed = parseCSV(text);
    if(!parsed.header.length) throw new Error('CSV has no header row');
    const arr = parsed.rows.map(r=>({
      name:r.name, rarity:r.rarity, category:r.category,
      uses:r.uses, recycle_safe:r.recycle_safe, recycle_outputs:r.recycle_outputs,
      notes:r.notes, sources:r.sources
    }));
    const n = normalize(arr);
    window.DATA = n.length ? n : normalize(SAMPLE);
    showBanner(`Loaded <b>${window.DATA.length}</b> items':'sample data'}</code>.`);
  }catch(err){
    console.warn('CSV load failed:', err, 'Previous:', prevErr);
    showBanner('Could not load <b>items.csv</b>. Using sample data.');
    window.DATA = normalize(SAMPLE);
  }
}
async function loadData(){
  try{
    const r = await fetch('items.json', { cache:'no-store' });
    if(!r.ok) throw new Error('items.json not found ('+r.status+')');
    const json = await r.json();
    const n = normalize(json);
    if(n.length){ window.DATA = n; showBanner('Loaded <b>'+n.length+'</b> items.'); }
    else { showBanner('items.json empty. Trying items.csv…'); await tryLoadCSV(); }
  }catch(e){
    await tryLoadCSV(e);
  }
  applyQueryFromURL();
  render();
}


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


function rarityClass(r){
  return ({
    'common':'r-common','uncommon':'r-uncommon','rare':'r-rare','epic':'r-epic','legendary':'r-legendary'
  }[(r||'').toLowerCase()]) || '';
}
function buildDetailHTML(it){
  const recycleClass =
    (it.recycle.safe||'').toLowerCase()==='yes' ? 'recycle-yes' :
    (it.recycle.safe||'').toLowerCase()==='no' ? 'recycle-no' : 'recycle-keep';
  const srcLinks = (it.sources||[]).map(s=>`<a href="${s}" target="_blank" rel="noopener">source</a>`).join(' · ');
  return `
    <h3>${escapeHtml(it.name)}</h3>
    <div class="kv"><b>Rarity</b><div>${escapeHtml(it.rarity||'')}</div></div>
    <div class="kv"><b>Category</b><div>${escapeHtml(it.category||'')}</div></div>
    <div class="kv"><b>Uses</b><div class="stack">${
      it.uses.length ? it.uses.map(u=>`<span class="pill">${escapeHtml(u)}</span>`).join(' ') : '<span class="muted">—</span>'
    }</div></div>
    <div class="kv"><b>Safe to recycle?</b><div class="${recycleClass}">${escapeHtml(it.recycle.safe||'')}</div></div>
    <div class="kv"><b>Recycles into</b><div>${escapeHtml((it.recycle.outputs||[]).join(', ') || '—')}</div></div>
    <div class="kv"><b>Notes</b><div>${escapeHtml(it.notes||'')}</div></div>
    <div class="kv"><b>Sources</b><div class="srcs">${srcLinks || '<span class="muted">—</span>'}</div></div>
  `;
}
function renderInlineDetail(idx){
  const rowsEl = getRowsEl(); if(!rowsEl) return;
  rowsEl.querySelectorAll('tr.detail-row').forEach(tr=>tr.remove());
  [...rowsEl.children].forEach((tr,i)=>tr.classList.toggle('is-selected', i===idx));
  if(idx < 0 || !window.FILTERED[idx]) return;

  const after = rowsEl.children[idx];
  const dtr = document.createElement('tr');
  dtr.className = 'detail-row';
  const td = document.createElement('td');
  td.colSpan = 5;
  td.innerHTML = buildDetailHTML(window.FILTERED[idx]);
  dtr.appendChild(td);

  if(after && after.nextSibling) rowsEl.insertBefore(dtr, after.nextSibling);
  else rowsEl.appendChild(dtr);
}


function render(){
  const rowsEl = getRowsEl();
  if(!rowsEl){
    console.warn('tbody#tbody not found; render deferred');
    return;
  }

  const q = qEl && qEl.value ? qEl.value : '';
  window.FILTERED = search(q);
  if(countBadge) countBadge.textContent = `${window.FILTERED.length} item${window.FILTERED.length===1?'':'s'}`;
  rowsEl.innerHTML = '';
  selectedIndex = -1;

  if(!window.FILTERED.length){
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5; td.className = 'muted';
    td.textContent = 'No items match your search.';
    tr.appendChild(td); rowsEl.appendChild(tr);
    return;
  }

  window.FILTERED.forEach((it, i)=>{
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.addEventListener('click', ()=>select(i));

    const rc =
      (it.recycle.safe||'').toLowerCase()==='yes' ? 'recycle-yes' :
      (it.recycle.safe||'').toLowerCase()==='no' ? 'recycle-no' : 'recycle-keep';

    tr.innerHTML = `
      <td><span class="item-name" data-idx="${i}">${escapeHtml(it.name)}</span></td>
      <td><span class="pill ${rarityClass(it.rarity)}">${escapeHtml(it.rarity||'')}</span></td>
      <td><span class="pill">${escapeHtml(it.category||'')}</span></td>
      <td class="${rc}">${escapeHtml(it.recycle.safe||'')}</td>
      <td>${escapeHtml((it.recycle.outputs||[]).join(', '))}</td>
    `;
    rowsEl.appendChild(tr);
  });

  document.querySelectorAll('.item-name').forEach(el=>{
    el.addEventListener('click', (ev)=>{ ev.stopPropagation(); select(Number(el.dataset.idx)); });
  });

  if(window.FILTERED.length === 1){ selectedIndex=0; renderInlineDetail(0); }
  else { renderInlineDetail(-1); }
}

function select(i){
  selectedIndex = i;
  const url = new URL(location);
  if(qEl && qEl.value){ url.searchParams.set('q', qEl.value); } else { url.searchParams.delete('q'); }
  history.replaceState(null, '', url);
  renderInlineDetail(i);
}


document.addEventListener('keydown', e=>{
  if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if(e.key==='ArrowDown'){ e.preventDefault(); if(selectedIndex < window.FILTERED.length-1) select(++selectedIndex); }
  if(e.key==='ArrowUp'){ e.preventDefault(); if(selectedIndex > 0) select(--selectedIndex); }
  if(e.key==='Enter' && selectedIndex>=0){ e.preventDefault(); select(selectedIndex); }
});

let t;
if(qEl){
  qEl.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>{ syncQueryToURL(); render(); }, 120); });
}
const clearBtn = document.getElementById('clearBtn');
if(clearBtn){
  clearBtn.addEventListener('click', ()=>{ if(qEl){ qEl.value=''; } syncQueryToURL(); render(); if(qEl) qEl.focus(); });
}

function syncQueryToURL(){
  const url = new URL(location);
  if(qEl && qEl.value){ url.searchParams.set('q', qEl.value); } else { url.searchParams.delete('q'); }
  history.replaceState(null, '', url);
}
function applyQueryFromURL(){
  const url = new URL(location);
  const q = url.searchParams.get('q') || '';
  if(qEl && q){ qEl.value = q; }
  window.FILTERED = search(q || '');
}


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
const btnCSV = document.getElementById('downloadCSV');
if(btnCSV){
  btnCSV.addEventListener('click', ()=>{
    const csv = toCSV(window.FILTERED.length?window.FILTERED:window.DATA);
    download('arc-raiders-items.csv', csv, 'text/csv');
  });
}
const btnJSON = document.getElementById('downloadJSON');
if(btnJSON){
  btnJSON.addEventListener('click', ()=>{
    download('arc-raiders-items.json', JSON.stringify(window.FILTERED.length?window.FILTERED:window.DATA, null, 2), 'application/json');
  });
}


function start(){
  applyQueryFromURL();
  loadData();
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', start);
}else{
  start();
}
