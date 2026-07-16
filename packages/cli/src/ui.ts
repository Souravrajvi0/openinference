// The control-plane lens (f3 Phase 2). A single self-contained page served by
// `oi serve` at `/`. No framework, no external assets — inline CSS/JS only, so the
// package stays dependency-free. Data comes from /api/* and /v1/*.

export const UI_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>oi — control plane</title>
<style>
  :root {
    --bg:#fff; --fg:#111; --dim:#666; --line:#e5e5e5; --card:#fafafa;
    --teal:#0a7d78; --green:#15803d; --amber:#b45309; --red:#b91c1c; --accent:#0a7d78;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0d0f10; --fg:#e8e8e8; --dim:#9aa0a6; --line:#23272a; --card:#15181a;
      --teal:#39d0c8; --green:#4ade80; --amber:#fbbf24; --red:#f87171; --accent:#39d0c8; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  header { padding:16px 20px; border-bottom:1px solid var(--line); display:flex;
    align-items:baseline; gap:12px; flex-wrap:wrap; }
  header h1 { font-size:16px; margin:0; color:var(--accent); letter-spacing:.5px; }
  header .meta { color:var(--dim); font-size:12px; }
  nav { display:flex; gap:4px; padding:8px 20px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
  nav button { background:none; border:1px solid transparent; color:var(--dim);
    padding:6px 12px; border-radius:6px; cursor:pointer; font:inherit; }
  nav button.active { color:var(--fg); background:var(--card); border-color:var(--line); }
  main { padding:20px; max-width:1000px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px; margin-bottom:12px; }
  table { width:100%; border-collapse:collapse; }
  th,td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); font-size:13px; }
  th { color:var(--dim); font-weight:600; }
  .tag { display:inline-block; padding:1px 7px; border-radius:99px; font-size:11px; border:1px solid var(--line); }
  .ok{color:var(--green)} .warn{color:var(--amber)} .bad{color:var(--red)} .dim{color:var(--dim)}
  .badge-inst{color:var(--green);border-color:var(--green)}
  input,select,textarea { background:var(--bg); color:var(--fg); border:1px solid var(--line);
    border-radius:6px; padding:8px; font:inherit; width:100%; }
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  button.go{background:var(--accent);color:#001;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font:inherit;font-weight:600}
  #pgout{white-space:pre-wrap;min-height:120px;margin-top:10px;padding:12px;background:var(--bg);border:1px solid var(--line);border-radius:6px}
  .muted{color:var(--dim);font-size:12px}
  .hidden{display:none}
</style>
</head>
<body>
<header>
  <h1>oi</h1><span class="meta" id="hdr">control plane</span>
</header>
<nav>
  <button data-tab="monitor" class="active">Monitor</button>
  <button data-tab="catalog">Catalog</button>
  <button data-tab="doctor">Doctor</button>
  <button data-tab="play">Playground</button>
</nav>
<main>
  <section id="monitor"></section>
  <section id="catalog" class="hidden"></section>
  <section id="doctor" class="hidden"></section>
  <section id="play" class="hidden"></section>
</main>
<script>
const $ = (s,r=document)=>r.querySelector(s);
const el = (h)=>{const d=document.createElement('div');d.innerHTML=h.trim();return d.firstChild;};
async function j(u,o){const r=await fetch(u,o);return r.json();}
let tab='monitor', timer=null;

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  tab=b.dataset.tab;
  document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));
  ['monitor','catalog','doctor','play'].forEach(t=>$('#'+t).classList.toggle('hidden',t!==tab));
  if(timer){clearInterval(timer);timer=null;}
  render();
});

async function render(){
  if(tab==='monitor') return renderMonitor();
  if(tab==='catalog') return renderCatalog();
  if(tab==='doctor') return renderDoctor();
  if(tab==='play') return renderPlay();
}

async function renderMonitor(){
  const box=$('#monitor');
  const paint=async()=>{
    const [s,run]=await Promise.all([j('/api/status'),j('/api/running')]);
    $('#hdr').textContent = (s.runtimeVersion?('runtime '+s.runtime+' '+s.runtimeVersion):'runtime '+s.runtime)+' · ctx '+s.numCtx;
    const rows=(run||[]).map(m=>{
      const vram = m.sizeVram>0 ? (m.sizeVram===m.size?'GPU':'partial') : 'CPU';
      const cls = vram==='GPU'?'ok':vram==='CPU'?'warn':'warn';
      return '<tr><td>'+m.name+'</td><td>'+ (m.size/1073741824).toFixed(1)+' GB</td><td class="'+cls+'">'+vram+'</td></tr>';
    }).join('');
    box.innerHTML='<div class="card"><b>Hardware</b><div class="muted">'+s.hardware+'</div>'
      +'<div class="muted">active model: '+(s.model||'none')+'</div></div>'
      +'<div class="card"><b>Loaded models</b>'
      +(rows?'<table><tr><th>model</th><th>size</th><th>where</th></tr>'+rows+'</table>'
            :'<div class="muted" style="margin-top:8px">Nothing loaded right now.</div>')+'</div>';
  };
  await paint();
  timer=setInterval(paint,2500);
}

async function renderCatalog(){
  const box=$('#catalog');
  box.innerHTML='<div class="card"><input id="q" placeholder="filter models…"/></div><div id="clist" class="card">loading…</div>';
  const data=await j('/api/catalog');
  const draw=(f='')=>{
    const rows=data.filter(m=>!f|| (m.id+' '+(m.categories||[]).join(' ')).includes(f))
      .slice(0,80).map(m=>{
      const inst=m.installed?'<span class="tag badge-inst">installed</span>':'<span class="tag dim">available</span>';
      const sp=m.speed?('<span class="'+(m.speed.tier==='fast'?'ok':m.speed.tier==='ok'?'':'warn')+'">~'+m.speed.low+'–'+m.speed.high+' tok/s</span>'):'';
      return '<tr><td>'+m.id+'</td><td>'+inst+'</td><td>'+(m.sizeMb>=1000?(m.sizeMb/1024).toFixed(1)+' GB':m.sizeMb+' MB')+'</td><td>'+m.quality+'</td><td>'+sp+'</td><td class="dim">'+(m.categories||[]).join(', ')+'</td></tr>';
    }).join('');
    $('#clist').innerHTML='<table><tr><th>model</th><th></th><th>size</th><th>q</th><th>speed (est)</th><th>best for</th></tr>'+rows+'</table>';
  };
  draw();
  $('#q').oninput=e=>draw(e.target.value.toLowerCase());
}

let doctorCache=null;
function paintDoctor(box,r){
  const g={ok:'✓',warn:'⚠',fail:'✕',info:'·',skip:'·'};
  const cls={ok:'ok',warn:'warn',fail:'bad',info:'dim',skip:'dim'};
  box.innerHTML='<div class="card">'+r.checks.map(c=>
    '<div><span class="'+cls[c.status]+'">'+g[c.status]+'</span> <b>'+c.label+'</b> — '+c.value
    +(c.fix?'<div class="muted" style="margin:2px 0 8px 18px">'+c.fix+'</div>':'')+'</div>'
  ).join('')
  +'<div class="row" style="margin-top:10px"><button class="go" id="drerun">Run again</button></div></div>';
  $('#drerun').onclick=()=>{doctorCache=null;renderDoctor();};
}
async function renderDoctor(){
  const box=$('#doctor');
  if(doctorCache){paintDoctor(box,doctorCache);return;}
  // The checks include a real test generation — do NOT auto-fire it on tab
  // click; on a CPU box it can take a minute and looks like a hang.
  box.innerHTML='<div class="card"><div class="row"><button class="go" id="drun">Run checks</button>'
    +'<span class="muted">includes a quick test generation — can take a minute on CPU</span></div></div>';
  $('#drun').onclick=async()=>{
    const b=$('#drun'); b.disabled=true; b.textContent='Running… (loading + testing the model)';
    try{ doctorCache=await j('/api/doctor'); paintDoctor(box,doctorCache); }
    catch(e){ b.disabled=false; b.textContent='Run checks'; }
  };
}

async function renderPlay(){
  const box=$('#play');
  const models=await j('/v1/models');
  const opts=(models.data||[]).map(m=>'<option>'+m.id+'</option>').join('');
  box.innerHTML='<div class="card"><div class="row"><select id="pgm" style="max-width:260px">'+opts+'</select></div>'
    +'<textarea id="pgi" rows="3" placeholder="Ask something…" style="margin-top:8px"></textarea>'
    +'<div class="row" style="margin-top:8px"><button class="go" id="pgs">Send</button><span class="muted" id="pgt"></span></div>'
    +'<div id="pgout"></div></div>';
  $('#pgs').onclick=async()=>{
    const out=$('#pgout'); out.textContent=''; const t0=Date.now(); let n=0;
    const body={model:$('#pgm').value,messages:[{role:'user',content:$('#pgi').value}],stream:true};
    const r=await fetch('/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const rd=r.body.getReader(); const dec=new TextDecoder(); let buf='';
    for(;;){const {done,value}=await rd.read(); if(done)break; buf+=dec.decode(value,{stream:true});
      const parts=buf.split('\n\n'); buf=parts.pop();
      for(const p of parts){const line=p.replace(/^data: /,'').trim(); if(!line||line==='[DONE]')continue;
        try{const e=JSON.parse(line); const d=e.choices?.[0]?.delta?.content; if(d){out.textContent+=d;n++;} if(e.error){out.textContent+='\n[error] '+e.error.message;}}catch{}}
      const secs=(Date.now()-t0)/1000; $('#pgt').textContent=secs>0?Math.round(n/secs)+' tok/s':'';
    }
  };
}

render();
</script>
</body>
</html>`;
