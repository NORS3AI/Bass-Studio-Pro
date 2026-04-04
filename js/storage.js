/**
 * storage.js — IndexedDB persistence for playlists, settings, and state
 */
const Storage = (() => {
  const DB_NAME = 'BassStudioPro';
  const DB_VERSION = 1;
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const _db = e.target.result;
        if (!_db.objectStoreNames.contains('playlists')) {
          _db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!_db.objectStoreNames.contains('settings')) {
          _db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!_db.objectStoreNames.contains('state')) {
          _db.createObjectStore('state', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }

  function put(store, value) {
    return new Promise((resolve, reject) => {
      const req = tx(store, 'readwrite').put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function get(store, key) {
    return new Promise((resolve, reject) => {
      const req = tx(store, 'readonly').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAll(store) {
    return new Promise((resolve, reject) => {
      const req = tx(store, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function remove(store, key) {
    return new Promise((resolve, reject) => {
      const req = tx(store, 'readwrite').delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function clearStore(store) {
    return new Promise((resolve, reject) => {
      const req = tx(store, 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Public API
  return {
    init: open,
    saveSetting: (key, value) => put('settings', { key, value }),
    getSetting: (key) => get('settings', key).then(r => r ? r.value : null),
    savePlaylist: (playlist) => put('playlists', playlist),
    getPlaylist: (id) => get('playlists', id),
    getAllPlaylists: () => getAll('playlists'),
    deletePlaylist: (id) => remove('playlists', id),
    saveState: (key, value) => put('state', { key, value }),
    getState: (key) => get('state', key).then(r => r ? r.value : null),
    clearAll: () => Promise.all([
      clearStore('playlists'),
      clearStore('settings'),
      clearStore('state'),
    ]),
  };
})();
