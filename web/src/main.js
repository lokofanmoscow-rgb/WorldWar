// Entry point of the browser / WebView build.
import { app } from './ui/app.js';
import './ui/panels1.js';
import './ui/panels2.js';
import './ui/panels3.js';

window.addEventListener('error', (e) => { console.error('error', e.message); });
function boot() {
  app.init();
  app.tools();
  // exposed for automated UI tests
  window.__app = app;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
