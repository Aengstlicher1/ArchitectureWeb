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

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'lang-toggle-btn';
  btn.className = 'btn btn-icon';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Switch language');
  btn.title = 'Switch language';
  btn.style.cssText = 'font-family:var(--font-body); font-weight:600; font-size:13px; letter-spacing:0.02em; width:auto; padding:0 10px; display:flex; align-items:center; gap:5px;';
  btn.innerHTML = '<span id="lang-current-label"></span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  const panel = document.createElement('div');
  panel.id = 'lang-panel';
  panel.className = 'lang-panel';
  panel.style.display = 'none';
  const outer = document.createElement('div');
  outer.className = 'lang-panel-outer';
  const inner = document.createElement('div');
  inner.className = 'lang-panel-inner';
  inner.setAttribute('role', 'listbox');
  manifest.forEach(l => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'lang-option';
    opt.dataset.code = l.code;
    opt.setAttribute('role', 'option');
    opt.textContent = l.label;
    inner.appendChild(opt);
  });
  outer.appendChild(inner);
  panel.appendChild(outer);

  wrap.appendChild(btn);
  wrap.appendChild(panel);
  mount.replaceWith(wrap);

  const labelEl = btn.querySelector('#lang-current-label');
  let closeTimer = null;
  function openPanel() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (panel.classList.contains('open')) return;
    panel.style.display = 'block';
    void panel.offsetHeight;
    requestAnimationFrame(() => panel.classList.add('open'));
    btn.setAttribute('aria-expanded', 'true');
  }
  function closePanel() {
    if (!panel.classList.contains('open')) return;
    panel.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    closeTimer = setTimeout(() => { panel.style.display = 'none'; closeTimer = null; }, 420);
  }
  btn.addEventListener('click', () => { panel.classList.contains('open') ? closePanel() : openPanel(); });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closePanel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

  async function apply(lang) {
    document.documentElement.setAttribute('lang', lang);
    const entry = manifest.find(l => l.code === lang) || manifest[0];
    labelEl.textContent = entry ? entry.code.toUpperCase() : lang.toUpperCase();
    inner.querySelectorAll('.lang-option').forEach(o => o.setAttribute('aria-selected', String(o.dataset.code === lang)));
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
  inner.querySelectorAll('.lang-option').forEach(opt => {
    opt.addEventListener('click', () => {
      lang = opt.dataset.code;
      localStorage.setItem('site-lang', lang);
      apply(lang);
      closePanel();
    });
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
    void overlay.offsetHeight;
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

// Shared top nav + sidebar + search overlay + floating buttons, injected into
// #chrome-nav / #chrome-float mount points. Edit this once; every page updates.
function siteChromeLinks() {
  const onIndex = /(^|\/)index\.html$/.test(location.pathname) || location.pathname === '/' || location.pathname === '';
  return {
    work: onIndex ? '#work' : 'work.html',
    studio: onIndex ? '#studio' : 'index.html#studio',
    services: onIndex ? '#services' : 'index.html#services',
    contact: onIndex ? '#contact' : 'index.html#contact',
  };
}

function renderSiteChrome() {
  const navMount = document.getElementById('chrome-nav');
  const floatMount = document.getElementById('chrome-float');
  if (navMount) {
    const L = siteChromeLinks();
    navMount.innerHTML = `
<nav class="nav">
  <button type="button" class="btn btn-icon" id="menu-toggle-btn" aria-label="Open menu" aria-expanded="false" aria-controls="sidebar" title="Menu">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
  </button>
  <a href="index.html" class="nav-brand" style="text-decoration:none;color:inherit;">[COMPANY NAME]</a>
  <div class="nav-right">
    <button type="button" class="btn btn-icon" id="nav-search-btn" data-i18n-placeholder="nav.search_aria" aria-label="Search the site (⌘/Ctrl + Space)" title="Search (⌘/Ctrl + Space)" aria-haspopup="dialog">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
    </button>
    <button type="button" class="btn btn-icon" id="lang-toggle-btn" aria-label="Switch language" title="Switch language" style="font-family:var(--font-body); font-weight:600; font-size:13px; letter-spacing:0.02em;">EN</button>
  </div>
</nav>
<div id="sidebar-backdrop"></div>
<aside id="sidebar" aria-hidden="true">
  <div class="sidebar-head">
    <span class="sidebar-brand">[COMPANY NAME]</span>
    <button type="button" class="btn btn-icon" id="sidebar-close-btn" aria-label="Close menu">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  </div>
  <nav class="sidebar-links">
    <a href="${L.work}" data-i18n="nav.work">Work</a>
    <a href="${L.studio}" data-i18n="nav.studio">Studio</a>
    <a href="${L.services}" data-i18n="nav.services">Services</a>
    <a href="${L.contact}" data-i18n="nav.contact">Contact</a>
  </nav>
</aside>
<div id="search-overlay" style="display:none; position:fixed; inset:0; z-index:200; background:color-mix(in srgb, var(--color-neutral-900) 55%, transparent); backdrop-filter:blur(2px); align-items:flex-start; justify-content:center;">
 <div class="search-outer" style="width:100%; max-width:640px; margin:12vh 0 0;">
  <div class="search-inner" style="background:var(--color-bg); border-radius:var(--radius-lg); padding:var(--space-3); box-shadow:var(--shadow-lg);">
    <input type="search" id="site-search-input" placeholder="Search projects, services, pages…" data-i18n-placeholder="search.placeholder" aria-label="Search the site"
      style="width:100%; box-sizing:border-box; font-size:18px; font-family:var(--font-body); padding:12px 14px; border:1px solid var(--color-divider); border-radius:var(--radius-md); background:var(--color-surface); color:var(--color-text);" />
    <div id="site-search-results" style="margin-top:var(--half); max-height:50vh; overflow-y:auto; scrollbar-width:none;"></div>
  </div>
 </div>
</div>`;
    // Nav is now position:fixed (always visible), so give the page a spacer
    // equal to its rendered height and keep it in sync on resize.
    function syncNavSpacer() {
      const navEl = navMount.querySelector('.nav');
      if (navEl) document.body.style.paddingTop = navEl.offsetHeight + 'px';
    }
    syncNavSpacer();
    window.addEventListener('resize', syncNavSpacer);
  }

  const onHomePage = /(^|\/)index\.html$/.test(location.pathname) || location.pathname === '/' || location.pathname === '';

  if (floatMount) {
    floatMount.innerHTML = `
${onHomePage ? '<a href="start-project.html" id="float-start" class="btn btn-primary" data-i18n="nav.start">Start a project</a>' : ''}
<button type="button" id="back-to-top" aria-label="Back to top" title="Back to top">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
</button>`;
  }
}

function projectCardHTML(p, lang) {
  lang = lang || currentLang();
  return `
    <a class="proj-card" href="project-detail.html?slug=${p.slug}" data-type="${p.typeKey}" data-loc="${p.locationKey}" data-name="${p.name.toLowerCase()} ${p.location.toLowerCase()}">
      <figure class="proj-figure washed"><image-slot id="${p.cardImage.id}" shape="rect" role="img" aria-label="${p.cardImage.alt}"${p.cardImage.src ? ` src="${p.cardImage.src}"` : ''}></image-slot></figure>
      <div class="proj-meta"><div><h3 class="proj-title">${p.name}</h3><p class="proj-loc">${pf(p, lang, 'location')} · ${pf(p, lang, 'type')}</p></div><span class="tag tag-accent">${p.year}</span></div>
    </a>`;
}

// Floating "back to top" button, shared across all pages: fades/slides in once
// the user has scrolled past one viewport height, smooth-scrolls to top on click.
function wireBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  function toggle() { btn.classList.toggle('show', window.scrollY > window.innerHeight * 0.6); }
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// Collapsible left sidebar nav, shared across all pages: hamburger toggle,
// backdrop click, Escape, and closing on any link click all dismiss it.
function wireSidebar() {
  const btn = document.getElementById('menu-toggle-btn');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const closeBtn = document.getElementById('sidebar-close-btn');
  if (!btn || !sidebar) return;
  function open() {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    sidebar.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
  }
  function close() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    sidebar.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
  }
  btn.addEventListener('click', () => (sidebar.classList.contains('open') ? close() : open()));
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

