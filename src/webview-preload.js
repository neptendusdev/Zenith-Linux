// Preload script pour les webviews
const { ipcRenderer, contextBridge } = require('electron');

// Capturer F12 dans la webview et envoyer au renderer parent
window.addEventListener('keydown', (e) => {
  if (e.key === 'F12') {
    e.preventDefault();
    e.stopPropagation();
    // Envoyer au renderer parent via sendToHost
    ipcRenderer.sendToHost('toggle-devtools');
  }
}, true);

// Ctrl + clic sur un lien : nouvel onglet en arrière-plan
//  - Ctrl + clic gauche : dans la pile de l'onglet d'origine
//  - Ctrl + clic droit  : hors pile
function findLink(e) {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
  const a = path.find(n => n && n.tagName === 'A' && typeof n.href === 'string' && n.href);
  if (!a || !/^(https?|file):/i.test(a.href)) return null;
  return a.href;
}

window.addEventListener('click', (e) => {
  if (e.button !== 0 || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
  const url = findLink(e);
  if (!url) return;
  e.preventDefault();
  e.stopPropagation();
  ipcRenderer.sendToHost('open-link-in-tab', { url, inPile: true });
}, true);

window.addEventListener('contextmenu', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const url = findLink(e);
  if (!url) return;
  e.preventDefault();
  e.stopPropagation();
  ipcRenderer.sendToHost('open-link-in-tab', { url, inPile: false, viaContextMenu: true });
}, true);

// La page d'accueil interne a accès à des données du navigateur (historique) :
// on ne l'expose qu'à elle, jamais aux sites web.
const isHomePage = location.protocol === 'file:' && /\/home\/index\.html$/i.test(decodeURIComponent(location.pathname));

// Exposer l'API pour la page d'accueil via contextBridge
contextBridge.exposeInMainWorld('zenithHome', {
  // Obtenir le thème actuel du navigateur
  getTheme: () => ipcRenderer.invoke('get-browser-theme'),
  
  // Écouter les changements de thème
  onThemeChange: (callback) => {
    ipcRenderer.on('theme-changed', (event, theme) => callback(theme));
  },

  // Historique (suggestions de recherche) - page d'accueil uniquement
  getHistory: () => isHomePage ? ipcRenderer.invoke('get-history') : Promise.resolve([]),
  getHistorySettings: () => isHomePage ? ipcRenderer.invoke('get-history-settings') : Promise.resolve({ enabled: false }),

  // Claude Connect dans les notes - page d'accueil uniquement (vérifié aussi côté main)
  ai: isHomePage ? {
    status: () => ipcRenderer.invoke('cc-notes-status'),
    setModel: (model) => ipcRenderer.invoke('cc-notes-set-model', model),
    ask: (payload) => ipcRenderer.send('cc-notes-ask', payload),
    cancel: (requestId) => ipcRenderer.send('cc-notes-cancel', requestId),
    onEvent: (callback) => ipcRenderer.on('cc-notes-event', (e, data) => callback(data)),
    openSettings: () => ipcRenderer.send('cc-open-settings')
  } : null
});
