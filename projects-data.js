// Shared loader for JSON-driven project content. Drop a new project by
// adding <slug>.json to projects-data/ and listing the slug in manifest.json.
async function loadProjects() {
  const manifest = await fetch('projects-data/manifest.json').then(r => r.json());
  const projects = await Promise.all(
    manifest.map(slug => fetch(`projects-data/${slug}.json`).then(r => r.json()))
  );
  return projects;
}

// Returns a project field in the given language, falling back to English.
// field can be a top-level key (location, type, scope) or a detail key (tagline, narrative).
function pf(project, lang, field) {
  const loc = project.i18n && project.i18n[lang];
  if (loc && loc[field] !== undefined) return loc[field];
  return field === 'tagline' || field === 'narrative' ? project.detail[field] : project[field];
}

function currentLang() { return localStorage.getItem('site-lang') || 'en'; }

// UI-chrome translation: add a new language by dropping i18n/<code>.json and
// listing it in i18n/manifest.json — no code changes needed elsewhere.
async function wireLangSelector() {
  const mount = document.getElementById('lang-toggle-btn');
  if (!mount) return;
  const manifest = await fetch('i18n/manifest.json').then(r => r.json()).catch(() => [{ code: 'en', label: 'English' }]);
  const enDict = await fetch('i18n/en.json').then(r => r.json()).catch(() => ({}));
  const cache = { en: enDict };
  async function getDict(code) {
    if (!cache[code]) cache[code] = await fetch(`i18n/${code}.json`).then(r => r.json()).catch(() => ({}));
    return cache[code];
  }

  const select = document.createElement('select');
  select.id = 'lang-select';
  select.setAttribute('aria-label', 'Choose language');
  select.style.cssText = 'font-family:var(--font-body); font-weight:600; font-size:13px; letter-spacing:0.02em; border:1px solid var(--color-divider); background:var(--color-bg); color:var(--color-text); border-radius:999px; padding:6px 28px 6px 14px; cursor:pointer; appearance:none; -webkit-appearance:none; background-image:url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="%23201e1d" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>\'); background-repeat:no-repeat; background-position:right 8px center;';
  manifest.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.code;
    opt.textContent = l.label;
    select.appendChild(opt);
  });
  mount.replaceWith(select);

  async function apply(lang) {
    document.documentElement.setAttribute('lang', lang);
    select.value = lang;
    const dict = lang === 'en' ? enDict : await getDict(lang);
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const val = dict[key] ?? enDict[key];
      if (val !== undefined) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      const val = dict[key] ?? enDict[key];
      if (val !== undefined) el.setAttribute('placeholder', val);
    });
    document.dispatchEvent(new CustomEvent('sitelangchange', { detail: { lang } }));
  }
  let lang = currentLang();
  await apply(lang);
  window.__applyLangTranslation = apply;
  select.addEventListener('change', () => {
    lang = select.value;
    localStorage.setItem('site-lang', lang);
    apply(lang);
  });
}

function wireSiteSearch(projects) {
  const searchIndex = [
    { label: 'Work — Selected projects', href: 'index.html#work' },
    { label: 'Studio — Our approach', href: 'index.html#studio' },
    { label: 'Services — What we do', href: 'index.html#services' },
    { label: 'Contact — Get in touch', href: 'index.html#contact' },
    { label: 'Residential Design', href: 'index.html#services' },
    { label: 'Renovations', href: 'index.html#services' },
    { label: 'Interior Architecture', href: 'index.html#services' },
    { label: 'Planning & Permits', href: 'index.html#services' },
    { label: 'All projects (browse & filter)', href: 'work.html' },
    ...projects.map(p => ({ label: `${p.name} — ${p.location}`, href: `project-detail.html?slug=${p.slug}` })),
  ];

  const overlay = document.getElementById('search-overlay');
  const btn = document.getElementById('nav-search-btn');
  const input = document.getElementById('site-search-input');
  const results = document.getElementById('site-search-results');
  if (!overlay || !btn) return;

  let activeIndex = -1;
  let currentMatches = [];

  function highlight() {
    [...results.children].forEach((el, i) => {
      const active = i === activeIndex;
      el.classList.toggle('is-active', active);
      el.style.background = active ? 'var(--color-surface)' : 'transparent';
      if (active) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function renderResults(q) {
    const query = q.trim().toLowerCase();
    const matches = query ? searchIndex.filter(i => i.label.toLowerCase().includes(query)) : searchIndex;
    currentMatches = matches;
    activeIndex = matches.length ? 0 : -1;
    results.innerHTML = matches.length
      ? matches.map(m => `<a href="${m.href}" style="display:block; padding:10px 12px; border-radius:var(--radius-md); color:var(--color-text); text-decoration:none; font-size:15px;" onmouseover="this.style.background='var(--color-surface)'" onmouseout="this.style.background=this.classList.contains('is-active')?'var(--color-surface)':'transparent'">${m.label}</a>`).join('')
      : `<p style="padding:10px 12px; color:color-mix(in srgb, var(--color-text) 55%, transparent);">No matches.</p>`;
    highlight();
  }

  let closeTimer = null;
  function openSearch() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (overlay.classList.contains('open')) return;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('open'));
    renderResults('');
    input.value = '';
    input.focus();
  }
  function closeSearch() {
    if (!overlay.classList.contains('open')) return;
    overlay.classList.remove('open');
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { overlay.style.display = 'none'; closeTimer = null; }, 420);
  }

  btn.addEventListener('click', () => { overlay.classList.contains('open') ? closeSearch() : openSearch(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSearch(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
    if ((e.metaKey || e.ctrlKey) && e.code === 'Space') {
      e.preventDefault();
      overlay.classList.contains('open') ? closeSearch() : openSearch();
    }
  });
  input.addEventListener('input', () => renderResults(input.value));
  results.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeSearch();
  });
  input.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('open') || !currentMatches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % currentMatches.length;
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const match = currentMatches[activeIndex];
      if (match) {
        closeSearch();
        window.location.href = match.href;
      }
    }
  });
}

function projectCardHTML(p, lang) {
  lang = lang || currentLang();
  return `
    <a class="proj-card" href="project-detail.html?slug=${p.slug}" data-type="${p.typeKey}" data-loc="${p.locationKey}" data-name="${p.name.toLowerCase()} ${p.location.toLowerCase()}">
      <figure class="proj-figure washed"><image-slot id="${p.cardImage.id}" shape="rect" role="img" aria-label="${p.cardImage.alt}"${p.cardImage.src ? ` src="${p.cardImage.src}"` : ''}></image-slot></figure>
      <div class="proj-meta"><div><h3 class="proj-title">${p.name}</h3><p class="proj-loc">${pf(p, lang, 'location')} · ${pf(p, lang, 'type')}</p></div><span class="tag tag-accent">${p.year}</span></div>
    </a>`;
}
