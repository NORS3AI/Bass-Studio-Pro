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
    container.innerHTML = markdownToHTML(content);
    markSeen();
  }

  function markdownToHTML(md) {
    return md
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/^---$/gm, '<hr>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
      .replace(/<\/ul>\s*<ul>/g, '')
      .replace(/\n\n/g, '<br>');
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
