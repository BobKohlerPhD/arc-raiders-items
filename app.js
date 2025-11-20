const ASSET_VERSION = 'v8';

const $ = (s) => document.querySelector(s);
const qEl = $('#q');
const countBadge = $('#countBadge');

// --- UTILS ---
function bannerOk(msg){
  const b = document.getElementById('banner'); if(!b) return;
  b.style.display = 'none'; 
}
function bannerWarn(msg){
  const b = document.getElementById('banner'); if(!b) return;
  b.innerHTML = `<div style="background:var(--bad); color:#000; padding:10px; border-radius:4px; margin-bottom:20px; font-family:var(--font-tech); font-weight:bold;">${msg}</div>`;
  b.style.display = 'block';
}
window.addEventListener('error', (e)=>{
  const m = String(e?.error?.message || e?.message || 'Unknown error');
  bannerWarn(`SYSTEM ERROR: ${m}`);
});

function parseCSV(text){
  const nl = text.indexOf('\n');
  const headerLine = nl >= 0 ? text.slice(0,nl) : text;
  const DELIM = headerLine.includes('\t') ? '\t' : ',';
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

function normalize(arr){
  return arr.map(o=>({
    name: String(o.name||'').trim(),
    rarity: String(o.rarity||'').trim(),
    category: String(o.category||'').trim(),
    uses: String(o.uses||'').split(/[;|]/).map(s=>s.trim()).filter(Boolean),
    recycle: {
      safe: String(o.recycle_safe||'').trim() || 'Unknown',
      outputs: String(o.recycle_outputs||'').split(/[;|]/).map(s=>s.trim()).filter(Boolean)
    },
    notes: String(o.notes||'').trim(),
    sources: String(o.sources||'').split(/[;|]/).map(s=>s.trim()).filter(Boolean)
  })).filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name));
}

// --- LOAD ---
async function loadItems(){
  const csvUrl = `items.csv?${ASSET_VERSION}=${Date.now()}`;
  try{
    const res = await fetch(csvUrl, { cache:'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parsed = parseCSV(text);
    return { data: normalize(parsed.rows) };
  } catch(err){
    console.warn('CSV Load Fail:', err);
    return { data: [] }; // Return empty to trigger empty state
  }
}

// --- SEARCH ---
function search(q, data){
  const toks = String(q||'').toLowerCase().split(/\s+/).filter(Boolean);
  if(!toks.length) return data;
  return data.filter(it=>{
    const hay = [
      it.name, it.rarity, it.category,
      it.uses.join(' '), it.recycle.safe, it.recycle.outputs.join(' '),
      it.notes, it.sources.join(' ')
    ].join(' ').toLowerCase();
    return toks.every(t => hay.includes(t));
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}

let DATA = [];
let FILTERED = [];

function openDetail(rowEl, item){
  const rowsEl = $('#tbody');
  rowsEl.querySelectorAll('tr.detail-row').forEach(tr=>tr.remove());
  [...rowsEl.children].forEach(tr=>tr.classList.remove('is-selected'));
  rowEl.classList.add('is-selected');

  const dtr = document.createElement('tr');
  dtr.className = 'detail-row';
  const td = document.createElement('td');
  td.colSpan = 4; 
  
  td.innerHTML = `
    <div class="detail-wrapper">
      <div class="detail-main">
        <h3>${escapeHtml(item.name)}</h3>
        <div class="kv-row">
          <div class="kv-label">Usage Notes</div>
          <div class="kv-val">${escapeHtml(item.notes || 'No specific notes.')}</div>
        </div>
        <div class="kv-row">
           <div class="kv-label">Uses</div>
           <div class="kv-val">
             ${item.uses.length ? item.uses.map(u=>`• ${escapeHtml(u)}`).join('<br>') : '<span style="opacity:0.5">None listed</span>'}
           </div>
        </div>
      </div>
      <div class="detail-meta">
        <div class="kv-row">
          <div class="kv-label">Category</div>
          <div class="kv-val">${escapeHtml(item.category)}</div>
        </div>
        <div class="kv-row">
          <div class="kv-label">Recycle Safety</div>
          <div class="kv-val" style="font-weight:bold; color: var(--${item.recycle.safe==='Yes'?'good':(item.recycle.safe==='No'?'bad':'warn')})">
            ${escapeHtml(item.recycle.safe.toUpperCase())}
          </div>
        </div>
        <div class="kv-row">
          <div class="kv-label">Recycle Yield</div>
          <div class="kv-val">
            ${item.recycle.outputs.length ? item.recycle.outputs.map(o=>`<span class="pill out-pill">${escapeHtml(o)}</span>`).join('') : '—'}
          </div>
        </div>
      </div>
    </div>
  `;
  dtr.appendChild(td);
  rowsEl.insertBefore(dtr, rowEl.nextSibling);
}

function render(){
  const rowsEl = $('#tbody');
  const q = qEl ? qEl.value : '';
  FILTERED = search(q, DATA);
  
  if(countBadge) countBadge.textContent = `${FILTERED.length} ENTRIES FOUND`;
  rowsEl.innerHTML = '';

  if(!FILTERED.length){
    rowsEl.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:40px; color:#555;">NO DATA MATCHING QUERY "${escapeHtml(q)}"</td></tr>`;
    return;
  }

  FILTERED.forEach((it)=>{
    const tr = document.createElement('tr');
    tr.onclick = () => openDetail(tr, it);

    // 1. Name & Rarity
    const nameTd = document.createElement('td');
    nameTd.innerHTML = `
      <div class="item-name">${escapeHtml(it.name)}</div>
      <span class="pill r-${it.rarity.toLowerCase()}">${escapeHtml(it.rarity)}</span>
    `;

    // 2. Category
    const catTd = document.createElement('td');
    catTd.className = "hide-mob";
    catTd.textContent = it.category;

    // 3. Safe?
    const safeTd = document.createElement('td');
    let safeColor = it.recycle.safe === 'Yes' ? 'good' : (it.recycle.safe === 'No' ? 'bad' : 'warn');
    safeTd.innerHTML = `<span style="color:var(--${safeColor}); font-weight:bold;">${escapeHtml(it.recycle.safe.toUpperCase())}</span>`;

    // 4. Outputs
    const outTd = document.createElement('td');
    outTd.className = "hide-mob";
    if(it.recycle.outputs.length > 0){
        outTd.innerHTML = it.recycle.outputs.slice(0,2).map(o => `<span class="pill out-pill">${escapeHtml(o)}</span>`).join('');
        if(it.recycle.outputs.length > 2) outTd.innerHTML += `<span class="pill out-pill">+${it.recycle.outputs.length-2}</span>`;
    } else {
        outTd.innerHTML = '<span style="opacity:0.3">—</span>';
    }

    tr.appendChild(nameTd);
    tr.appendChild(catTd);
    tr.appendChild(safeTd);
    tr.appendChild(outTd);
    rowsEl.appendChild(tr);
  });
}

// --- EXPORT ---
function downloadCSV(){
  if(!FILTERED.length) return;
  const header = ['name','rarity','category','recycle_safe','notes'];
  const rows = FILTERED.map(it=>[it.name, it.rarity, it.category, it.recycle.safe, it.notes].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(','));
  const blob = new Blob([[header.join(','), ...rows].join('\n')], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='arc_raiders_data.csv'; a.click();
}

// --- INIT ---
async function start(){
  const {data} = await loadItems();
  DATA = data;
  render();
  if(qEl) qEl.addEventListener('input', render);
  $('#clearBtn').onclick = () => { qEl.value=''; render(); };
  $('#downloadCSV').onclick = downloadCSV;
}

document.addEventListener('DOMContentLoaded', start);
