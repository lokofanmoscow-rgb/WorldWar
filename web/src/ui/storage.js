// Save storage: files through the Android bridge when running inside the app, localStorage in a browser.
const B = typeof window !== 'undefined' && window.AndroidBridge ? window.AndroidBridge : null;
const PRE = 'ww_save_';

export const Storage = {
  native: !!B,
  save(name, data) {
    try {
      if (B) return !!B.saveFile(name, data);
      localStorage.setItem(PRE + name, data);
      return true;
    } catch (e) {
      // browser quota: drop the autosave and retry once
      try { if (name !== 'auto') { localStorage.removeItem(PRE + 'auto'); localStorage.setItem(PRE + name, data); return true; } } catch (e2) { /* ignore */ }
      return false;
    }
  },
  load(name) {
    try { return B ? B.loadFile(name) || null : localStorage.getItem(PRE + name); } catch (e) { return null; }
  },
  remove(name) {
    try { if (B) B.deleteFile(name); else localStorage.removeItem(PRE + name); } catch (e) { /* ignore */ }
  },
  /** [{name, meta}] where meta is the small JSON header stored next to the save */
  list() {
    const out = [];
    try {
      const names = B ? JSON.parse(B.listFiles() || '[]') : Object.keys(localStorage).filter((k) => k.startsWith(PRE)).map((k) => k.slice(PRE.length));
      for (const n of names) {
        if (n.endsWith('.meta')) continue;
        let meta = null;
        try { meta = JSON.parse(this.load(n + '.meta') || 'null'); } catch (e) { /* ignore */ }
        out.push({ name: n, meta });
      }
    } catch (e) { /* ignore */ }
    out.sort((a, b) => ((b.meta && b.meta.t) || 0) - ((a.meta && a.meta.t) || 0));
    return out;
  },
  setPref(k, v) { try { if (B) B.saveFile('pref_' + k, String(v)); else localStorage.setItem('ww_pref_' + k, String(v)); } catch (e) { /* ignore */ } },
  getPref(k) { try { return B ? B.loadFile('pref_' + k) || null : localStorage.getItem('ww_pref_' + k); } catch (e) { return null; } },
  exit() { if (B && B.exitApp) B.exitApp(); },
};
