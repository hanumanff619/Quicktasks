// QuickTasks PWA
let tasks = JSON.parse(localStorage.getItem('qt_tasks')||'[]');
let filterMode = 'all';
let deferredPrompt = null;

const el = id => document.getElementById(id);
const list = el('list');
const title = el('title');
const tags = el('tags');
const due = el('due');
const prio = el('prio');
const search = el('search');

function save(){ localStorage.setItem('qt_tasks', JSON.stringify(tasks)); render(); }

function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }

function addTask(){
  const t = title.value.trim();
  if(!t) return;
  const tagList = tags.value.split(',').map(s=>s.trim()).filter(Boolean);
  const item = {
    id: uid(),
    title: t,
    tags: tagList,
    createdAt: Date.now(),
    due: due.value || null,
    prio: prio.value,
    done: false
  };
  tasks.unshift(item);
  title.value=''; tags.value=''; due.value='';
  save();
}

function matchesFilter(task){
  const q = search.value.trim().toLowerCase();
  // search query terms
  let ok = true;
  if(q){
    const parts = q.split(/\s+/);
    ok = parts.every(p=>{
      if(p.startsWith('#')){
        return task.tags.map(t=>t.toLowerCase()).includes(p.slice(1));
      }
      if(p==='!high'){ return task.prio==='high'; }
      return task.title.toLowerCase().includes(p);
    });
  }
  if(!ok) return false;
  if(filterMode==='open') return !task.done;
  if(filterMode==='done') return task.done;
  if(filterMode==='today'){
    if(!task.due) return false;
    const d = new Date(task.due);
    const now = new Date();
    return d.toDateString()===now.toDateString();
  }
  if(filterMode==='overdue'){
    if(!task.due) return false;
    return !task.done && new Date(task.due) < new Date();
  }
  return true;
}

function render(){
  const frag = document.createDocumentFragment();
  const filtered = tasks.filter(matchesFilter);
  filtered.forEach(task=>{
    const row = document.createElement('div');
    row.className = 'task' + (task.done ? ' done' : '');
    const left = document.createElement('div');
    left.style.flex='1';
    const title = document.createElement('div');
    title.textContent = task.title;
    const meta = document.createElement('div');
    meta.className='muted';
    const bits = [];
    bits.push('prio: '+task.prio);
    if(task.due){ bits.push('due: '+ new Date(task.due).toLocaleString()); }
    if(task.tags.length){ bits.push(task.tags.map(t=>'#'+t).join(' ')); }
    meta.textContent = bits.join('  •  ');
    left.appendChild(title); left.appendChild(meta);

    const right = document.createElement('div');
    right.className='row-center';
    const toggle = document.createElement('button');
    toggle.textContent = task.done ? '↩︎' : '✓';
    toggle.onclick = ()=>{ task.done = !task.done; save(); };
    const edit = document.createElement('button');
    edit.textContent = '✎';
    edit.title = 'Edit title';
    edit.onclick = ()=>{
      const nv = prompt('Edit task title:', task.title);
      if(nv!==null){ task.title = nv.trim(); save(); }
    };
    const del = document.createElement('button');
    del.textContent = '🗑';
    del.onclick = ()=>{
      tasks = tasks.filter(x=>x.id!==task.id);
      save();
    };
    right.append(toggle, edit, del);

    row.append(left, right);
    frag.appendChild(row);
  });
  list.innerHTML='';
  list.appendChild(frag);
  updateStats();
}

function updateStats(){
  const total = tasks.length;
  const done = tasks.filter(t=>t.done).length;
  const open = total - done;
  document.getElementById('stats').textContent = `${open} open • ${done} done • ${total} total`;
}

document.addEventListener('keydown', (e)=>{
  if(e.key==='Enter' && document.activeElement===title){ addTask(); }
});

document.getElementById('addBtn').onclick = addTask;
document.querySelectorAll('[data-filter]').forEach(btn=>{
  btn.onclick = ()=>{ filterMode = btn.dataset.filter; render(); };
});
document.getElementById('clearBtn').onclick = ()=>{
  tasks = tasks.filter(t=>!t.done);
  save();
};
search.oninput = render;

// Focus timer
let focusTimer = null;
let focusEnd = 0;
function tick(){
  const remain = Math.max(0, Math.floor((focusEnd - Date.now())/1000));
  if(remain<=0){
    clearInterval(focusTimer); focusTimer=null;
    document.getElementById('focusStatus').textContent = 'Done 🎉';
    if('Notification' in window && Notification.permission==='granted'){
      navigator.serviceWorker?.ready.then(reg=>{
        reg.showNotification('Focus complete!', { body: 'Nice work.', icon: 'icons/icon-192.png' });
      });
    }
    return;
  }
  const m = String(Math.floor(remain/60)).padStart(2,'0');
  const s = String(remain%60).padStart(2,'0');
  document.getElementById('focusStatus').textContent = `Time left: ${m}:${s}`;
}
document.getElementById('startFocus').onclick = async ()=>{
  const mins = parseInt(document.getElementById('focusMins').value||'25',10);
  focusEnd = Date.now() + mins*60*1000;
  if('Notification' in window){
    const perm = await Notification.requestPermission();
    // continue regardless; scheduled notifications need the app open
  }
  if(focusTimer) clearInterval(focusTimer);
  focusTimer = setInterval(tick, 500);
  tick();
};
document.getElementById('stopFocus').onclick = ()=>{
  if(focusTimer) clearInterval(focusTimer);
  focusTimer=null; document.getElementById('focusStatus').textContent='Idle';
};

// Export / Import
document.getElementById('exportBtn').onclick = ()=>{
  const blob = new Blob([JSON.stringify(tasks,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'quicktasks-export.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
};
document.getElementById('importFile').onchange = async (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const text = await file.text();
  try{
    const arr = JSON.parse(text);
    if(Array.isArray(arr)){ tasks = arr; save(); }
    else alert('Invalid file');
  }catch(err){ alert('Invalid JSON'); }
};

// PWA install flow
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault(); deferredPrompt = e;
  document.getElementById('installBtn').style.display='inline-block';
});
document.getElementById('installBtn').onclick = async ()=>{
  if(deferredPrompt){
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  } else {
    alert('To install, open menu ••• and choose "Add to Home screen".');
  }
};

// Register SW
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js');
  });
}

render();
