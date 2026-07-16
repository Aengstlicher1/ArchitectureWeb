// Shared loader for JSON-driven project content. Drop a new project by
// adding <slug>.json to projects-data/ and listing the slug in manifest.json.
async function loadProjects() {
  const manifest = await fetch('projects-data/manifest.json').then(r => r.json());
  const projects = await Promise.all(
    manifest.map(slug => fetch(`projects-data/${slug}.json`).then(r => r.json()))
  );
  return projects;
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

  function renderResults(q) {
    const query = q.trim().toLowerCase();
    const matches = query ? searchIndex.filter(i => i.label.toLowerCase().includes(query)) : searchIndex;
    results.innerHTML = matches.length
      ? matches.map(m => `<a href="${m.href}" style="display:block; padding:10px 12px; border-radius:var(--radius-md); color:var(--color-text); text-decoration:none; font-size:15px;" onmouseover="this.style.background='var(--color-surface)'" onmouseout="this.style.background='transparent'">${m.label}</a>`).join('')
      : `<p style="padding:10px 12px; color:color-mix(in srgb, var(--color-text) 55%, transparent);">No matches.</p>`;
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
}

function projectCardHTML(p) {
  return `
    <a class="proj-card" href="project-detail.html?slug=${p.slug}" data-type="${p.typeKey}" data-loc="${p.locationKey}" data-name="${p.name.toLowerCase()} ${p.location.toLowerCase()}">
      <figure class="proj-figure washed"><image-slot id="${p.cardImage.id}" shape="rect" role="img" aria-label="${p.cardImage.alt}"></image-slot></figure>
      <div class="proj-meta"><div><h3 class="proj-title">${p.name}</h3><p class="proj-loc">${p.location} · ${p.type}</p></div><span class="tag tag-accent">${p.year}</span></div>
    </a>`;
}
