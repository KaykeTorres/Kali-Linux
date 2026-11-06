const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

const normalize = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function matchTasks(rawQ) {
  const q = normalize(rawQ || '').trim();
  if (q.length < 3) return [];
  const scored = [];
  (typeof TASKS !== 'undefined' ? TASKS : []).forEach(t => {
    let best = 0;
    t.q.forEach(syn => {
      const ns = normalize(syn);
      if (q === ns) best = Math.max(best, 3);
      else if (q.includes(ns) || ns.includes(q)) best = Math.max(best, 2);
    });
    if (best > 0) scored.push({ t, score: best });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, 2).map(x => x.t);
}

function renderSuggest(tasks) {
  const box = $('#suggest');
  if (!box) return;
  if (!tasks.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = tasks.map(t => `<div class="sugitem">
    <div class="sugtitle">💡 ${esc(t.title)}</div>
    <div class="sugtools">${t.tools.map(tool => `<button class="task-tool" data-tool="${esc(tool)}">${esc(tool.split(' / ')[0])}</button>`).join('')}</div>
    <p class="sugtip">${fmt(t.tip)}</p>
  </div>`).join('');
}

const exHTML = ex => `<div class="ex">
    <div class="exline"><span class="lbl">Comando</span><button class="cp" title="Clique para copiar"><code>${esc(ex.cmd)}</code></button></div>
    <div class="exline"><span class="lbl">O que faz</span><p>${fmt(ex.does)}</p></div>
    <div class="exline"><span class="lbl">Para que serve</span><p>${fmt(ex.for)}</p></div>
    <div class="exline"><span class="lbl">Quando usar</span><p>${fmt(ex.when)}</p></div>
  </div>`;

const itemHTML = i => {
  if (i.a) {
    const q = (i.a + ' ' + i.d + ' ' + (i.ex ? i.ex.cmd + ' ' + i.ex.does + ' ' + i.ex.for + ' ' + i.ex.when : '')).toLowerCase();
    return `<div class="rowgrp" data-q="${esc(q)}">
      <div class="row"><button class="app" title="Clique para copiar o nome"><code>${esc(i.a)}</code></button><p>${fmt(i.d)}</p></div>
      ${i.ex ? exHTML(i.ex) : ''}
    </div>`;
  }
  return `<p class="note" data-q="${esc(i.n.toLowerCase())}">${fmt(i.n)}</p>`;
};

const secHTML = s => `<section id="${s.id}" class="${s.danger ? 'danger' : ''}">
  <h2>${s.icon} ${esc(s.title)}${s.isNew ? '<span class="tag">novo</span>' : ''}</h2>
  ${s.groups.map(g => `<div class="grp">${g.name ? `<h3>${esc(g.name)}</h3>` : ''}${g.items.map(itemHTML).join('')}</div>`).join('')}
</section>`;

function render() {
  document.title = GUIDE.title;
  $('#sub').textContent = GUIDE.subtitle;
  $('#nav').innerHTML = GUIDE.sections.map(s => {
    const n = s.groups.reduce((a, g) => a + g.items.filter(i => i.a).length, 0);
  const nEx = s.groups.reduce((a, g) => a + g.items.filter(i => i.ex).length, 0);
    return `<a href="#${s.id}" data-id="${s.id}"><span>${s.icon}</span>${esc(s.title)}<em>${n || ''}</em></a>`;
  }).join('');
  $('#content').innerHTML = GUIDE.sections.map(secHTML).join('');
}

function filter() {
  const q = $('#q').value.trim().toLowerCase();
  const tasksFound = matchTasks($('#q').value);
  renderSuggest(tasksFound);
  let n = 0;
  document.querySelectorAll('section').forEach(s => {
    let any = 0;
    s.querySelectorAll('.grp').forEach(g => {
      let vis = 0;
      g.querySelectorAll('[data-q]').forEach(e => {
        const ok = !q || e.dataset.q.includes(q);
        e.hidden = !ok;
        if (ok) { vis++; if (q && e.classList.contains('rowgrp')) n++; }
      });
      g.hidden = !vis;
      any += vis;
    });
    s.hidden = !any;
    const a = $(`#nav a[data-id="${s.id}"]`);
    if (a) a.hidden = !any;
  });
  $('#info').textContent = q ? `${n} resultado(s)` : '';
  $('#empty').hidden = !q || !!$('section:not([hidden])') || tasksFound.length > 0;
}

function copy(text) {
  const done = () => {
    const t = $('#toast'); t.classList.add('show');
    clearTimeout(t.timer); t.timer = setTimeout(() => t.classList.remove('show'), 1200);
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallback());
  else fallback();
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    ta.remove();
  }
}

function setTheme(t) { document.documentElement.dataset.theme = t; store.set('tema', t); }

render();
setTheme(store.get('tema') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

$('#q').addEventListener('input', filter);
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
$('#menuBtn').onclick = () => document.body.classList.toggle('menu');
$('#nav').onclick = () => document.body.classList.remove('menu');

$('#content').addEventListener('click', e => {
  const b = e.target.closest('.app, .cp');
  if (!b) return;
  copy(b.querySelector('code').textContent);
});

$('#suggest').addEventListener('click', e => {
  const b = e.target.closest('.task-tool');
  if (!b) return;
  $('#q').value = b.dataset.tool;
  filter();
  const row = document.querySelector('.rowgrp:not([hidden])');
  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1500);
  }
});

document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if ((e.key === '/' && !typing) || (e.key === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); $('#q').focus(); }
  if (e.key === 'Escape') { $('#q').value = ''; filter(); $('#q').blur(); }
});

// Destaca no menu a seção que está na tela
const io = new IntersectionObserver(es => es.forEach(en => {
  if (en.isIntersecting) {
    document.querySelectorAll('#nav a.on').forEach(a => a.classList.remove('on'));
    const a = $(`#nav a[data-id="${en.target.id}"]`);
    if (a) { a.classList.add('on'); a.scrollIntoView({ block: 'nearest' }); }
  }
}), { rootMargin: '-15% 0px -75% 0px' });
document.querySelectorAll('section').forEach(s => io.observe(s));
