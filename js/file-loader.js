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

  async function collectFromDirectory(dirHandle) {
    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && AUDIO_EXTENSIONS.test(entry.name)) {
        files.push(await entry.getFile());
      } else if (entry.kind === 'directory') {
        files.push(...await collectFromDirectory(entry));
      }
    }
    return files;
  }

  function pickViaInput(input) {
    return new Promise((resolve) => {
      input.onchange = () => {
        const files = Array.from(input.files).filter(f => AUDIO_EXTENSIONS.test(f.name));
        input.value = '';
        resolve(files);
      };
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

  function readEntry(entry) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => {
          resolve(AUDIO_EXTENSIONS.test(f.name) ? [f] : []);
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        reader.readEntries(async (entries) => {
          const results = [];
          for (const e of entries) {
            results.push(...await readEntry(e));
          }
          resolve(results);
        });
      } else {
        resolve([]);
      }
    });
  }

  /**
   * Extract metadata from an audio file (ID3 tags, etc.)
   * Returns { title, artist, album, duration, art }
   */
  function extractMetadata(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        resolve({
          title: file.name.replace(AUDIO_EXTENSIONS, ''),
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: audio.duration,
          file,
          url,
        });
      };
      audio.onerror = () => {
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
