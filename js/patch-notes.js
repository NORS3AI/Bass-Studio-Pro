/**
 * patch-notes.js — Fetch, parse, and render PATCH_NOTES.md as a modal
 */
const PatchNotes = (() => {
  const SEEN_KEY = 'patchNotesSeen';
  let content = '';
  let latestVersion = '';
  let versions = []; // Parsed version entries

  async function load() {
    try {
      const res = await fetch('PATCH_NOTES.md');
      if (!res.ok) return;
      content = await res.text();
      versions = parseVersions(content);
      latestVersion = versions.length > 0 ? versions[0].version : '';
      checkBadge();
    } catch (_) {}
  }

  /**
   * Parse PATCH_NOTES.md into structured version entries.
   * Each entry: { version, date, sections: [{ title, items[] }] }
   */
  function parseVersions(md) {
    const result = [];
    // Split by version headings (## v0.x.x — date)
    const blocks = md.split(/^## /gm).slice(1);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const headerMatch = lines[0].match(/^(v[\d.]+)\s*[\u2014—-]\s*(.+)/);
      if (!headerMatch) continue;

      const entry = {
        version: headerMatch[1],
        date: headerMatch[2].trim(),
        sections: [],
      };

      let currentSection = null;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        // Section heading (### ...)
        const sectionMatch = line.match(/^### (.+)/);
        if (sectionMatch) {
          currentSection = { title: sectionMatch[1], items: [] };
          entry.sections.push(currentSection);
          continue;
        }

        // Bullet item (- **bold**: text OR - text)
        const itemMatch = line.match(/^- (.+)/);
        if (itemMatch && currentSection) {
          currentSection.items.push(itemMatch[1]);
          continue;
        }

        // Skip horizontal rules / blank lines
      }

      // If no sections found, create a default one
      if (entry.sections.length === 0) {
        entry.sections.push({ title: 'Changes', items: [] });
      }

      result.push(entry);
    }

    return result;
  }

  function render(container) {
    const versionBadge = document.getElementById('patch-notes-version');
    if (versionBadge && latestVersion) {
      versionBadge.textContent = latestVersion;
    }

    container.innerHTML = '';

    if (versions.length === 0) {
      container.innerHTML = '<p class="pn-empty">No patch notes available.</p>';
      markSeen();
      return;
    }

    versions.forEach((entry, idx) => {
      const card = document.createElement('div');
      card.className = 'pn-version-card' + (idx === 0 ? ' pn-latest' : '');

      // Version header (clickable to collapse)
      const header = document.createElement('button');
      header.className = 'pn-version-header';
      header.setAttribute('aria-expanded', idx === 0 ? 'true' : 'false');
      header.innerHTML = `
        <div class="pn-version-info">
          <span class="pn-version-tag">${escapeHTML(entry.version)}</span>
          ${idx === 0 ? '<span class="pn-latest-badge">Latest</span>' : ''}
          <span class="pn-version-date">${escapeHTML(entry.date)}</span>
        </div>
        <span class="pn-chevron">${idx === 0 ? '\u25B2' : '\u25BC'}</span>
      `;

      const body = document.createElement('div');
      body.className = 'pn-version-body';
      if (idx !== 0) body.classList.add('collapsed');

      header.addEventListener('click', () => {
        const isCollapsed = body.classList.contains('collapsed');
        body.classList.toggle('collapsed');
        header.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
        header.querySelector('.pn-chevron').textContent = isCollapsed ? '\u25B2' : '\u25BC';
      });

      // Render sections
      entry.sections.forEach(section => {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'pn-section';

        const sTitle = document.createElement('h4');
        sTitle.className = 'pn-section-title';
        sTitle.textContent = section.title;
        sectionEl.appendChild(sTitle);

        const ul = document.createElement('ul');
        ul.className = 'pn-items';
        section.items.forEach(item => {
          const li = document.createElement('li');
          // Parse **bold**: rest pattern
          li.innerHTML = formatItem(item);
          ul.appendChild(li);
        });
        sectionEl.appendChild(ul);
        body.appendChild(sectionEl);
      });

      card.appendChild(header);
      card.appendChild(body);
      container.appendChild(card);
    });

    markSeen();
  }

  /**
   * Format a single changelog item.
   * Handles **bold** and `code` inline formatting.
   */
  function formatItem(text) {
    return escapeHTML(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function checkBadge() {
    const seen = localStorage.getItem(SEEN_KEY);
    const badge = document.getElementById('patch-badge');
    if (badge) {
      badge.classList.toggle('hidden', seen === latestVersion);
    }
  }

  function markSeen() {
    localStorage.setItem(SEEN_KEY, latestVersion);
    const badge = document.getElementById('patch-badge');
    if (badge) badge.classList.add('hidden');
  }

  return { load, render, checkBadge };
})();
