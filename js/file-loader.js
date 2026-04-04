/**
 * file-loader.js — Load audio files from desktop or iOS Files app
 */
const FileLoader = (() => {
  const AUDIO_EXTENSIONS = /\.(mp3|aac|m4a|wav|flac|ogg|webm|aiff|aif|opus)$/i;

  /**
   * Open file picker for individual audio files
   */
  async function openFiles() {
    // Try File System Access API first (Chrome/Edge)
    if ('showOpenFilePicker' in window) {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'Audio files',
            accept: { 'audio/*': ['.mp3', '.aac', '.m4a', '.wav', '.flac', '.ogg', '.webm', '.aiff', '.opus'] },
          }],
        });
        return Promise.all(handles.map(h => h.getFile()));
      } catch (e) {
        if (e.name === 'AbortError') return [];
        throw e;
      }
    }
    // Fallback: hidden <input>
    return pickViaInput(document.getElementById('file-input'));
  }

  /**
   * Open folder picker
   */
  async function openFolder() {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        return collectFromDirectory(dirHandle);
      } catch (e) {
        if (e.name === 'AbortError') return [];
        throw e;
      }
    }
    return pickViaInput(document.getElementById('folder-input'));
  }

  async function collectFromDirectory(dirHandle, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 10) return []; // Prevent infinite recursion from symlinks
    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && AUDIO_EXTENSIONS.test(entry.name)) {
        files.push(await entry.getFile());
      } else if (entry.kind === 'directory') {
        files.push(...await collectFromDirectory(entry, depth + 1));
      }
    }
    return files;
  }

  /**
   * Pick files via hidden <input> element.
   * Handles both file selection and user cancellation.
   */
  function pickViaInput(input) {
    return new Promise((resolve) => {
      const cleanup = () => {
        input.onchange = null;
        input.removeEventListener('cancel', onCancel);
      };
      const onCancel = () => {
        cleanup();
        resolve([]);
      };
      input.onchange = () => {
        const files = Array.from(input.files).filter(f => AUDIO_EXTENSIONS.test(f.name));
        input.value = '';
        cleanup();
        resolve(files);
      };
      // 'cancel' event fires when user dismisses the picker (modern browsers)
      input.addEventListener('cancel', onCancel);
      input.click();
    });
  }

  /**
   * Handle drag-and-drop
   */
  async function handleDrop(dataTransfer) {
    const files = [];
    if (dataTransfer.items) {
      for (const item of dataTransfer.items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.();
          if (entry) {
            files.push(...await readEntry(entry));
          } else {
            const file = item.getAsFile();
            if (file && AUDIO_EXTENSIONS.test(file.name)) files.push(file);
          }
        }
      }
    }
    return files;
  }

  /**
   * Recursively read filesystem entries from drag-and-drop.
   * Handles batched readEntries() per spec.
   */
  function readEntry(entry, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 10) return Promise.resolve([]);

    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(
          (f) => resolve(AUDIO_EXTENSIONS.test(f.name) ? [f] : []),
          () => resolve([]) // Error callback — file unreadable
        );
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const allEntries = [];

        // readEntries returns batches — must loop until empty
        function readBatch() {
          reader.readEntries(async (entries) => {
            if (entries.length === 0) {
              // All batches read, now process entries
              const results = [];
              for (const e of allEntries) {
                results.push(...await readEntry(e, depth + 1));
              }
              resolve(results);
            } else {
              allEntries.push(...entries);
              readBatch(); // Read next batch
            }
          }, () => resolve([])); // Error reading directory
        }
        readBatch();
      } else {
        resolve([]);
      }
    });
  }

  /**
   * Extract metadata from an audio file.
   * Returns { title, artist, album, duration, file, url }
   *
   * Creates a blob URL for playback. The temp Audio element used for
   * duration extraction is cleaned up to avoid resource leaks.
   */
  function extractMetadata(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = 'metadata';

      const cleanup = () => {
        // Release the temp audio element's hold on the media resource
        audio.removeAttribute('src');
        audio.load();
      };

      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        cleanup();
        resolve({
          title: file.name.replace(AUDIO_EXTENSIONS, ''),
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration,
          file,
          url,
        });
      };
      audio.onerror = () => {
        cleanup();
        resolve({
          title: file.name.replace(AUDIO_EXTENSIONS, ''),
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 0,
          file,
          url,
        });
      };
      audio.src = url;
    });
  }

  return { openFiles, openFolder, handleDrop, extractMetadata };
})();
