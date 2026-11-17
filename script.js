const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

const normalize = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- Estado da navegação ----------
// view.mode: 'list' (lista de ferramentas de 1 categoria), 'detail' (1 ferramenta aberta) ou 'search'
const view = { mode: 'list', sectionId: null, tool: null, query: '' };

// Índice plano de todas as ferramentas (para a busca), montado uma vez a partir do GUIDE
const ALL_TOOLS = [];
function buildIndex() {
  GUIDE.sections.forEach(s => {
    s.groups.forEach(g => {
      g.items.forEach(it => {
        if (!it.a) return;
        let blob = (it.a + ' ' + it.d).toLowerCase();
        if (it.ex) blob += ' ' + (it.ex.cmd + ' ' + it.ex.does + ' ' + it.ex.for + ' ' + it.ex.when).toLowerCase();
        if (it.atk) blob += ' ' + it.atk.toLowerCase();
        if (it.params) it.params.forEach(grp => grp.rows.forEach(r => { blob += ' ' + (r.code + ' ' + r.meaning).toLowerCase(); }));
        ALL_TOOLS.push({ section: s, item: it, blob });
      });
    });
  });
}

// ---------- Sugestão por tarefa (inalterado) ----------
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

// ---------- Trechos de HTML reutilizados ----------
const exHTML = ex => `<div class="ex">
    <div class="exline"><span class="lbl">Comando</span><button class="cp" title="Clique para copiar"><code>${esc(ex.cmd)}</code></button></div>
    <div class="exline"><span class="lbl">O que faz</span><p>${fmt(ex.does)}</p></div>
    <div class="exline"><span class="lbl">Para que serve</span><p>${fmt(ex.for)}</p></div>
    <div class="exline"><span class="lbl">Quando usar</span><p>${fmt(ex.when)}</p></div>
  </div>`;

const paramsHTML = params => params.map(grp => `
  <div class="paramgrp">
    ${grp.section ? `<h4>${esc(grp.section)}</h4>` : ''}
    <table class="paramtable">
      <thead><tr><th>Código</th><th>Significado</th></tr></thead>
      <tbody>${grp.rows.map(r => `<tr><td><button class="paramcode" title="Clique para copiar"><code>${r.code}</code></button></td><td>${r.meaning}</td></tr>`).join('')}</tbody>
    </table>
  </div>`).join('');

// ---------- Lista de ferramentas de uma categoria (nova visão principal) ----------
function toolRowHTML(section, item, idx) {
  const q = (item.a + ' ' + item.d).toLowerCase();
  return `<li class="toolrow" data-q="${esc(q)}" data-sec="${section.id}" data-name="${esc(item.a)}">
    <span class="rank">${String(idx + 1).padStart(2, '0')}</span>
    <button class="toolname"><code>${esc(item.a)}</code></button>
    <span class="chev">›</span>
  </li>`;
}

function groupHTML(section, group) {
  const notes = group.items.filter(i => !i.a);
  const tools = group.items.filter(i => i.a);
  const notesHTML = notes.map(i => `<p class="note">${fmt(i.n)}</p>`).join('');
  const listHTML = tools.length ? `<ul class="toollist">${tools.map((i, idx) => toolRowHTML(section, i, idx)).join('')}</ul>` : '';
  return `<div class="grp">${group.name ? `<h3>${esc(group.name)}</h3>` : ''}${notesHTML}${listHTML}</div>`;
}

function renderCategoryList(section) {
  const n = section.groups.reduce((a, g) => a + g.items.filter(i => i.a).length, 0);
  return `
    <div class="cathead ${section.danger ? 'danger' : ''}">
      <h2>${section.icon} ${esc(section.title)}${section.isNew ? '<span class="tag">novo</span>' : ''}</h2>
      ${section.subtitle ? `<p class="catsub">${esc(section.subtitle)}</p>` : ''}
      ${n ? `<p class="catcount">${n} ferramenta${n === 1 ? '' : 's'}, da mais usada para a menos usada</p>` : ''}
    </div>
    ${section.groups.map(g => groupHTML(section, g)).join('')}
  `;
}

// ---------- Detalhe de 1 ferramenta ----------
function renderToolDetail(section, item) {
  const hasExtra = item.ex || item.params || item.atk;
  return `
    <button class="backbtn" data-back="${section.id}">← Voltar para ${section.icon} ${esc(section.title)}</button>
    <div class="toolhead ${section.danger ? 'danger' : ''}">
      <h2>${esc(item.a)} <span class="toolsuffix">— Lista de comandos e parâmetros</span></h2>
      <p class="toolsummary">${fmt(item.d)}</p>
    </div>
    ${item.atk ? `<div class="atkbox"><strong>🎯 Como seria usada num ataque (sempre autorizado):</strong> ${item.atk}</div>` : ''}
    ${item.ex ? `<h3 class="sech">Exemplo de uso</h3>${exHTML(item.ex)}` : ''}
    ${item.params ? `<h3 class="sech">Comandos e parâmetros</h3>${paramsHTML(item.params)}` : ''}
    ${!hasExtra ? `<p class="note">Ainda não há um exemplo de comando documentado para esta ferramenta — só a descrição acima. Pode ser um atalho do Kali, um instalador ou uma ferramenta gráfica sem uma linha de comando típica.</p>` : ''}
  `;
}

// ---------- Resultados de busca (lista plana entre todas as categorias) ----------
function renderSearchResults(q) {
  const nq = q.toLowerCase();
  const matches = ALL_TOOLS.filter(x => x.blob.includes(nq));
  if (!matches.length) return '';
  return `
    <div class="cathead">
      <h2>🔎 Resultados para "${esc(q)}"</h2>
      <p class="catcount">${matches.length} ferramenta${matches.length === 1 ? '' : 's'} encontrada${matches.length === 1 ? '' : 's'}</p>
    </div>
    <ul class="toollist searchlist">
      ${matches.map(x => `<li class="toolrow" data-sec="${x.section.id}" data-name="${esc(x.item.a)}">
        <span class="sectag">${x.section.icon}</span>
        <button class="toolname"><code>${esc(x.item.a)}</code></button>
        <span class="secname">${esc(x.section.title)}</span>
        <span class="chev">›</span>
      </li>`).join('')}
    </ul>
  `;
}

// ---------- Navegação lateral ----------
function renderNav() {
  $('#nav').innerHTML = GUIDE.sections.map(s => {
    const n = s.groups.reduce((a, g) => a + g.items.filter(i => i.a).length, 0);
    const cls = [s.id === 'redteam' ? 'redteam' : '', view.mode !== 'search' && view.sectionId === s.id ? 'on' : ''].filter(Boolean).join(' ');
    return `<a href="#" data-id="${s.id}" class="${cls}"><span>${s.icon}</span>${esc(s.title)}<em>${n || ''}</em></a>`;
  }).join('');
}

// ---------- Orquestração de render ----------
function findTool(sectionId, name) {
  const section = GUIDE.sections.find(s => s.id === sectionId);
  if (!section) return null;
  for (const g of section.groups) {
    const item = g.items.find(i => i.a === name);
    if (item) return { section, item };
  }
  return null;
}

function render() {
  document.title = GUIDE.title;
  renderNav();
  const content = $('#content');
  const empty = $('#empty');
  if (view.mode === 'search') {
    $('#sub').textContent = GUIDE.subtitle;
    const html = renderSearchResults(view.query);
    content.innerHTML = html;
    empty.hidden = !!html;
  } else if (view.mode === 'detail' && view.tool) {
    $('#sub').textContent = '';
    content.innerHTML = renderToolDetail(view.tool.section, view.tool.item);
    empty.hidden = true;
    content.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  } else {
    $('#sub').textContent = GUIDE.subtitle;
    const section = GUIDE.sections.find(s => s.id === view.sectionId) || GUIDE.sections[0];
    view.sectionId = section.id;
    content.innerHTML = renderCategoryList(section);
    empty.hidden = true;
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  hideFlyout(true);
}

function openCategory(id) {
  view.mode = 'list';
  view.sectionId = id;
  view.tool = null;
  view.query = '';
  $('#q').value = '';
  renderSuggest([]);
  render();
}

function openTool(sectionId, name) {
  const found = findTool(sectionId, name);
  if (!found) return;
  view.mode = 'detail';
  view.tool = found;
  render();
}

function doSearch(raw) {
  const q = raw.trim();
  const tasksFound = matchTasks(raw);
  renderSuggest(tasksFound);
  if (q.length < 2) {
    view.mode = 'list';
    view.query = '';
    render();
    return;
  }
  view.mode = 'search';
  view.query = q;
  render();
  $('#info').textContent = `${ALL_TOOLS.filter(x => x.blob.includes(q.toLowerCase())).length} resultado(s)`;
}

// ---------- Cópia para a área de transferência ----------
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

// ---------- Mini prévia (hover de 2s) ----------
let hoverTimer = null, closeTimer = null, openRow = null;
function showFlyout(row) {
  const name = row.dataset.name;
  const sec = row.dataset.sec;
  const found = findTool(sec, name);
  if (!found) return;
  const box = $('#flyout');
  box.innerHTML = `<strong>${esc(found.item.a)}</strong><p>${fmt(found.item.d)}</p>`;
  const r = row.getBoundingClientRect();
  box.hidden = false;
  box.style.top = (window.scrollY + r.bottom + 6) + 'px';
  box.style.left = Math.max(12, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - box.offsetWidth - 12)) + 'px';
  requestAnimationFrame(() => box.classList.add('show'));
  openRow = row;
}
function hideFlyout(instant) {
  const box = $('#flyout');
  box.classList.remove('show');
  openRow = null;
  const done = () => { box.hidden = true; box.innerHTML = ''; };
  if (instant) done(); else setTimeout(done, 180);
}
function wireHoverPreview(container) {
  container.querySelectorAll('.toolrow').forEach(row => {
    row.addEventListener('mouseenter', () => {
      clearTimeout(closeTimer);
      if (openRow === row) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => showFlyout(row), 2000);
    });
    row.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      if (openRow === row) {
        closeTimer = setTimeout(() => hideFlyout(), 2000);
      }
    });
  });
}

// ---------- Boot ----------
buildIndex();
render();
setTheme(store.get('tema') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

$('#q').addEventListener('input', e => doSearch(e.target.value));
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
$('#menuBtn').onclick = () => document.body.classList.toggle('menu');
$('#nav').addEventListener('click', e => {
  const a = e.target.closest('a[data-id]');
  document.body.classList.remove('menu');
  if (!a) return;
  e.preventDefault();
  openCategory(a.dataset.id);
});

$('#content').addEventListener('click', e => {
  const back = e.target.closest('.backbtn');
  if (back) { openCategory(back.dataset.back); return; }
  const row = e.target.closest('.toolrow .toolname, .toolrow');
  if (row) {
    const li = e.target.closest('.toolrow');
    openTool(li.dataset.sec, li.dataset.name);
    return;
  }
  const cp = e.target.closest('.app, .cp, .paramcode');
  if (cp) { copy(cp.querySelector('code').textContent); return; }
});

$('#suggest').addEventListener('click', e => {
  const b = e.target.closest('.task-tool');
  if (!b) return;
  const name = b.dataset.tool;
  const found = ALL_TOOLS.find(x => x.item.a === name);
  if (found) openTool(found.section.id, found.item.a);
});

document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if ((e.key === '/' && !typing) || (e.key === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); $('#q').focus(); }
  if (e.key === 'Escape') {
    if (view.mode === 'detail') { openCategory(view.tool.section.id); }
    else { $('#q').value = ''; doSearch(''); $('#q').blur(); }
  }
});

// Observa mudanças de conteúdo para ligar o hover de prévia sempre que a lista é redesenhada
new MutationObserver(() => wireHoverPreview($('#content'))).observe($('#content'), { childList: true });
