/**
 * patch-notes.js — Fetch and render PATCH_NOTES.md in the app
 */
const PatchNotes = (() => {
  const SEEN_KEY = 'patchNotesSeen';
  let content = '';
  let latestVersion = '';

  async function load() {
    try {
      const res = await fetch('PATCH_NOTES.md');
      if (!res.ok) return;
      content = await res.text();
      latestVersion = extractLatestVersion(content);
      checkBadge();
    } catch (_) {
      // Offline or fetch failed — content stays empty
    }
  }

  function extractLatestVersion(md) {
    const match = md.match(/^## (v[\d.]+)/m);
    return match ? match[1] : '';
  }

  function render(container) {
    // Strip the top-level heading (already shown in the panel's <h2>)
    const stripped = content.replace(/^# .+\n*/m, '');
    container.innerHTML = markdownToHTML(stripped);
    markSeen();
  }

  /**
   * Minimal markdown to HTML converter.
   * Escapes HTML first to prevent XSS, then applies markdown transformations.
   */
  function markdownToHTML(md) {
    // Escape HTML entities FIRST to prevent injection
    const escaped = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    // Now apply markdown transforms on the safe text
    let html = escaped
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/^---$/gm, '<hr>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> blocks in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Clean up whitespace
    html = html.replace(/\n\n+/g, '<br>');
    html = html.replace(/\n/g, '');

    return html;
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
