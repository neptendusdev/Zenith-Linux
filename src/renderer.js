const SEARCH_ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { name: 'Brave', url: 'https://search.brave.com/search?q=' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' },
  qwant: { name: 'Qwant', url: 'https://www.qwant.com/?q=' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/do/search?q=' },
  yahoo: { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=' },
  yandex: { name: 'Yandex', url: 'https://yandex.com/search/?text=' }
};

let DEFAULT_PAGE = '';
let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let currentSearchEngine = localStorage.getItem('searchEngine') || 'google';
let closedTabs = [];
let currentTheme = localStorage.getItem('theme') || 'dark';

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.style.setProperty('--bg-primary', '#ffffff');
    document.documentElement.style.setProperty('--bg-secondary', '#f0f0f0');
    document.documentElement.style.setProperty('--bg-tertiary', '#e8e8e8');
    document.documentElement.style.setProperty('--bg-hover', '#e0e0e0');
    document.documentElement.style.setProperty('--bg-active', '#d0d0d0');
    document.documentElement.style.setProperty('--text-primary', '#0a0a0a');
    document.documentElement.style.setProperty('--text-secondary', '#404040');
    document.documentElement.style.setProperty('--text-muted', '#737373');
    document.documentElement.style.setProperty('--border', '#d4d4d4');
  } else {
    document.documentElement.style.setProperty('--bg-primary', '#141414');
    document.documentElement.style.setProperty('--bg-secondary', '#1c1c1c');
    document.documentElement.style.setProperty('--bg-tertiary', '#0a0a0a');
    document.documentElement.style.setProperty('--bg-hover', '#252525');
    document.documentElement.style.setProperty('--bg-active', '#2f2f2f');
    document.documentElement.style.setProperty('--text-primary', '#f5f5f5');
    document.documentElement.style.setProperty('--text-secondary', '#a3a3a3');
    document.documentElement.style.setProperty('--text-muted', '#737373');
    document.documentElement.style.setProperty('--border', '#262626');
  }
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', currentTheme);
  applyTheme(currentTheme);
  updateThemeUI();
  // Notifier le process principal pour qu'il transmette aux pages d'accueil
  window.zenithAPI.setBrowserTheme(currentTheme);
}

function updateThemeUI() {
  const btn = document.getElementById('toggle-theme');
  if (!btn) return;
  btn.innerHTML = currentTheme === 'dark' 
    ? '<svg class="icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Mode sombre<span class="status"></span>'
    : '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>Mode clair<span class="status"></span>';
  btn.classList.toggle('active', currentTheme === 'dark');
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Vérifier que zenithAPI est disponible
    if (!window.zenithAPI) {
      console.error('zenithAPI is not available. Preload script may not have loaded correctly.');
      alert('Erreur d\'initialisation: zenithAPI non disponible');
      return;
    }
    
    DEFAULT_PAGE = await window.zenithAPI.getDefaultPage();
    initializeUI();
    initializePermissions();
    initializeDevToolsPanel();
    initializeDownloads();
    await initializeBookmarks();
    initializePiles();
    initializeClaudeConnect().catch(e => console.error('Claude Connect :', e));
    window.zenithAPI.onWebviewOpenUrl?.(handleWebviewOpenUrl);
    setupCollapsibleSettings();
    applyTheme(currentTheme);
    // Envoyer le thème initial au process principal
    window.zenithAPI.setBrowserTheme(currentTheme);
    createNewTab();
    setupWindowControls();
    setupShortcutListener();
    setupGlobalKeyListener();
    await initializeSettings();
  } catch (error) {
    console.error('Initialization error:', error);
    alert('Erreur lors de l\'initialisation: ' + error.message);
  }
});

// Listener global pour intercepter F12 avant qu'il n'atteigne la webview
function setupGlobalKeyListener() {
  // Échap dans l'interface du navigateur : arrêter le chargement, fermer menus et popups
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    stopLoading();
    closeSettingsMenu();
    closePermissionsMenu();
    if (typeof closeDownloadsPanel === 'function' && downloadsPanelOpen) closeDownloadsPanel();
    if (typeof bmHandleEscape === 'function') bmHandleEscape();
    if (document.activeElement?.id === 'url-bar') {
      // Comme Chrome : Échap dans la barre d'URL rétablit l'adresse de la page
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) document.getElementById('url-bar').value = (tab.isNewTab || isHomePage(tab.url)) ? '' : (tab.url || '');
      document.activeElement.blur();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F12') {
      e.preventDefault();
      e.stopPropagation();
      toggleDevTools();
    }
  }, true); // Phase de capture pour intercepter avant la webview
}

function initializeUI() {
  document.getElementById('new-tab-btn').addEventListener('click', () => createNewTab());
  const urlBar = document.getElementById('url-bar');
  urlBar.addEventListener('keydown', handleUrlBarKeydown);
  urlBar.addEventListener('focus', () => urlBar.select());
  document.getElementById('back-btn').addEventListener('click', goBack);
  document.getElementById('forward-btn').addEventListener('click', goForward);
  document.getElementById('refresh-btn').addEventListener('click', refreshPage);
  document.getElementById('home-btn').addEventListener('click', goHome);
  document.getElementById('devtools-btn').addEventListener('click', toggleDevTools);
  document.getElementById('settings-btn').addEventListener('click', toggleSettingsMenu);
  document.getElementById('history-btn').addEventListener('click', openHistoryPage);
  document.getElementById('settings-overlay').addEventListener('click', closeSettingsMenu);
  document.getElementById('search-engine-select').addEventListener('change', (e) => {
    currentSearchEngine = e.target.value;
    localStorage.setItem('searchEngine', currentSearchEngine);
    updateSearchEnginePlaceholder();
  });
  updateSearchEnginePlaceholder();
  
  // Setup settings menu listeners
  setTimeout(() => {
    const adBlockerBtn = document.getElementById('toggle-adblocker');
    const cookiesBtn = document.getElementById('clear-cookies');
    const thirdPartyBtn = document.getElementById('toggle-third-party');
    const clearDataBtn = document.getElementById('clear-data');
    const themeBtn = document.getElementById('toggle-theme');
    const historyBtn = document.getElementById('open-history');
    
    if (adBlockerBtn) adBlockerBtn.addEventListener('click', toggleAdBlocker);
    if (cookiesBtn) cookiesBtn.addEventListener('click', clearCookies);
    if (thirdPartyBtn) thirdPartyBtn.addEventListener('click', toggleThirdPartyCookies);
    if (clearDataBtn) clearDataBtn.addEventListener('click', clearBrowsingData);
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    if (historyBtn) historyBtn.addEventListener('click', () => { closeSettingsMenu(); openHistoryPage(); });
  }, 0);
}

function setupShortcutListener() {
  window.zenithAPI.onShortcut((action) => {
    switch (action) {
      case 'new-tab': createNewTab(); break;
      case 'close-tab':
        // Sur la page d'une pile, Ctrl+W revient à l'onglet
        if (typeof activePileView !== 'undefined' && activePileView) closePilePage(true);
        else if (activeTabId) closeTab(activeTabId);
        break;
      case 'reopen-tab': reopenLastClosedTab(); break;
      case 'next-tab': switchToNextTab(); break;
      case 'prev-tab': switchToPreviousTab(); break;
      case 'recent-tab': switchToRecentTab(); break;
      case 'refresh': refreshPage(); break;
      case 'hard-refresh': hardRefreshPage(); break;
      case 'focus-url': focusUrlBar(); break;
      case 'stop': stopLoading(); closeSettingsMenu(); bmHandleEscape(); break;
      case 'stop-loading': stopLoading(); break;
      case 'bookmark-page': bookmarkCurrentPage(); break;
      case 'toggle-bookmarks-bar': toggleBookmarksBar(); break;
      case 'open-bookmarks': openBookmarksPage(); break;
      case 'toggle-devtools': toggleDevTools(); break;
      case 'inspect-element': openDevToolsInspect(); break;
      case 'open-console': openDevToolsConsole(); break;
      case 'toggle-downloads': toggleDownloadsPanel(); break;
      case 'open-history': openHistoryPage(); break;
      case 'toggle-assistant': ccTogglePanel(); break;
      case 'claude-connect-settings': ccTogglePanel(true); ccShowView('config'); break;
      default:
        if (action.startsWith('goto-tab-')) {
          const num = parseInt(action.split('-')[2]);
          if (num === 9 && tabs.length > 0) switchToTab(tabs[tabs.length - 1].id);
          else if (num <= tabs.length) switchToTab(tabs[num - 1].id);
        }
    }
  });
}

function setupWindowControls() {
  document.getElementById('minimize-btn').addEventListener('click', () => window.zenithAPI.minimizeWindow());
  document.getElementById('maximize-btn').addEventListener('click', () => window.zenithAPI.maximizeWindow());
  document.getElementById('close-btn').addEventListener('click', () => window.zenithAPI.closeWindow());
}

async function initializeSettings() {
  const adBlockerEnabled = await window.zenithAPI.getAdBlockerStatus();
  updateAdBlockerUI(adBlockerEnabled);
  const thirdPartyBlocked = await window.zenithAPI.getThirdPartyCookiesBlocked();
  updateThirdPartyCookiesUI(thirdPartyBlocked);
  updateThemeUI();
  document.getElementById('search-engine-select').value = currentSearchEngine;
}

function createNewTab(url = null, opts = {}) {
  // Pages internes
  if (url === 'zenith://bookmarks') return openBookmarksPage();
  if (url === 'zenith://history') return openHistoryPage();
  const tabId = `tab-${++tabCounter}`;
  const isNewTab = !url;
  const actualUrl = url || DEFAULT_PAGE;
  
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  tabElement.id = tabId;
  tabElement.innerHTML = `
    <div class="tab-favicon"></div>
    <span class="tab-title">Nouvel onglet</span>
    <button class="tab-close" title="Fermer">
      <svg class="icon" viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>
  `;
  tabElement.addEventListener('click', (e) => { if (!e.target.closest('.tab-close')) switchToTab(tabId); });
  tabElement.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(tabId); });
  
  // Clic molette pour fermer l'onglet
  tabElement.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Bouton molette
      e.preventDefault();
      closeTab(tabId);
    }
  });
  
  // Drag & Drop pour réorganiser les onglets
  setupTabDragAndDrop(tabElement, tabId);
  
  const newTabBtn = document.getElementById('new-tab-btn');
  document.getElementById('tabs-container').insertBefore(tabElement, newTabBtn);
  const webview = document.createElement('webview');
  webview.id = `webview-${tabId}`;
  webview.className = 'browser-view wv-pending'; // masqué jusqu'au premier rendu (pas de flash blanc)
  webview.src = actualUrl;
  webview.setAttribute('allowpopups', 'true');
  webview.setAttribute('preload', window.zenithAPI.webviewPreloadPath);
  webview.setAttribute('webpreferences', 'contextIsolation=yes, javascript=yes, images=yes, webgl=yes, plugins=no, experimentalFeatures=no');
  webview.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  webview.setAttribute('disableblinkfeatures', 'Auxclick');
  setupWebviewEvents(webview, tabId);
  document.getElementById('webviews-container').appendChild(webview);
  tabs.push({ id: tabId, url: actualUrl, title: 'Nouvel onglet', webview, isNewTab });
  // Onglet ouvert depuis un lien : pile d'onglets
  if (opts.openerId && typeof pilesOnTabOpened === 'function') pilesOnTabOpened(tabId, opts.openerId, opts);
  if (opts.background) {
    // Onglet en arrière-plan : la webview reste chargée mais invisible
    webview.classList.add('bg-loading');
    const done = () => webview.classList.remove('bg-loading');
    webview.addEventListener('did-stop-loading', done, { once: true });
    setTimeout(done, 15000);
    if (typeof renderPiles === 'function') renderPiles();
    return;
  }
  switchToTab(tabId);
  if (isNewTab) setTimeout(() => focusUrlBar(), 100);
}

// ---- Anti flash blanc : la webview reste invisible (fond sombre) jusqu'au premier rendu ----
function hideWebviewUntilPainted(webview) {
  webview.classList.add('wv-pending');
  clearTimeout(webview._revealTimer);
  webview._revealTimer = setTimeout(() => revealWebview(webview), 3000); // sécurité
}

function revealWebview(webview, delay = 0) {
  clearTimeout(webview._revealTimer);
  webview._revealTimer = setTimeout(() => webview.classList.remove('wv-pending'), delay);
}

function setupWebviewEvents(webview, tabId) {
  let firstNavigation = true;

  hideWebviewUntilPainted(webview);
  // Nouveau document (pas les navigations internes à la page) : masqué jusqu'à ce qu'il soit prêt
  webview.addEventListener('did-navigate', () => hideWebviewUntilPainted(webview));
  // Laisser ~1 frame au premier rendu avant d'afficher
  webview.addEventListener('dom-ready', () => revealWebview(webview, 60));
  webview.addEventListener('did-stop-loading', () => revealWebview(webview, 30));
  // Aperçu pour la page de pile (seulement si l'onglet est visible)
  webview.addEventListener('did-stop-loading', () => setTimeout(() => {
    if (tabId === activeTabId && !activePileView && typeof capturePileThumb === 'function') {
      capturePileThumb(tabs.find(t => t.id === tabId));
    }
  }, 1200));
  webview.addEventListener('did-fail-load', (e) => { if (e.isMainFrame) revealWebview(webview); });
  let lastHistoryUrl = '';
  
  webview.addEventListener('page-title-updated', (e) => {
    updateTabTitle(tabId, e.title);
    // Ajouter à l'historique quand on a le titre
    const tab = tabs.find(t => t.id === tabId);
    if (tab && tab.url && tab.url !== lastHistoryUrl && !isHomePage(tab.url)) {
      lastHistoryUrl = tab.url;
      window.zenithAPI.addToHistory({
        url: tab.url,
        title: e.title || tab.url,
        favicon: tab.favicon || ''
      });
    }
  });
  
  webview.addEventListener('did-navigate', (e) => { 
    updateTabUrl(tabId, e.url); 
    const tab = tabs.find(t => t.id === tabId);
    if (tab && !firstNavigation) {
      tab.isNewTab = isHomePage(e.url);
    }
    firstNavigation = false;
    if (tabId === activeTabId && tab) {
      document.getElementById('url-bar').value = isHomePage(e.url) ? '' : e.url;
    }
  });
  webview.addEventListener('did-navigate-in-page', (e) => { 
    if (e.isMainFrame) { 
      updateTabUrl(tabId, e.url); 
      const tab = tabs.find(t => t.id === tabId);
      if (tabId === activeTabId && tab) {
        document.getElementById('url-bar').value = isHomePage(e.url) ? '' : e.url;
      }
    }
  });
  webview.addEventListener('page-favicon-updated', (e) => { 
    if (e.favicons?.length) {
      updateTabFavicon(tabId, e.favicons[0]); 
    }
  });
  webview.addEventListener('did-start-loading', () => { if (tabId === activeTabId) updateRefreshButton(true); document.getElementById(tabId)?.classList.add('loading'); });
  webview.addEventListener('did-stop-loading', () => { 
    if (tabId === activeTabId) updateRefreshButton(false); 
    document.getElementById(tabId)?.classList.remove('loading');
    
    // Récupérer le favicon via plusieurs méthodes
    const tab = tabs.find(t => t.id === tabId);
    if (tab && tab.url) {
      // D'abord essayer via l'API Google (plus fiable)
      loadFaviconFromUrl(tabId, tab.url);
      
      // Ensuite essayer de récupérer le favicon depuis la page (peut remplacer si trouvé)
      setTimeout(() => {
        webview.executeJavaScript(`
          (function() {
            // Chercher les différents types de liens favicon
            const selectors = [
              'link[rel="icon"]',
              'link[rel="shortcut icon"]',
              'link[rel="apple-touch-icon"]',
              'link[rel="apple-touch-icon-precomposed"]'
            ];
            for (const selector of selectors) {
              const link = document.querySelector(selector);
              if (link && link.href) return link.href;
            }
            return null;
          })();
        `).then(faviconUrl => {
          if (faviconUrl) {
            updateTabFavicon(tabId, faviconUrl);
          }
        }).catch(() => {});
      }, 300);
    }
  });
  
  // Écouter les messages IPC depuis le preload de la webview
  webview.addEventListener('ipc-message', (event) => {
    if (event.channel === 'toggle-devtools') {
      toggleDevTools();
    } else if (event.channel === 'open-link-in-tab') {
      // Ctrl + clic gauche (dans la pile) / Ctrl + clic droit (hors pile)
      const { url, inPile, viaContextMenu } = event.args[0] || {};
      if (!url) return;
      if (viaContextMenu) webview._suppressContextMenuUntil = Date.now() + 500;
      createNewTab(url, { openerId: tabId, inPile: !!inPile, background: true });
    }
  });
  
  webview.addEventListener('did-fail-load', (e) => {
    // Ignorer ERR_ABORTED (-3) qui est normal lors des redirections/annulations
    // Ignorer aussi ERR_BLOCKED_BY_CLIENT (-20) pour les blocages publicitaires
    const ignoredErrors = [-3, -20, -102, -105, -106, -118, -137, -2];
    if (!ignoredErrors.includes(e.errorCode) && e.isMainFrame && e.validatedURL) {
      console.warn(`Failed to load ${e.validatedURL}: ${e.errorDescription} (${e.errorCode})`);
    }
  });
  
  // Ignorer les erreurs de console non critiques
  webview.addEventListener('console-message', (e) => {
    // Ne pas propager certaines erreurs de console qui sont des bugs connus
    if (e.message && (e.message.includes('dragEvent') || e.message.includes('ReferenceError: dragEvent'))) return;
  });
  
  // Mettre à jour l'état du bouton DevTools quand on ferme les DevTools
  webview.addEventListener('devtools-closed', () => {
    document.getElementById('devtools-btn').classList.remove('active');
  });
  
  // Menu contextuel avec options DevTools
  webview.addEventListener('context-menu', (e) => {
    e.preventDefault();
    if (webview._suppressContextMenuUntil && Date.now() < webview._suppressContextMenuUntil) return;
    showContextMenu(e.params, webview);
  });
}

function updateRefreshButton(isLoading) {
  const btn = document.getElementById('refresh-btn');
  btn.innerHTML = isLoading
    ? '<svg class="icon" viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>'
    : '<svg class="icon" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
  btn.title = isLoading ? 'Arrêter' : 'Rafraîchir';
}

// Variables pour le drag & drop des onglets
let draggedTab = null;
let draggedTabId = null;
let dragStartX = 0;
let tabStartX = 0;
let isDragging = false;

function setupTabDragAndDrop(tabElement, tabId) {
  tabElement.setAttribute('draggable', 'false'); // Désactiver le drag natif
  
  tabElement.addEventListener('mousedown', (e) => {
    // Ignorer si c'est le bouton fermer ou clic droit/molette
    if (e.target.closest('.tab-close') || e.button !== 0) return;
    
    draggedTab = tabElement;
    draggedTabId = tabId;
    dragStartX = e.clientX;
    tabStartX = tabElement.offsetLeft;
    isDragging = false;
    
    // Ajouter les listeners sur document
    document.addEventListener('mousemove', handleTabDrag);
    document.addEventListener('mouseup', handleTabDragEnd);
    
    e.preventDefault();
  });
}

function handleTabDrag(e) {
  if (!draggedTab) return;
  
  const deltaX = e.clientX - dragStartX;
  
  // Commencer le drag seulement après un déplacement minimum
  if (!isDragging && Math.abs(deltaX) > 5) {
    isDragging = true;
    draggedTab.classList.add('dragging');
  }
  
  if (!isDragging) return;
  
  // Déplacer l'onglet horizontalement
  draggedTab.style.transform = `translateX(${deltaX}px)`;
  draggedTab.style.zIndex = '100';
  
  // Trouver la position actuelle de l'onglet
  const tabsContainer = document.getElementById('tabs-container');
  const allTabs = Array.from(tabsContainer.querySelectorAll('.tab:not(#new-tab-btn)'));
  const draggedIndex = allTabs.indexOf(draggedTab);
  const draggedRect = draggedTab.getBoundingClientRect();
  const draggedCenter = draggedRect.left + draggedRect.width / 2;
  
  // Réorganiser les autres onglets visuellement
  allTabs.forEach((tab, index) => {
    if (tab === draggedTab) return;
    
    const tabRect = tab.getBoundingClientRect();
    const tabCenter = tabRect.left + tabRect.width / 2;
    
    if (draggedIndex < index && draggedCenter > tabCenter) {
      tab.style.transform = `translateX(-${draggedRect.width + 4}px)`;
      tab.dataset.shifted = 'left';
    } else if (draggedIndex > index && draggedCenter < tabCenter) {
      tab.style.transform = `translateX(${draggedRect.width + 4}px)`;
      tab.dataset.shifted = 'right';
    } else {
      tab.style.transform = '';
      tab.dataset.shifted = '';
    }
  });
}

function handleTabDragEnd(e) {
  document.removeEventListener('mousemove', handleTabDrag);
  document.removeEventListener('mouseup', handleTabDragEnd);
  
  if (!draggedTab) return;
  
  const tabsContainer = document.getElementById('tabs-container');
  const allTabs = Array.from(tabsContainer.querySelectorAll('.tab:not(#new-tab-btn)'));
  
  if (isDragging) {
    // Trouver la nouvelle position
    let newIndex = allTabs.indexOf(draggedTab);
    
    allTabs.forEach((tab, index) => {
      if (tab === draggedTab) return;
      
      if (tab.dataset.shifted === 'left' && index > newIndex) {
        newIndex = index;
      } else if (tab.dataset.shifted === 'right' && index < newIndex) {
        newIndex = index;
      }
    });
    
    // Désactiver les transitions avant de reset les positions
    allTabs.forEach(tab => {
      tab.style.transition = 'none';
    });
    
    // Réorganiser le DOM si nécessaire AVANT de reset les transforms
    const currentIndex = allTabs.indexOf(draggedTab);
    if (newIndex !== currentIndex) {
      const referenceTab = allTabs[newIndex];
      if (newIndex > currentIndex) {
        tabsContainer.insertBefore(draggedTab, referenceTab.nextSibling);
      } else {
        tabsContainer.insertBefore(draggedTab, referenceTab);
      }
      
      // Mettre à jour le tableau tabs
      const draggedTabData = tabs.find(t => t.id === draggedTabId);
      if (draggedTabData) {
        const oldIndex = tabs.indexOf(draggedTabData);
        tabs.splice(oldIndex, 1);
        tabs.splice(newIndex, 0, draggedTabData);
      }
    }
    
    // Réinitialiser les styles de tous les onglets
    allTabs.forEach(tab => {
      tab.style.transform = '';
      tab.style.zIndex = '';
      tab.dataset.shifted = '';
    });
    
    draggedTab.classList.remove('dragging');
    if (typeof pilesAfterDrag === 'function') pilesAfterDrag(draggedTabId);
    
    // Forcer un reflow puis réactiver les transitions
    void tabsContainer.offsetHeight;
    allTabs.forEach(tab => {
      tab.style.transition = '';
    });
  }
  
  draggedTab = null;
  draggedTabId = null;
  isDragging = false;
}

function closeTab(tabId) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;
  const tab = tabs[tabIndex];
  closedTabs.push({ url: tab.url, title: tab.title });
  if (closedTabs.length > 10) closedTabs.shift();
  
  const tabElement = document.getElementById(tabId);
  const webviewElement = document.getElementById(`webview-${tabId}`);
  
  // Animation de fermeture
  if (tabElement) {
    tabElement.classList.add('closing');
    tabElement.addEventListener('animationend', () => {
      tabElement.remove();
      webviewElement?.remove();
    }, { once: true });
  } else {
    webviewElement?.remove();
  }
  
  tabs.splice(tabIndex, 1);
  tabMru = tabMru.filter(id => id !== tabId);
  if (typeof bmOnTabClosed === 'function') bmOnTabClosed(tabId);
  if (typeof renderPiles === 'function') renderPiles();
  if (activeTabId === tabId) {
    if (tabs.length > 0) {
      switchToTab(tabs[Math.min(tabIndex, tabs.length - 1)].id);
    } else {
      // Fermer le navigateur si c'était le dernier onglet
      window.zenithAPI.closeWindow();
    }
  }
}

function switchToTab(tabId) {
  // Quitter la page de pile éventuellement affichée, et capturer l'aperçu de l'onglet quitté
  if (typeof closePilePage === 'function') closePilePage();
  if (typeof capturePileThumb === 'function' && activeTabId && activeTabId !== tabId) {
    capturePileThumb(tabs.find(t => t.id === activeTabId));
  }
  // Fermer les DevTools de l'ancien onglet si ouverts
  if (activeTabId && devToolsOpen) {
    const oldTab = tabs.find(t => t.id === activeTabId);
    if (oldTab?.webview) {
      try {
        const oldId = oldTab.webview.getWebContentsId();
        window.zenithAPI.closeDevToolsPanel(oldId);
      } catch(e) {}
    }
  }
  
  if (activeTabId) {
    document.getElementById(activeTabId)?.classList.remove('active');
    document.getElementById(`webview-${activeTabId}`)?.classList.remove('active');
  }
  activeTabId = tabId;
  // Ordre d'utilisation des onglets (pour Ctrl+Shift+Tab)
  tabMru = [tabId, ...tabMru.filter(id => id !== tabId)];
  updateBookmarkStar();
  if (typeof pilesOnSwitch === 'function') pilesOnSwitch(tabId);
  document.getElementById(tabId)?.classList.add('active');
  document.getElementById(`webview-${tabId}`)?.classList.add('active');
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    document.getElementById('url-bar').value = (tab.isNewTab || isHomePage(tab.url)) ? '' : (tab.url || '');
  }
  
  // Rebrancher les DevTools sur le nouvel onglet si le panneau est ouvert
  if (devToolsOpen && tab?.webview) {
    setTimeout(async () => {
      try {
        const targetId = tab.webview.getWebContentsId();
        const bounds = getDevToolsBounds();
        await window.zenithAPI.openDevToolsInPanel(targetId, bounds);
      } catch (e) {
        console.error('Erreur switch DevTools:', e);
      }
    }, 100);
  }
  if (typeof ccUpdateContext === 'function') ccUpdateContext();
}

function switchToNextTab() { if (tabs.length <= 1) return; const i = tabs.findIndex(t => t.id === activeTabId); switchToTab(tabs[(i + 1) % tabs.length].id); }
function switchToPreviousTab() { if (tabs.length <= 1) return; const i = tabs.findIndex(t => t.id === activeTabId); switchToTab(tabs[(i - 1 + tabs.length) % tabs.length].id); }
// ---- Onglet le plus récent (Ctrl+Shift+Tab) ----
// Un appui : retour à l'onglet utilisé juste avant. Appuis rapprochés : on remonte dans l'ordre d'utilisation.
let tabMru = [];
let mruCycle = null;
function switchToRecentTab() {
  const now = Date.now();
  if (!mruCycle || now - mruCycle.time > 1200) {
    mruCycle = { list: tabMru.filter(id => tabs.some(t => t.id === id)), index: 0 };
  }
  mruCycle.time = now;
  if (mruCycle.list.length < 2) return;
  mruCycle.index = (mruCycle.index + 1) % mruCycle.list.length;
  switchToTab(mruCycle.list[mruCycle.index]);
}

// ---- Liens ouverts par les pages (target=_blank, window.open, clic molette) ----
function handleWebviewOpenUrl({ url, disposition, sourceId }) {
  if (!url) return;
  const opener = tabs.find(t => {
    try { return t.webview && t.webview.getWebContentsId() === sourceId; } catch { return false; }
  });
  createNewTab(url, { openerId: opener?.id, background: disposition === 'background-tab' });
}

function reopenLastClosedTab() { if (!closedTabs.length) return; createNewTab(closedTabs.pop().url); }
function updateTabTitle(tabId, title) { const tab = tabs.find(t => t.id === tabId); if (tab) { tab.title = title; const el = document.getElementById(tabId); if (el) { el.querySelector('.tab-title').textContent = title; el.title = title; }} if (tabId === activeTabId && typeof ccUpdateContext === 'function') ccUpdateContext(); }
function updateTabUrl(tabId, url) { const tab = tabs.find(t => t.id === tabId); if (tab) tab.url = url; if (tabId === activeTabId) updateBookmarkStar(); }

function updateTabFavicon(tabId, faviconUrl) { 
  // Mémoriser le favicon de la page (utilisé par les signets)
  const favTab = tabs.find(t => t.id === tabId);
  if (favTab && /^https?:/.test(faviconUrl) && !faviconUrl.includes('google.com/s2/favicons')) favTab.faviconUrl = faviconUrl;
  const el = document.getElementById(tabId); 
  if (!el) return;
  
  const favContainer = el.querySelector('.tab-favicon');
  if (!favContainer) return;
  
  // Supprimer l'ancienne image si elle existe
  const oldImg = favContainer.querySelector('img');
  if (oldImg) oldImg.remove();
  
  const img = document.createElement('img');
  img.width = 16;
  img.height = 16;
  img.alt = '';
  img.src = faviconUrl;
  
  img.onerror = () => {
    // Fallback vers l'API Google Favicon
    const tab = tabs.find(t => t.id === tabId);
    if (tab && tab.url) {
      try {
        const urlObj = new URL(tab.url);
        const googleFavicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
        if (img.src !== googleFavicon) {
          img.src = googleFavicon;
        }
      } catch (e) {
        img.style.visibility = 'hidden';
      }
    }
  };
  
  favContainer.appendChild(img);
}

function loadFaviconFromUrl(tabId, pageUrl) {
  if (!pageUrl || pageUrl.startsWith('about:') || pageUrl.startsWith('file:')) return;
  try {
    const urlObj = new URL(pageUrl);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    updateTabFavicon(tabId, faviconUrl);
  } catch (e) {
    // URL invalide, ignorer
  }
}

function handleUrlBarKeydown(e) { if (e.key === 'Enter') { e.preventDefault(); navigateToUrl(e.target.value); }}

function navigateToUrl(input) {
  if (!input.trim()) return;
  let url = input.trim();
  // Pages internes
  if (url === 'zenith://bookmarks') { openBookmarksPage(); return; }
  if (url === 'zenith://history') { openHistoryPage(); return; }
  if (isValidUrl(url)) { if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url; }
  else url = SEARCH_ENGINES[currentSearchEngine].url + encodeURIComponent(url);
  // Depuis la page d'une pile : nouvel onglet dans cette pile
  if (typeof activePileView !== 'undefined' && activePileView) { pileOpenUrl(activePileView, url); return; }
  const tab = tabs.find(t => t.id === activeTabId);
  // Depuis une page interne (signets, historique) : ouvrir dans un nouvel onglet
  if (tab && !tab.webview) { createNewTab(url); return; }
  if (tab?.webview) { 
    tab.isNewTab = false;
    tab.webview.src = url; 
    tab.url = url; 
    document.getElementById('url-bar').value = url; 
  }
}

function isValidUrl(s) {
  return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i.test(s) ||
         /^(https?:\/\/)?localhost(:\d+)?(\/.*)?$/i.test(s) ||
         /^(https?:\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/i.test(s);
}

function isHomePage(url) {
  if (!url) return false;
  
  // Vérifier si c'est un fichier local pointant vers home/index.html
  if (url.startsWith('file://')) {
    // Normaliser le chemin (convertir backslashes en slashes et mettre en minuscule)
    const normalizedUrl = url.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
    return normalizedUrl.includes('/src/home/index.html') || normalizedUrl.includes('/home/index.html');
  }
  
  // Pour les URLs http/https, comparer avec DEFAULT_PAGE
  const normalizedUrl = url.replace(/\/$/, '');
  const normalizedDefault = DEFAULT_PAGE.replace(/\/$/, '');
  return normalizedUrl === normalizedDefault;
}

function goBack() { const tab = tabs.find(t => t.id === activeTabId); if (tab?.webview?.canGoBack()) tab.webview.goBack(); }
function goForward() { const tab = tabs.find(t => t.id === activeTabId); if (tab?.webview?.canGoForward()) tab.webview.goForward(); }
function refreshPage() {
  if (typeof activePileView !== 'undefined' && activePileView) { schedulePilePageRender(); return; } 
  const tab = tabs.find(t => t.id === activeTabId); 
  if (tab?.webview) {
    if (tab.webview.isLoading()) {
      tab.webview.stop();
    } else {
      tab.webview.reload();
    }
  }
}
function hardRefreshPage() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab?.webview) {
    tab.webview.reloadIgnoringCache();
  }
}
function stopLoading() { const tab = tabs.find(t => t.id === activeTabId); if (tab?.webview) tab.webview.stop(); }

// === DevTools Panel intégré avec BrowserView ===
let devToolsOpen = false;
let devToolsPanelWidth = parseInt(localStorage.getItem('devToolsWidth') || '450');
let isResizing = false;

function getDevToolsBounds() {
  const panel = document.getElementById('devtools-panel');
  const container = document.getElementById('devtools-container');
  const rect = container.getBoundingClientRect();
  
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function initializeDevToolsPanel() {
  const resizer = document.getElementById('devtools-resizer');
  const panel = document.getElementById('devtools-panel');
  
  // Resize handler
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.classList.add('resizing');
    resizer.classList.add('dragging');
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const mainContent = document.getElementById('main-content');
    const rect = mainContent.getBoundingClientRect();
    const newWidth = rect.right - e.clientX;
    
    // Limites min/max
    if (newWidth >= 280 && newWidth <= rect.width - 300) {
      devToolsPanelWidth = newWidth;
      panel.style.width = newWidth + 'px';
      
      // Mettre à jour la position du BrowserView
      if (devToolsOpen) {
        window.zenithAPI.resizeDevToolsPanel(getDevToolsBounds());
      }
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.classList.remove('resizing');
      document.getElementById('devtools-resizer').classList.remove('dragging');
      // Sauvegarder la taille
      localStorage.setItem('devToolsWidth', devToolsPanelWidth.toString());
    }
  });
  
  // Mettre à jour les bounds quand la fenêtre est redimensionnée
  window.addEventListener('resize', () => {
    if (devToolsOpen) {
      window.zenithAPI.resizeDevToolsPanel(getDevToolsBounds());
    }
  });
}

function toggleDevTools() {
  if (devToolsOpen) {
    closeDevToolsPanel();
  } else {
    openDevToolsPanel();
  }
}

async function openDevToolsPanel() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab?.webview) return;
  
  const panel = document.getElementById('devtools-panel');
  const resizer = document.getElementById('devtools-resizer');
  
  // Ouvrir le panneau UI d'abord
  panel.classList.add('open');
  panel.style.width = devToolsPanelWidth + 'px';
  resizer.classList.add('visible');
  devToolsOpen = true;
  document.getElementById('devtools-btn').classList.add('active');
  
  // Attendre que le panneau soit rendu
  await new Promise(r => setTimeout(r, 50));
  
  // Obtenir les bounds du container
  const bounds = getDevToolsBounds();
  
  // Lier les DevTools au panneau via le main process
  try {
    const targetId = tab.webview.getWebContentsId();
    const success = await window.zenithAPI.openDevToolsInPanel(targetId, bounds);
    if (!success) {
      console.error('Échec ouverture DevTools');
    }
  } catch (e) {
    console.error('DevTools error:', e);
  }
}

async function closeDevToolsPanel() {
  const tab = tabs.find(t => t.id === activeTabId);
  const panel = document.getElementById('devtools-panel');
  const resizer = document.getElementById('devtools-resizer');
  
  // Fermer les DevTools via le main process
  try {
    const targetId = tab?.webview?.getWebContentsId();
    await window.zenithAPI.closeDevToolsPanel(targetId);
  } catch (e) {
    console.error('Error closing devtools:', e);
  }
  
  // Fermer le panneau UI
  panel.classList.remove('open');
  resizer.classList.remove('visible');
  devToolsOpen = false;
  document.getElementById('devtools-btn').classList.remove('active');
}

function openDevToolsInspect() {
  // Ouvrir le panneau DevTools seulement, sans appeler inspectElement
  // qui ouvrirait une fenêtre séparée
  if (!devToolsOpen) {
    openDevToolsPanel();
  }
}

function openDevToolsConsole() {
  openDevToolsPanel();
}


function goHome() { 
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab?.webview) {
    tab.webview.src = DEFAULT_PAGE;
    document.getElementById('url-bar').value = '';
  }
}
function focusUrlBar() { const urlBar = document.getElementById('url-bar'); urlBar.focus(); urlBar.select(); }
function updateSearchEnginePlaceholder() { document.getElementById('url-bar').placeholder = `Rechercher avec ${SEARCH_ENGINES[currentSearchEngine].name} ou entrer une URL`; }

function toggleSettingsMenu() {
  const menu = document.getElementById('settings-menu');
  const overlay = document.getElementById('settings-overlay');
  closePermissionsMenu(); // Fermer le menu des permissions si ouvert
  menu.classList.contains('visible') ? closeSettingsMenu() : (menu.classList.add('visible'), overlay.classList.add('visible'));
}

function closeSettingsMenu() {
  document.getElementById('settings-menu').classList.remove('visible');
  document.getElementById('settings-overlay').classList.remove('visible');
}

// === Système de Permissions ===
const PERMISSION_TYPES = {
  geolocation: { label: 'Localisation', icon: '<svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' },
  notifications: { label: 'Notifications', icon: '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' },
  media: { label: 'Caméra/Micro', icon: '<svg viewBox="0 0 24 24"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' },
  clipboard: { label: 'Presse-papiers', icon: '<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>' },
  midi: { label: 'Appareils MIDI', icon: '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' },
  pointerLock: { label: 'Souris', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
  fullscreen: { label: 'Plein écran', icon: '<svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>' }
};

let currentPermissionRequest = null;

function initializePermissions() {
  // Bouton permissions
  document.getElementById('permissions-btn').addEventListener('click', togglePermissionsMenu);
  document.getElementById('permissions-overlay').addEventListener('click', closePermissionsMenu);
  document.getElementById('reset-site-permissions').addEventListener('click', resetCurrentSitePermissions);
  
  // Boutons du modal de permission
  document.getElementById('permission-allow').addEventListener('click', () => handlePermissionResponse(true));
  document.getElementById('permission-deny').addEventListener('click', () => handlePermissionResponse(false));
  
  // Écouter les demandes de permission du main process
  window.zenithAPI.onPermissionRequest((data) => {
    showPermissionModal(data.origin, data.permission, data.permissionLabel);
  });
}

function togglePermissionsMenu() {
  const menu = document.getElementById('permissions-menu');
  const overlay = document.getElementById('permissions-overlay');
  closeSettingsMenu(); // Fermer le menu des paramètres si ouvert
  
  if (menu.classList.contains('visible')) {
    closePermissionsMenu();
  } else {
    updatePermissionsMenu();
    menu.classList.add('visible');
    overlay.classList.add('visible');
  }
}

function closePermissionsMenu() {
  document.getElementById('permissions-menu').classList.remove('visible');
  document.getElementById('permissions-overlay').classList.remove('visible');
}

async function updatePermissionsMenu() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab || !activeTab.url) return;
  
  let origin;
  try {
    origin = new URL(activeTab.url).origin;
  } catch {
    origin = activeTab.url;
  }
  
  document.getElementById('current-site-origin').textContent = origin;
  
  const permissions = await window.zenithAPI.getSitePermissions(origin);
  const listEl = document.getElementById('permissions-list');
  
  if (Object.keys(PERMISSION_TYPES).length === 0) {
    listEl.innerHTML = '<div class="no-permissions">Aucune permission configurée</div>';
    return;
  }
  
  listEl.innerHTML = Object.entries(PERMISSION_TYPES).map(([key, { label, icon }]) => {
    const value = permissions[key];
    const isAllowed = value === true;
    const isBlocked = value === false;
    const isAsk = value === undefined || value === null;
    
    return `
      <div class="permission-item" data-permission="${key}" data-origin="${origin}">
        <div class="permission-item-info">
          <div class="perm-icon">${icon}</div>
          <span class="permission-item-label">${label}</span>
        </div>
        <div class="permission-item-status">
          <button class="permission-status-btn blocked ${isBlocked ? 'active' : ''}" data-value="false" title="Bloquer">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <button class="permission-status-btn ask ${isAsk ? 'active' : ''}" data-value="null" title="Demander">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
          <button class="permission-status-btn allowed ${isAllowed ? 'active' : ''}" data-value="true" title="Autoriser">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Ajouter les event listeners
  listEl.querySelectorAll('.permission-status-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const item = e.target.closest('.permission-item');
      const permission = item.dataset.permission;
      const origin = item.dataset.origin;
      const valueStr = e.target.dataset.value;
      const value = valueStr === 'true' ? true : valueStr === 'false' ? false : null;
      
      await window.zenithAPI.setSitePermission(origin, permission, value);
      
      // Mettre à jour l'UI
      item.querySelectorAll('.permission-status-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });
}

async function resetCurrentSitePermissions() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab || !activeTab.url) return;
  
  try {
    const origin = new URL(activeTab.url).origin;
    await window.zenithAPI.removeSitePermissions(origin);
    updatePermissionsMenu();
    showNotification('Permissions réinitialisées');
  } catch {
    showNotification('Erreur lors de la réinitialisation');
  }
}

function showPermissionModal(origin, permission, permissionLabel) {
  const modal = document.getElementById('permission-modal');
  const typeInfo = PERMISSION_TYPES[permission] || { label: permissionLabel || permission };
  
  document.getElementById('permission-origin').textContent = origin;
  document.getElementById('permission-type').textContent = typeInfo.label.toLowerCase();
  
  currentPermissionRequest = { origin, permission };
  modal.classList.remove('modal-hidden');
}

function hidePermissionModal() {
  document.getElementById('permission-modal').classList.add('modal-hidden');
  currentPermissionRequest = null;
}

async function handlePermissionResponse(granted) {
  if (!currentPermissionRequest) return;
  
  const { origin, permission } = currentPermissionRequest;
  
  // Sauvegarder la réponse
  await window.zenithAPI.setSitePermission(origin, permission, granted);
  
  // Envoyer la réponse au main process
  window.zenithAPI.sendPermissionResponse(origin, permission, granted);
  
  hidePermissionModal();
  
  // Notification
  showNotification(granted ? 'Permission accordée' : 'Permission bloquée');
}

async function toggleAdBlocker() { const enabled = await window.zenithAPI.toggleAdBlocker(); updateAdBlockerUI(enabled); }
function updateAdBlockerUI(enabled) { document.getElementById('toggle-adblocker').classList.toggle('active', enabled); }
async function clearCookies() { if (await window.zenithAPI.clearCookies()) showNotification('Cookies supprimés'); }
async function toggleThirdPartyCookies() { const blocked = await window.zenithAPI.toggleThirdPartyCookies(); updateThirdPartyCookiesUI(blocked); }
function updateThirdPartyCookiesUI(blocked) { document.getElementById('toggle-third-party').classList.toggle('active', blocked); }

async function clearBrowsingData() {
  if (confirm('Effacer toutes les données de navigation ?')) {
    if (await window.zenithAPI.clearBrowsingData()) { showNotification('Données effacées'); tabs.forEach(t => t.webview?.reload()); }
  }
}

function showNotification(message) {
  const n = document.createElement('div');
  n.className = 'notification';
  n.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>${message}`;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 250); }, 2500);
}

// === Context Menu ===
let currentContextMenu = null;

function showContextMenu(params, webview) {
  // Fermer l'ancien menu s'il existe
  if (currentContextMenu) {
    currentContextMenu.remove();
    currentContextMenu = null;
  }
  
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  
  const items = [];
  
  // Si on a sélectionné du texte
  if (params.selectionText) {
    items.push({
      label: 'Copier',
      icon: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      action: () => webview.copy()
    });
    items.push({
      label: `Rechercher "${params.selectionText.slice(0, 20)}${params.selectionText.length > 20 ? '...' : ''}"`,
      icon: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      action: () => {
        const searchUrl = SEARCH_ENGINES[currentSearchEngine].url + encodeURIComponent(params.selectionText);
        createNewTab(searchUrl);
      }
    });
    items.push({ separator: true });
  }
  
  // Claude Connect : demander à Claude à propos de la sélection
  if (params.selectionText) {
    items.splice(items.length - 1, 0, {
      label: 'Demander à Claude',
      icon: CC_ICONS.spark.replace('class="icon" ', ''),
      action: () => ccAskAboutSelection(params.selectionText, webview)
    });
  }

  // Si c'est un lien
  if (params.linkURL) {
    items.push({
      label: 'Ouvrir le lien dans un nouvel onglet',
      icon: '<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
      action: () => createNewTab(params.linkURL, { openerId: tabs.find(t => t.webview === webview)?.id })
    });
    items.push({
      label: 'Copier l\'adresse du lien',
      icon: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      action: () => navigator.clipboard.writeText(params.linkURL)
    });
    items.push({ separator: true });
  }
  
  // Si c'est une image
  if (params.mediaType === 'image' && params.srcURL) {
    items.push({
      label: 'Ouvrir l\'image dans un nouvel onglet',
      icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
      action: () => createNewTab(params.srcURL)
    });
    items.push({
      label: 'Copier l\'adresse de l\'image',
      icon: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      action: () => navigator.clipboard.writeText(params.srcURL)
    });
    items.push({ separator: true });
  }
  
  // Signets
  if (params.linkURL) {
    // Inséré avant le séparateur du bloc "lien"
    items.splice(items.length - 1, 0, {
      label: 'Ajouter le lien aux signets',
      icon: BM_ICONS.bookmark,
      action: () => bookmarkLink(params.linkURL, params.linkText)
    });
  }

  // Actions générales
  items.push({
    label: 'Retour',
    icon: '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
    action: () => webview.goBack(),
    disabled: !webview.canGoBack()
  });
  items.push({
    label: 'Avancer',
    icon: '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
    action: () => webview.goForward(),
    disabled: !webview.canGoForward()
  });
  items.push({
    label: 'Actualiser',
    icon: '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    action: () => webview.reload()
  });
  items.push({
    label: 'Ajouter la page aux signets',
    icon: BM_ICONS.bookmark,
    action: () => bookmarkCurrentPage(),
    shortcut: 'Ctrl+D'
  });
  items.push({
    label: 'Résumer la page avec Claude',
    icon: CC_ICONS.spark.replace('class="icon" ', ''),
    action: () => ccAskAboutPage('Résume cette page')
  });
  
  items.push({ separator: true });
  
  // DevTools
  items.push({
    label: 'Inspecter',
    icon: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    action: async () => {
      if (!devToolsOpen) {
        await openDevToolsPanel();
      }
      // Attendre que le panneau soit ouvert avant d'inspecter
      setTimeout(() => {
        webview.inspectElement(params.x, params.y);
      }, 300);
    },
    shortcut: 'Ctrl+Shift+C'
  });
  items.push({
    label: 'Outils de développement',
    icon: '<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    action: () => toggleDevTools(),
    shortcut: 'F12'
  });
  
  // Générer le HTML du menu
  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
    } else {
      const menuItem = document.createElement('div');
      menuItem.className = 'context-menu-item' + (item.disabled ? ' disabled' : '');
      menuItem.innerHTML = `
        <span class="context-menu-icon">${item.icon}</span>
        <span class="context-menu-label">${item.label}</span>
        ${item.shortcut ? `<span class="context-menu-shortcut">${item.shortcut}</span>` : ''}
      `;
      if (!item.disabled) {
        menuItem.addEventListener('click', () => {
          item.action();
          menu.remove();
          currentContextMenu = null;
        });
      }
      menu.appendChild(menuItem);
    }
  });
  
  document.body.appendChild(menu);
  currentContextMenu = menu;
  
  // Positionner le menu
  const rect = menu.getBoundingClientRect();
  let x = params.x;
  let y = params.y;
  
  // Ajuster si le menu dépasse de l'écran
  if (x + rect.width > window.innerWidth) {
    x = window.innerWidth - rect.width - 10;
  }
  if (y + rect.height > window.innerHeight) {
    y = window.innerHeight - rect.height - 10;
  }
  
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  
  // Fermer le menu quand on clique ailleurs
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      currentContextMenu = null;
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
    document.addEventListener('contextmenu', closeMenu);
  }, 10);
}

// ========== SYSTÈME DE TÉLÉCHARGEMENTS ==========
let downloads = new Map();
let downloadsPanelOpen = false;
let activeDownloadsCount = 0;

function initializeDownloads() {
  // Écouter les événements de téléchargement
  window.zenithAPI.onDownloadStarted((data) => {
    downloads.set(data.id, data);
    activeDownloadsCount++;
    updateDownloadsBadge();
    addDownloadToUI(data);
    // Ouvrir automatiquement le panneau si c'est le premier téléchargement actif
    if (activeDownloadsCount === 1 && !downloadsPanelOpen) {
      openDownloadsPanel();
    }
  });

  window.zenithAPI.onDownloadProgress((data) => {
    const download = downloads.get(data.id);
    if (download) {
      download.receivedBytes = data.receivedBytes;
      download.totalBytes = data.totalBytes;
      download.state = data.state;
      download.isPaused = data.isPaused;
      download.speed = data.speed || 0;
      updateDownloadUI(data.id);
    }
  });

  window.zenithAPI.onDownloadCompleted((data) => {
    const download = downloads.get(data.id);
    if (download) {
      download.state = data.state;
      download.savePath = data.savePath;
      updateDownloadUI(data.id);
      activeDownloadsCount = Math.max(0, activeDownloadsCount - 1);
      updateDownloadsBadge();
    }
  });

  // Bouton et overlay
  document.getElementById('downloads-btn').addEventListener('click', toggleDownloadsPanel);
  document.getElementById('downloads-overlay').addEventListener('click', closeDownloadsPanel);
  document.getElementById('close-downloads').addEventListener('click', closeDownloadsPanel);
  document.getElementById('clear-downloads').addEventListener('click', clearDownloadHistory);

  // Charger les téléchargements existants
  loadExistingDownloads();
}

async function loadExistingDownloads() {
  try {
    const existingDownloads = await window.zenithAPI.getDownloads();
    existingDownloads.forEach(d => {
      downloads.set(d.id, d);
      if (d.state === 'progressing') activeDownloadsCount++;
      addDownloadToUI(d);
    });
    updateDownloadsBadge();
  } catch (e) {
    console.error('Erreur chargement téléchargements:', e);
  }
}

function toggleDownloadsPanel() {
  if (downloadsPanelOpen) {
    closeDownloadsPanel();
  } else {
    openDownloadsPanel();
  }
}

function openDownloadsPanel() {
  document.getElementById('downloads-panel').classList.add('active');
  document.getElementById('downloads-overlay').classList.add('active');
  downloadsPanelOpen = true;
}

function closeDownloadsPanel() {
  document.getElementById('downloads-panel').classList.remove('active');
  document.getElementById('downloads-overlay').classList.remove('active');
  downloadsPanelOpen = false;
}

function updateDownloadsBadge() {
  const badge = document.getElementById('downloads-badge');
  if (activeDownloadsCount > 0) {
    badge.textContent = activeDownloadsCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function addDownloadToUI(download) {
  const list = document.getElementById('downloads-list');
  const empty = list.querySelector('.downloads-empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = 'download-item';
  item.id = `download-${download.id}`;
  item.innerHTML = getDownloadItemHTML(download);
  
  // Insérer au début
  list.insertBefore(item, list.firstChild);
  
  // Attacher les événements
  attachDownloadEvents(item, download.id);
}

function getDownloadItemHTML(download) {
  const isCompleted = download.state === 'completed';
  const isFailed = download.state === 'cancelled' || download.state === 'interrupted';
  const isProgressing = download.state === 'progressing';
  const isPaused = download.isPaused;
  
  const iconClass = isCompleted ? 'completed' : (isFailed ? 'failed' : 'progressing');
  const icon = isCompleted ? 
    '<svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' :
    (isFailed ? 
      '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' :
      '<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>');
  
  const progress = download.totalBytes > 0 ? 
    Math.round((download.receivedBytes / download.totalBytes) * 100) : 0;
  
  const statusText = getDownloadStatusText(download);
  const statusClass = isCompleted ? 'completed' : (isFailed ? 'failed' : '');
  
  let controls = '';
  if (isProgressing) {
    if (isPaused) {
      controls = `
        <button class="download-ctrl-btn resume" title="Reprendre"><svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
        <button class="download-ctrl-btn cancel" title="Annuler"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      `;
    } else {
      controls = `
        <button class="download-ctrl-btn pause" title="Pause"><svg class="icon" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button>
        <button class="download-ctrl-btn cancel" title="Annuler"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      `;
    }
  } else if (isCompleted) {
    controls = `
      <button class="download-ctrl-btn open" title="Ouvrir"><svg class="icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
      <button class="download-ctrl-btn folder" title="Afficher dans le dossier"><svg class="icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></button>
      <button class="download-ctrl-btn remove" title="Supprimer de la liste"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    `;
  } else {
    controls = `
      <button class="download-ctrl-btn remove" title="Supprimer de la liste"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    `;
  }

  return `
    <div class="download-icon ${iconClass}">${icon}</div>
    <div class="download-info">
      <div class="download-filename" title="${download.filename}">${download.filename}</div>
      <div class="download-status ${statusClass}">${statusText}</div>
      ${isProgressing ? `<div class="download-progress-bar"><div class="download-progress-fill" style="width: ${progress}%"></div></div>` : ''}
    </div>
    <div class="download-controls">${controls}</div>
  `;
}

function getDownloadStatusText(download) {
  const isCompleted = download.state === 'completed';
  const isFailed = download.state === 'cancelled' || download.state === 'interrupted';
  const isProgressing = download.state === 'progressing';
  
  if (isCompleted) {
    return `Terminé - ${formatFileSize(download.totalBytes || download.receivedBytes)}`;
  }
  
  if (isFailed) {
    return download.state === 'cancelled' ? 'Annulé' : 'Interrompu';
  }
  
  if (isProgressing) {
    const progress = download.totalBytes > 0 ? 
      Math.round((download.receivedBytes / download.totalBytes) * 100) : 0;
    
    if (download.isPaused) {
      return `En pause - ${progress}% de ${formatFileSize(download.totalBytes)}`;
    }
    
    const speedText = download.speed > 0 ? ` - ${formatFileSize(download.speed)}/s` : '';
    return `${formatFileSize(download.receivedBytes)} / ${formatFileSize(download.totalBytes)} (${progress}%)${speedText}`;
  }
  
  return 'En attente...';
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function updateDownloadUI(downloadId) {
  const download = downloads.get(downloadId);
  if (!download) return;
  
  const item = document.getElementById(`download-${downloadId}`);
  if (item) {
    item.innerHTML = getDownloadItemHTML(download);
    attachDownloadEvents(item, downloadId);
  }
}

function attachDownloadEvents(item, downloadId) {
  const download = downloads.get(downloadId);
  if (!download) return;

  const pauseBtn = item.querySelector('.pause');
  const resumeBtn = item.querySelector('.resume');
  const cancelBtn = item.querySelector('.cancel');
  const openBtn = item.querySelector('.open');
  const folderBtn = item.querySelector('.folder');
  const removeBtn = item.querySelector('.remove');

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => window.zenithAPI.pauseDownload(downloadId));
  }
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => window.zenithAPI.resumeDownload(downloadId));
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => window.zenithAPI.cancelDownload(downloadId));
  }
  if (openBtn) {
    openBtn.addEventListener('click', () => window.zenithAPI.openDownload(download.savePath));
  }
  if (folderBtn) {
    folderBtn.addEventListener('click', () => window.zenithAPI.showDownloadInFolder(download.savePath));
  }
  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      await window.zenithAPI.removeDownloadFromList(downloadId);
      downloads.delete(downloadId);
      item.remove();
      checkEmptyDownloads();
    });
  }
}

async function clearDownloadHistory() {
  await window.zenithAPI.clearDownloadHistory();
  // Retirer tous les téléchargements terminés de l'UI
  for (const [id, download] of downloads.entries()) {
    if (download.state !== 'progressing') {
      downloads.delete(id);
      const item = document.getElementById(`download-${id}`);
      if (item) item.remove();
    }
  }
  checkEmptyDownloads();
}

function checkEmptyDownloads() {
  const list = document.getElementById('downloads-list');
  if (downloads.size === 0) {
    list.innerHTML = `
      <div class="downloads-empty">
        <svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>Aucun téléchargement</span>
      </div>
    `;
  }
}

// ========== SYSTÈME D'HISTORIQUE ==========
function openHistoryPage() {
  // Une seule page d'historique : si elle est déjà ouverte, on y retourne (et on la rafraîchit)
  const existing = tabs.find(t => t.isHistoryPage);
  if (existing) {
    switchToTab(existing.id);
    const content = existing.element?.querySelector('#history-content');
    const toggle = existing.element?.querySelector('#history-enabled-toggle');
    const search = existing.element?.querySelector('#history-search');
    if (content && toggle && !(search && search.value.trim())) loadHistoryContent(content, toggle.checked);
    return;
  }

  // Créer un nouvel onglet avec la page d'historique interne
  const tabId = `tab-${++tabCounter}`;
  
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  tabElement.id = tabId;
  tabElement.innerHTML = `
    <div class="tab-favicon">
      <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    </div>
    <span class="tab-title">Historique</span>
    <button class="tab-close" title="Fermer">
      <svg class="icon" viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>
  `;
  tabElement.addEventListener('click', (e) => { if (!e.target.closest('.tab-close')) switchToTab(tabId); });
  tabElement.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(tabId); });
  
  // Clic molette pour fermer l'onglet
  tabElement.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  });
  
  const newTabBtn = document.getElementById('new-tab-btn');
  document.getElementById('tabs-container').insertBefore(tabElement, newTabBtn);
  
  // Créer le conteneur pour la page d'historique
  const historyPage = document.createElement('div');
  historyPage.id = `webview-${tabId}`;
  historyPage.className = 'browser-view history-page';
  historyPage.innerHTML = getHistoryPageHTML();
  
  document.getElementById('webviews-container').appendChild(historyPage);
  
  tabs.push({ id: tabId, url: 'zenith://history', title: 'Historique', isHistoryPage: true, element: historyPage });
  switchToTab(tabId);
  
  // Initialiser la page d'historique
  initializeHistoryPage(historyPage);
}

function getHistoryPageHTML() {
  return `
    <div class="history-container">
      <div class="history-header">
        <h1>
          <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Historique
        </h1>
        <div class="history-actions">
          <div class="history-search-container">
            <svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="history-search" placeholder="Rechercher dans l'historique..." autocomplete="off">
          </div>
          <button id="clear-all-history" class="history-btn danger">
            <svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Effacer tout l'historique
          </button>
        </div>
      </div>
      <div class="history-settings-bar">
        <label class="history-toggle">
          <input type="checkbox" id="history-enabled-toggle">
          <span class="toggle-slider"></span>
          <span class="toggle-label">Enregistrer l'historique de navigation</span>
        </label>
      </div>
      <div id="history-content">
        <div class="history-loading">Chargement de l'historique...</div>
      </div>
    </div>
  `;
}

async function initializeHistoryPage(container) {
  const settings = await window.zenithAPI.getHistorySettings();
  const toggle = container.querySelector('#history-enabled-toggle');
  const searchInput = container.querySelector('#history-search');
  const clearBtn = container.querySelector('#clear-all-history');
  const content = container.querySelector('#history-content');
  
  toggle.checked = settings.enabled;
  
  toggle.addEventListener('change', async () => {
    await window.zenithAPI.setHistoryEnabled(toggle.checked);
    loadHistoryContent(content, toggle.checked);
  });
  
  searchInput.addEventListener('input', debounce(async () => {
    if (!toggle.checked) return;
    const query = searchInput.value.trim();
    if (query) {
      const results = await window.zenithAPI.searchHistory(query);
      renderHistoryList(content, results, true);
    } else {
      const history = await window.zenithAPI.getHistory();
      renderHistoryList(content, history, true);
    }
  }, 300));
  
  clearBtn.addEventListener('click', async () => {
    if (confirm('Voulez-vous vraiment effacer tout l\'historique ?')) {
      await window.zenithAPI.clearHistory();
      loadHistoryContent(content, toggle.checked);
    }
  });
  
  loadHistoryContent(content, settings.enabled);
}

async function loadHistoryContent(container, enabled) {
  if (!enabled) {
    container.innerHTML = `
      <div class="history-disabled">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        <h2>L'historique est désactivé</h2>
        <p>Activez l'enregistrement de l'historique pour voir vos pages visitées.</p>
      </div>
    `;
    return;
  }
  
  const history = await window.zenithAPI.getHistory();
  renderHistoryList(container, history, true);
}

function renderHistoryList(container, history, groupByDay = true) {
  if (!history || history.length === 0) {
    container.innerHTML = `
      <div class="history-empty">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <h2>Aucun historique</h2>
        <p>Les pages que vous visitez apparaîtront ici.</p>
      </div>
    `;
    return;
  }
  
  // Trier par date décroissante
  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
  
  if (groupByDay) {
    const grouped = groupHistoryByDay(sorted);
    container.innerHTML = '';
    
    for (const [dateKey, items] of Object.entries(grouped)) {
      const daySection = document.createElement('div');
      daySection.className = 'history-day-section';
      daySection.innerHTML = `
        <div class="history-day-header">
          <span class="history-day-title">${formatHistoryDate(dateKey)}</span>
          <span class="history-day-count">${items.length} page${items.length > 1 ? 's' : ''}</span>
        </div>
        <div class="history-day-items"></div>
      `;
      
      const itemsContainer = daySection.querySelector('.history-day-items');
      items.forEach(item => {
        itemsContainer.appendChild(createHistoryItemElement(item));
      });
      
      container.appendChild(daySection);
    }
  } else {
    container.innerHTML = '';
    sorted.forEach(item => {
      container.appendChild(createHistoryItemElement(item));
    });
  }
}

function groupHistoryByDay(history) {
  const groups = {};
  history.forEach(item => {
    const date = new Date(item.timestamp);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(item);
  });
  return groups;
}

function formatHistoryDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return "Aujourd'hui";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Hier";
  } else {
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    return date.toLocaleDateString('fr-FR', options);
  }
}

function createHistoryItemElement(item) {
  const div = document.createElement('div');
  div.className = 'history-item';
  
  const time = new Date(item.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const domain = getDomainFromUrl(item.url);
  
  div.innerHTML = `
    <div class="history-item-favicon">
      ${item.favicon ? `<img src="${item.favicon}" onerror="this.style.display='none'">` : ''}
      <svg class="icon fallback" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
    </div>
    <div class="history-item-info">
      <div class="history-item-title" title="${item.title || item.url}">${item.title || item.url}</div>
      <div class="history-item-url" title="${item.url}">${domain}</div>
    </div>
    <div class="history-item-time">${time}</div>
    <div class="history-item-actions">
      <button class="history-item-btn open" title="Ouvrir">
        <svg class="icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </button>
      <button class="history-item-btn delete" title="Supprimer">
        <svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
  
  div.querySelector('.open').addEventListener('click', () => {
    createNewTab(item.url);
  });
  
  div.querySelector('.delete').addEventListener('click', async () => {
    await window.zenithAPI.deleteHistoryEntry(item.timestamp);
    div.remove();
  });
  
  // Double-clic pour ouvrir
  div.addEventListener('dblclick', () => {
    createNewTab(item.url);
  });
  
  return div;
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ========== MENU PARAMÈTRES : SECTIONS RÉTRACTABLES ==========
function setupCollapsibleSettings() {
  let state = {};
  try { state = JSON.parse(localStorage.getItem('settingsCollapsed') || '{}'); } catch {}
  document.querySelectorAll('#settings-menu .settings-section.collapsible').forEach(section => {
    const key = section.dataset.key;
    const title = section.querySelector('.settings-title');
    // Rétractée par défaut
    section.classList.toggle('collapsed', state[key] !== false);
    title.addEventListener('click', () => {
      const collapsed = section.classList.toggle('collapsed');
      state[key] = collapsed;
      localStorage.setItem('settingsCollapsed', JSON.stringify(state));
    });
  });
}

// ============================================================
// ======================= SIGNETS  ===========================
// ============================================================

/**
 * Zenith Browser - Système de signets (inspiré des signets d'Opera)
 *
 * - Bouton signet dans la barre d'URL (Ctrl+D) avec popup d'édition
 * - Barre de signets sous la barre de navigation (Ctrl+Shift+B), dossiers en menus déroulants
 * - Gestionnaire de signets zenith://bookmarks (Ctrl+Shift+O) : arborescence, vues
 *   grandes vignettes / petites vignettes / liste, recherche, glisser-déposer, corbeille,
 *   import / export au format HTML (compatible Opera, Chrome, Firefox, Edge)

 */

// ========== ICÔNES ==========
const BM_ICONS = {
  bookmark: '<svg class="icon" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  folder: '<svg class="icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  folderPlus: '<svg class="icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
  globe: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  caret: '<svg class="icon" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
  chevronDown: '<svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
  chevrons: '<svg class="icon" viewBox="0 0 24 24"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>',
  gridLarge: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  gridSmall: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="4" height="4" rx=".5"/><rect x="10" y="3" width="4" height="4" rx=".5"/><rect x="17" y="3" width="4" height="4" rx=".5"/><rect x="3" y="10" width="4" height="4" rx=".5"/><rect x="10" y="10" width="4" height="4" rx=".5"/><rect x="17" y="10" width="4" height="4" rx=".5"/><rect x="3" y="17" width="4" height="4" rx=".5"/><rect x="10" y="17" width="4" height="4" rx=".5"/><rect x="17" y="17" width="4" height="4" rx=".5"/></svg>',
  list: '<svg class="icon" viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  search: '<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  edit: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  open: '<svg class="icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  restore: '<svg class="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  importIcon: '<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  exportIcon: '<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  eye: '<svg class="icon" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  tabs: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2"/></svg>'
};

const BM_ROOT_TITLES = { bar: 'Barre de signets', other: 'Autres signets' };
const BM_DRAG_TYPE = 'application/x-zenith-bookmarks';

let bookmarksData = null;
let bmSaveTimer = null;
let bmDragIds = null;          // ids en cours de glisser-déposer
let bmManager = null;          // état de la page gestionnaire (une seule instance)
let bmMenuStack = [];          // menus déroulants ouverts (barre de signets)
let bmFloating = [];           // éléments flottants (popup, menu contextuel)
let bmDialogResolve = null;

// ========== UTILITAIRES ==========
function bmUid() {
  return 'bm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function bmEl(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

function bmHost(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function bmNormalizeUrl(url) {
  return (url || '').trim().replace(/#$/, '').replace(/\/$/, '');
}

function bmFixUrl(input) {
  let url = (input || '').trim();
  if (!url) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return 'https://' + url;
}

function bmIsBookmarkableUrl(url) {
  if (!url) return false;
  if (typeof isHomePage === 'function' && isHomePage(url)) return false;
  return /^(https?|file|ftp):/i.test(url);
}

function bmDisplayUrl(url) {
  return (url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function bmFolderTitle(node) {
  return BM_ROOT_TITLES[node.id] || node.title || 'Sans nom';
}

function bmNewFolder(title) {
  return { id: bmUid(), type: 'folder', title, children: [], dateAdded: Date.now() };
}

function bmNewUrl(title, url, favicon) {
  return { id: bmUid(), type: 'url', title: title || url, url, favicon: favicon || '', dateAdded: Date.now() };
}

function bmDefaultData() {
  return {
    version: 1,
    roots: {
      bar: { id: 'bar', type: 'folder', title: BM_ROOT_TITLES.bar, children: [], dateAdded: Date.now() },
      other: { id: 'other', type: 'folder', title: BM_ROOT_TITLES.other, children: [], dateAdded: Date.now() }
    },
    trash: [],
    settings: { showBar: true }
  };
}

function bmSanitizeNode(n) {
  if (!n || typeof n !== 'object') return null;
  if (n.type === 'folder') {
    return {
      id: n.id || bmUid(), type: 'folder', title: String(n.title || 'Sans nom'),
      dateAdded: n.dateAdded || Date.now(),
      children: Array.isArray(n.children) ? n.children.map(bmSanitizeNode).filter(Boolean) : []
    };
  }
  if (!n.url) return null;
  return {
    id: n.id || bmUid(), type: 'url', title: String(n.title || n.url), url: String(n.url),
    favicon: n.favicon || '', dateAdded: n.dateAdded || Date.now()
  };
}

function bmNormalizeData(raw) {
  const data = bmDefaultData();
  if (!raw || typeof raw !== 'object' || !raw.roots) return data;
  for (const key of ['bar', 'other']) {
    const r = raw.roots[key];
    if (r && Array.isArray(r.children)) {
      data.roots[key].children = r.children.map(bmSanitizeNode).filter(Boolean);
    }
  }
  if (Array.isArray(raw.trash)) {
    data.trash = raw.trash
      .map(t => t && t.node ? { ...t, node: bmSanitizeNode(t.node) } : null)
      .filter(t => t && t.node);
  }
  if (raw.settings) data.settings = { ...data.settings, ...raw.settings };
  return data;
}

// ========== MODÈLE (ARBRE) ==========
function bmRoots() { return [bookmarksData.roots.bar, bookmarksData.roots.other]; }

function bmWalk(fn) {
  const visit = (node, parent, path) => {
    if (fn(node, parent, path) === false) return false;
    if (node.type === 'folder') {
      for (const c of node.children) {
        if (visit(c, node, [...path, node]) === false) return false;
      }
    }
    return true;
  };
  for (const r of bmRoots()) if (visit(r, null, []) === false) return;
}

function bmFind(id) {
  let found = null;
  bmWalk((node, parent, path) => {
    if (node.id === id) {
      found = { node, parent, path, index: parent ? parent.children.indexOf(node) : -1 };
      return false;
    }
  });
  return found;
}

function bmFindByUrl(url) {
  const target = bmNormalizeUrl(url);
  if (!target) return null;
  let found = null;
  bmWalk(node => {
    if (node.type === 'url' && bmNormalizeUrl(node.url) === target) { found = node; return false; }
  });
  return found;
}

function bmIsRoot(id) { return id === 'bar' || id === 'other'; }

function bmIsAncestor(ancestorId, id) {
  const info = bmFind(id);
  if (!info) return false;
  return info.path.some(p => p.id === ancestorId);
}

function bmCountUrls(folder) {
  let n = 0;
  const visit = f => f.children.forEach(c => c.type === 'folder' ? visit(c) : n++);
  visit(folder);
  return n;
}

function bmCollectUrls(folder) {
  const out = [];
  const visit = f => f.children.forEach(c => c.type === 'folder' ? visit(c) : out.push(c.url));
  visit(folder);
  return out;
}

function bmAdd(parentId, node, beforeId = null) {
  const parent = (bmFind(parentId) || bmFind('other')).node;
  const idx = beforeId ? parent.children.findIndex(c => c.id === beforeId) : -1;
  if (idx >= 0) parent.children.splice(idx, 0, node);
  else parent.children.push(node);
  bmCommit();
  return node;
}

/** Déplace des nœuds vers parentId, avant beforeId (null = à la fin). */
function bmMove(ids, parentId, beforeId = null) {
  const target = bmFind(parentId);
  if (!target || target.node.type !== 'folder') return false;
  const movable = ids
    .map(id => bmFind(id))
    .filter(info => info && !bmIsRoot(info.node.id))
    .filter(info => !(info.node.type === 'folder' && (info.node.id === parentId || bmIsAncestor(info.node.id, parentId))));
  if (!movable.length) return false;
  const movedIds = new Set(movable.map(m => m.node.id));
  if (beforeId && movedIds.has(beforeId)) {
    // Ancre sur le prochain élément non déplacé
    const siblings = target.node.children;
    let i = siblings.findIndex(c => c.id === beforeId);
    while (i >= 0 && i < siblings.length && movedIds.has(siblings[i].id)) i++;
    beforeId = (i >= 0 && i < siblings.length) ? siblings[i].id : null;
  }
  const nodes = movable.map(m => m.node);
  movable.forEach(m => {
    const arr = m.parent.children;
    arr.splice(arr.indexOf(m.node), 1);
  });
  const arr = target.node.children;
  const idx = beforeId ? arr.findIndex(c => c.id === beforeId) : -1;
  if (idx >= 0) arr.splice(idx, 0, ...nodes);
  else arr.push(...nodes);
  bmCommit();
  return true;
}

function bmUpdate(id, changes) {
  const info = bmFind(id);
  if (!info) return;
  if (changes.title !== undefined && !bmIsRoot(id)) info.node.title = changes.title;
  if (changes.url !== undefined && info.node.type === 'url') info.node.url = changes.url;
  if (changes.parentId && changes.parentId !== info.parent?.id) {
    bmMove([id], changes.parentId);
    return;
  }
  bmCommit();
}

function bmTrash(ids) {
  let count = 0;
  ids.forEach(id => {
    if (bmIsRoot(id)) return;
    const info = bmFind(id);
    if (!info) return;
    info.parent.children.splice(info.index, 1);
    bookmarksData.trash.unshift({ node: info.node, parentId: info.parent.id, index: info.index, deletedAt: Date.now() });
    count++;
  });
  if (bookmarksData.trash.length > 500) bookmarksData.trash.length = 500;
  if (count) bmCommit();
  return count;
}

function bmRestore(trashIndexes) {
  const sorted = [...trashIndexes].sort((a, b) => b - a);
  const entries = sorted.map(i => bookmarksData.trash[i]).filter(Boolean);
  sorted.forEach(i => bookmarksData.trash.splice(i, 1));
  entries.reverse().forEach(entry => {
    const parentInfo = bmFind(entry.parentId);
    const parent = parentInfo ? parentInfo.node : bookmarksData.roots.other;
    const idx = Math.min(entry.index ?? parent.children.length, parent.children.length);
    parent.children.splice(idx, 0, entry.node);
  });
  bmCommit();
}

function bmDeleteForever(trashIndexes) {
  [...trashIndexes].sort((a, b) => b - a).forEach(i => bookmarksData.trash.splice(i, 1));
  bmCommit();
}

// ========== PERSISTANCE ==========
function bmCommit() {
  clearTimeout(bmSaveTimer);
  bmSaveTimer = setTimeout(bmFlush, 120);
  bmRefreshAll();
}

function bmFlush() {
  clearTimeout(bmSaveTimer);
  bmSaveTimer = null;
  if (bookmarksData) window.zenithAPI.saveBookmarks(bookmarksData);
}

function bmRefreshAll() {
  renderBookmarksBar();
  updateBookmarkStar();
  if (bmManager && document.body.contains(bmManager.element)) renderBookmarksManager();
}

// ========== INITIALISATION ==========
async function initializeBookmarks() {
  try {
    bookmarksData = bmNormalizeData(await window.zenithAPI.getBookmarks());
  } catch (e) {
    console.error('Erreur de chargement des signets:', e);
    bookmarksData = bmDefaultData();
  }

  document.getElementById('bookmark-star')?.addEventListener('click', () => bookmarkCurrentPage());
  document.getElementById('bookmarks-btn')?.addEventListener('click', () => openBookmarksPage());
  document.getElementById('open-bookmarks')?.addEventListener('click', () => { closeSettingsMenu(); openBookmarksPage(); });
  document.getElementById('toggle-bookmarks-bar')?.addEventListener('click', () => toggleBookmarksBar());

  setupBookmarksBar();
  applyBookmarksBarVisibility();
  updateBookmarkStar();

  window.addEventListener('resize', debounce(() => renderBookmarksBar(), 80));
  window.addEventListener('beforeunload', () => { if (bmSaveTimer) bmFlush(); });

  // Raccourcis clavier internes au gestionnaire (Suppr, Entrée, F2)
  document.addEventListener('keydown', bmHandleManagerKeydown);
}

// ========== OUVERTURE D'URL ==========
function bmOpenUrl(url, inNewTab = false) {
  if (!url) return;
  const tab = tabs.find(t => t.id === activeTabId);
  if (inNewTab || !tab?.webview) {
    createNewTab(url);
    return;
  }
  tab.isNewTab = false;
  tab.webview.src = url;
  tab.url = url;
  document.getElementById('url-bar').value = url;
  updateBookmarkStar();
}

function bmOpenAll(folder) {
  const urls = bmCollectUrls(folder);
  if (!urls.length) return;
  if (urls.length > 15 && !confirm(`Ouvrir ${urls.length} onglets ?`)) return;
  // Ouvrir le dossier comme une pile d'onglets portant son nom
  if (typeof openUrlsAsPile === 'function') openUrlsAsPile(urls, bmIsRoot(folder.id) ? '' : folder.title);
  else urls.forEach(u => createNewTab(u));
}

// ========== BOUTON SIGNET (BARRE D'URL) ==========
function updateBookmarkStar() {
  const star = document.getElementById('bookmark-star');
  if (!star || !bookmarksData) return;
  if (typeof activePileView !== 'undefined' && activePileView) { star.classList.add('hidden'); return; }
  const tab = tabs.find(t => t.id === activeTabId);
  const url = tab?.webview ? tab.url : null;
  const can = bmIsBookmarkableUrl(url);
  const existing = can ? bmFindByUrl(url) : null;
  star.classList.toggle('hidden', !can);
  star.classList.toggle('bookmarked', !!existing);
  star.title = existing ? 'Modifier le signet (Ctrl+D)' : 'Ajouter aux signets (Ctrl+D)';
}

function bookmarkCurrentPage() {
  const tab = tabs.find(t => t.id === activeTabId);
  const url = tab?.webview ? tab.url : null;
  if (!bmIsBookmarkableUrl(url)) {
    showNotification('Cette page ne peut pas être ajoutée aux signets');
    return;
  }
  let node = bmFindByUrl(url);
  let isNew = false;
  if (!node) {
    const lastFolder = localStorage.getItem('bmLastFolder');
    const parentId = lastFolder && bmFind(lastFolder) ? lastFolder : 'bar';
    node = bmAdd(parentId, bmNewUrl(tab.title || url, url, tab.faviconUrl));
    isNew = true;
  }
  showBookmarkPopup(node.id, isNew);
}

function bookmarkLink(url, title) {
  if (!url) return;
  const node = bmAdd('bar', bmNewUrl(title || url, url));
  showNotification('Lien ajouté aux signets');
  return node;
}

function showBookmarkPopup(id, isNew) {
  bmCloseAll();
  const info = bmFind(id);
  if (!info) return;
  const node = info.node;
  const star = document.getElementById('bookmark-star');
  const rect = star.getBoundingClientRect();

  const overlay = bmCreateOverlay(() => commit());
  const popup = bmEl('div', 'bm-popup');
  popup.innerHTML = `
    <div class="bm-popup-header">
      <span class="bm-popup-icon">${BM_ICONS.bookmark}</span>
      <span class="bm-popup-title">${isNew ? 'Signet ajouté' : 'Modifier le signet'}</span>
    </div>
    <label class="bm-field"><span>Nom</span><input type="text" class="bm-input" data-k="title" spellcheck="false"></label>
    <label class="bm-field"><span>Dossier</span><select class="bm-input" data-k="parent"></select></label>
    <div class="bm-popup-actions">
      <button class="bm-btn danger" data-a="remove">${BM_ICONS.trash}Supprimer</button>
      <button class="bm-btn" data-a="manage">Gérer…</button>
      <button class="bm-btn primary" data-a="done">Terminé</button>
    </div>`;
  const titleInput = popup.querySelector('[data-k="title"]');
  const folderSelect = popup.querySelector('[data-k="parent"]');
  titleInput.value = node.title;
  bmFillFolderSelect(folderSelect, info.parent.id);

  let closed = false;
  function commit() {
    if (closed) return;
    closed = true;
    const title = titleInput.value.trim() || node.url;
    const parentId = folderSelect.value;
    localStorage.setItem('bmLastFolder', parentId);
    bmUpdate(node.id, { title, parentId });
    bmCloseAll();
  }

  popup.querySelector('[data-a="done"]').addEventListener('click', commit);
  popup.querySelector('[data-a="remove"]').addEventListener('click', () => {
    closed = true;
    bmTrash([node.id]);
    bmCloseAll();
    showNotification('Signet supprimé');
  });
  popup.querySelector('[data-a="manage"]').addEventListener('click', () => {
    commit();
    openBookmarksPage(info.parent.id);
  });
  titleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); }
  });

  document.body.appendChild(popup);
  bmFloating.push(popup);
  bmFloating.overlayCommit = commit;
  const w = popup.offsetWidth;
  popup.style.top = (rect.bottom + 8) + 'px';
  popup.style.left = Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8)) + 'px';
  requestAnimationFrame(() => popup.classList.add('visible'));
  setTimeout(() => { titleInput.focus(); titleInput.select(); }, 30);
}

function bmFillFolderSelect(select, selectedId, excludeId = null) {
  select.innerHTML = '';
  const add = (folder, depth) => {
    if (excludeId && folder.id === excludeId) return;
    const opt = document.createElement('option');
    opt.value = folder.id;
    opt.textContent = '   '.repeat(depth) + bmFolderTitle(folder);
    if (folder.id === selectedId) opt.selected = true;
    select.appendChild(opt);
    folder.children.filter(c => c.type === 'folder').forEach(c => add(c, depth + 1));
  };
  bmRoots().forEach(r => add(r, 0));
}

// ========== ÉLÉMENTS FLOTTANTS (overlay, menus, dialogues) ==========
function bmCreateOverlay(onClose) {
  let overlay = document.getElementById('bm-overlay');
  if (!overlay) {
    overlay = bmEl('div');
    overlay.id = 'bm-overlay';
    document.body.appendChild(overlay);
  }
  overlay.onmousedown = (e) => {
    if (e.target !== overlay) return;
    e.preventDefault();
    if (onClose) onClose();
    else bmCloseAll();
  };
  overlay.oncontextmenu = (e) => { e.preventDefault(); bmCloseAll(); };
  overlay.classList.add('visible');
  return overlay;
}

/** Ferme tous les éléments flottants des signets (appelé aussi par Échap). */
function bmCloseAll() {
  bmFloating.forEach(el => el.remove());
  bmFloating = [];
  bmMenuStack.forEach(m => m.el.remove());
  bmMenuStack = [];
  document.querySelectorAll('.bmb-item.open').forEach(b => b.classList.remove('open'));
  document.body.classList.remove('bm-menu-open');
  document.getElementById('bm-overlay')?.classList.remove('visible');
  if (bmDialogResolve) { const r = bmDialogResolve; bmDialogResolve = null; r(null); }
}

/** Fermeture via Échap : valide le popup du signet s'il est ouvert. */
function bmHandleEscape() {
  if (bmFloating.overlayCommit && bmFloating.some(e => e.classList.contains('bm-popup'))) {
    const c = bmFloating.overlayCommit;
    bmFloating.overlayCommit = null;
    c();
    return;
  }
  bmCloseAll();
}

function bmPlace(el, x, y) {
  const r = el.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - r.width - 8);
  if (y + r.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - r.height - 8);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

function bmShowContextMenu(items, x, y) {
  // Ferme un éventuel menu contextuel précédent sans fermer les menus déroulants
  bmFloating.filter(f => f.classList.contains('context-menu')).forEach(f => f.remove());
  bmFloating = bmFloating.filter(f => !f.classList.contains('context-menu'));
  bmCreateOverlay();

  const menu = bmEl('div', 'context-menu bm-context-menu');
  items.forEach(item => {
    if (!item) return;
    if (item.separator) { menu.appendChild(bmEl('div', 'context-menu-separator')); return; }
    const row = bmEl('div', 'context-menu-item' + (item.disabled ? ' disabled' : '') + (item.danger ? ' danger' : ''));
    const icon = bmEl('span', 'context-menu-icon');
    icon.innerHTML = item.icon || '';
    row.append(icon, bmEl('span', 'context-menu-label', item.label));
    if (item.shortcut) row.appendChild(bmEl('span', 'context-menu-shortcut', item.shortcut));
    if (!item.disabled) {
      row.addEventListener('click', () => { bmCloseAll(); item.action(); });
    }
    menu.appendChild(row);
  });
  document.body.appendChild(menu);
  bmFloating.push(menu);
  bmPlace(menu, x, y);
}

/**
 * Boîte de dialogue d'édition (Electron ne supporte pas window.prompt).
 * Retourne une Promise -> { title, url, parentId } ou null.
 */
function bmDialog({ heading, title = '', url = '', showUrl = true, parentId = 'bar', showFolder = true, excludeFolderId = null, confirmLabel = 'Enregistrer' }) {
  bmCloseAll();
  return new Promise(resolve => {
    const overlay = bmCreateOverlay();
    overlay.classList.add('dim');
    const dlg = bmEl('div', 'bm-dialog');
    dlg.innerHTML = `
      <div class="bm-dialog-title"></div>
      <label class="bm-field"><span>Nom</span><input type="text" class="bm-input" data-k="title" spellcheck="false"></label>
      ${showUrl ? '<label class="bm-field"><span>Adresse</span><input type="text" class="bm-input" data-k="url" spellcheck="false" placeholder="https://"></label>' : ''}
      ${showFolder ? '<label class="bm-field"><span>Dossier</span><select class="bm-input" data-k="parent"></select></label>' : ''}
      <div class="bm-dialog-actions">
        <button class="bm-btn" data-a="cancel">Annuler</button>
        <button class="bm-btn primary" data-a="ok"></button>
      </div>`;
    dlg.querySelector('.bm-dialog-title').textContent = heading;
    dlg.querySelector('[data-a="ok"]').textContent = confirmLabel;
    const tIn = dlg.querySelector('[data-k="title"]');
    const uIn = dlg.querySelector('[data-k="url"]');
    const fSel = dlg.querySelector('[data-k="parent"]');
    tIn.value = title;
    if (uIn) uIn.value = url;
    if (fSel) bmFillFolderSelect(fSel, parentId, excludeFolderId);

    const finish = (value) => {
      bmDialogResolve = null;
      bmCloseAll();
      overlay.classList.remove('dim');
      resolve(value);
    };
    const submit = () => {
      const t = tIn.value.trim();
      const u = uIn ? bmFixUrl(uIn.value) : undefined;
      if (uIn && !u) { uIn.classList.add('error'); uIn.focus(); return; }
      if (!uIn && !t) { tIn.classList.add('error'); tIn.focus(); return; }
      finish({ title: t || u, url: u, parentId: fSel ? fSel.value : parentId });
    };
    dlg.querySelector('[data-a="cancel"]').addEventListener('click', () => finish(null));
    dlg.querySelector('[data-a="ok"]').addEventListener('click', submit);
    dlg.querySelectorAll('input').forEach(i => {
      i.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); }
      });
      i.addEventListener('input', () => i.classList.remove('error'));
    });

    document.body.appendChild(dlg);
    bmFloating.push(dlg);
    bmDialogResolve = (v) => { overlay.classList.remove('dim'); resolve(v); };
    setTimeout(() => { tIn.focus(); tIn.select(); }, 30);
  });
}

// ========== ACTIONS COMMUNES ==========
async function bmEditNode(id) {
  const info = bmFind(id);
  if (!info || bmIsRoot(id)) return;
  const n = info.node;
  const res = await bmDialog({
    heading: n.type === 'folder' ? 'Renommer le dossier' : 'Modifier le signet',
    title: n.title,
    url: n.url || '',
    showUrl: n.type === 'url',
    parentId: info.parent.id,
    excludeFolderId: n.type === 'folder' ? n.id : null
  });
  if (!res) return;
  const changes = { title: res.title };
  if (n.type === 'url') changes.url = res.url;
  bmUpdate(id, changes);
  if (res.parentId !== info.parent.id) bmMove([id], res.parentId);
}

async function bmPromptNewFolder(parentId, beforeId = null) {
  const res = await bmDialog({ heading: 'Nouveau dossier', title: 'Nouveau dossier', showUrl: false, parentId, confirmLabel: 'Créer' });
  if (!res) return null;
  return bmAdd(res.parentId, bmNewFolder(res.title), res.parentId === parentId ? beforeId : null);
}

async function bmPromptNewBookmark(parentId) {
  const tab = tabs.find(t => t.id === activeTabId);
  const useTab = tab?.webview && bmIsBookmarkableUrl(tab.url);
  const res = await bmDialog({
    heading: 'Nouveau signet',
    title: useTab ? tab.title : '',
    url: useTab ? tab.url : '',
    parentId,
    confirmLabel: 'Ajouter'
  });
  if (!res) return null;
  return bmAdd(res.parentId, bmNewUrl(res.title, res.url));
}

function bmDeleteWithToast(ids) {
  const n = bmTrash(ids);
  if (n) showNotification(n > 1 ? `${n} éléments déplacés dans la corbeille` : 'Déplacé dans la corbeille');
}

function bmNodeContextItems(node, { inManager = false } = {}) {
  const items = [];
  if (node.type === 'url') {
    items.push({ label: 'Ouvrir', icon: BM_ICONS.open, action: () => bmOpenUrl(node.url) });
    items.push({ label: 'Ouvrir dans un nouvel onglet', icon: BM_ICONS.tabs, action: () => bmOpenUrl(node.url, true) });
    items.push({ separator: true });
    items.push({ label: 'Modifier…', icon: BM_ICONS.edit, action: () => bmEditNode(node.id), shortcut: inManager ? 'F2' : '' });
    items.push({ label: "Copier l'adresse", icon: BM_ICONS.copy, action: () => navigator.clipboard.writeText(node.url) });
  } else {
    const count = bmCountUrls(node);
    if (inManager) items.push({ label: 'Ouvrir le dossier', icon: BM_ICONS.folder, action: () => bmManagerGo(node.id) });
    items.push({ label: `Tout ouvrir dans de nouveaux onglets (${count})`, icon: BM_ICONS.tabs, action: () => bmOpenAll(node), disabled: !count });
    items.push({ separator: true });
    items.push({ label: 'Ajouter la page actuelle ici', icon: BM_ICONS.bookmark, action: () => bmAddCurrentTo(node.id) });
    items.push({ label: 'Nouveau dossier…', icon: BM_ICONS.folderPlus, action: () => bmPromptNewFolder(node.id) });
    if (!bmIsRoot(node.id)) items.push({ label: 'Renommer…', icon: BM_ICONS.edit, action: () => bmEditNode(node.id), shortcut: inManager ? 'F2' : '' });
  }
  if (!bmIsRoot(node.id)) {
    items.push({ separator: true });
    items.push({ label: 'Supprimer', icon: BM_ICONS.trash, danger: true, action: () => bmDeleteWithToast([node.id]), shortcut: inManager ? 'Suppr' : '' });
  }
  return items;
}

function bmAddCurrentTo(folderId) {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab?.webview || !bmIsBookmarkableUrl(tab.url)) {
    bmPromptNewBookmark(folderId);
    return;
  }
  bmAdd(folderId, bmNewUrl(tab.title, tab.url, tab.faviconUrl));
  showNotification('Page ajoutée aux signets');
}

// ========== FAVICONS ==========
function bmFaviconEl(node, large = false) {
  const wrap = bmEl('span', 'bm-favicon');
  if (node.type === 'folder') {
    wrap.classList.add('is-folder');
    wrap.innerHTML = BM_ICONS.folder;
    return wrap;
  }
  const sources = [];
  if (node.favicon && /^(https?:|data:image)/.test(node.favicon)) sources.push(node.favicon);
  const host = bmHost(node.url);
  if (host) sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${large ? 64 : 32}`);
  if (!sources.length) { wrap.innerHTML = BM_ICONS.globe; return wrap; }
  const img = new Image();
  img.alt = '';
  img.draggable = false;
  let i = 0;
  img.addEventListener('error', () => {
    i++;
    if (i < sources.length) img.src = sources[i];
    else { img.remove(); wrap.innerHTML = BM_ICONS.globe; }
  });
  img.src = sources[0];
  wrap.appendChild(img);
  return wrap;
}

// ========== BARRE DE SIGNETS ==========
function setupBookmarksBar() {
  const bar = document.getElementById('bookmarks-bar');
  if (!bar) return;
  bar.innerHTML = `
    <div class="bmb-items"></div>
    <button class="bmb-item bmb-overflow" title="Plus de signets">${BM_ICONS.chevrons}</button>
    <div class="bmb-sep"></div>
    <button class="bmb-item bmb-other"><span class="bm-favicon is-folder">${BM_ICONS.folder}</span><span class="bmb-label">Autres signets</span></button>`;

  const items = bar.querySelector('.bmb-items');
  const overflowBtn = bar.querySelector('.bmb-overflow');
  const otherBtn = bar.querySelector('.bmb-other');

  overflowBtn.addEventListener('click', () => {
    bmToggleBarMenu(overflowBtn, overflowBtn._nodes || []);
  });
  otherBtn.addEventListener('click', () => {
    bmToggleBarMenu(otherBtn, bookmarksData.roots.other.children);
  });
  otherBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    bmShowContextMenu(bmNodeContextItems(bookmarksData.roots.other), e.clientX, e.clientY);
  });
  bmSetupDropTarget(otherBtn, () => ({ parentId: 'other', beforeId: null, into: true }));

  // Clic dans une zone vide de la barre quand un menu est ouvert : fermeture
  bar.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.bmb-item') && bmMenuStack.length) bmCloseAll();
  });

  // Clic droit sur une zone vide de la barre
  bar.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.bmb-item')) return;
    e.preventDefault();
    bmShowContextMenu([
      { label: 'Ajouter la page actuelle', icon: BM_ICONS.bookmark, action: () => bmAddCurrentTo('bar') },
      { label: 'Ajouter un signet…', icon: BM_ICONS.plus, action: () => bmPromptNewBookmark('bar') },
      { label: 'Nouveau dossier…', icon: BM_ICONS.folderPlus, action: () => bmPromptNewFolder('bar') },
      { separator: true },
      { label: 'Gérer les signets', icon: BM_ICONS.bookmark, action: () => openBookmarksPage(), shortcut: 'Ctrl+Shift+O' },
      { label: 'Masquer la barre de signets', icon: BM_ICONS.eye, action: () => toggleBookmarksBar(false), shortcut: 'Ctrl+Shift+B' }
    ], e.clientX, e.clientY);
  });

  // Dépôt dans la zone vide = à la fin de la barre
  bmSetupDropTarget(items, (e) => {
    if (e.target !== items) return null;
    return { parentId: 'bar', beforeId: null };
  });

  renderBookmarksBar();
}

function bmCreateBarItem(node) {
  const btn = bmEl('button', 'bmb-item');
  btn.dataset.id = node.id;
  btn.title = node.type === 'url' ? `${node.title}\n${node.url}` : node.title;
  btn.draggable = true;
  btn.appendChild(bmFaviconEl(node));
  if (node.title) btn.appendChild(bmEl('span', 'bmb-label', node.title));
  else btn.classList.add('icon-only');
  if (node.type === 'folder') btn.classList.add('is-folder');

  btn.addEventListener('click', (e) => {
    if (node.type === 'folder') bmToggleBarMenu(btn, node.children, node);
    else bmOpenUrl(node.url, e.ctrlKey || e.metaKey);
  });
  btn.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    if (node.type === 'url') bmOpenUrl(node.url, true);
    else bmOpenAll(node);
  });
  btn.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
  btn.addEventListener('mouseenter', () => {
    // Comme Opera/Chrome : survoler un autre dossier quand un menu est ouvert le bascule
    if (bmMenuStack.length && bmMenuStack[0].anchor !== btn && bmMenuStack[0].anchor?.closest('#bookmarks-bar')) {
      if (node.type === 'folder') bmOpenBarMenu(btn, node.children, node);
    }
  });
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    bmShowContextMenu(bmNodeContextItems(node), e.clientX, e.clientY);
  });

  bmSetupDragSource(btn, () => [node.id], node);
  bmSetupDropTarget(btn, (e) => bmDropPosition(e, btn, node, 'bar', 'horizontal'));
  return btn;
}

function renderBookmarksBar() {
  const bar = document.getElementById('bookmarks-bar');
  if (!bar || !bookmarksData) return;
  const items = bar.querySelector('.bmb-items');
  const overflowBtn = bar.querySelector('.bmb-overflow');
  const otherBtn = bar.querySelector('.bmb-other');
  const sep = bar.querySelector('.bmb-sep');
  if (!items) return;

  items.innerHTML = '';
  const children = bookmarksData.roots.bar.children;
  if (!children.length) {
    const hint = bmEl('span', 'bmb-empty', 'Pour accéder rapidement à vos pages, ajoutez-les ici avec le bouton signet ou Ctrl+D.');
    items.appendChild(hint);
  }
  children.forEach(n => items.appendChild(bmCreateBarItem(n)));

  const hasOther = bookmarksData.roots.other.children.length > 0;
  otherBtn.style.display = hasOther ? '' : 'none';
  sep.style.display = hasOther ? '' : 'none';

  if (!bookmarksData.settings.showBar) return;

  // Débordement : les éléments qui ne tiennent pas vont dans le menu »
  overflowBtn.style.display = '';
  const max = items.clientWidth;
  const hidden = [];
  [...items.children].forEach((c, i) => {
    if (!c.dataset.id) return;
    if (c.offsetLeft + c.offsetWidth > max + 1) {
      c.classList.add('bmb-hidden');
      hidden.push(children[i]);
    }
  });
  overflowBtn._nodes = hidden;
  if (!hidden.length) overflowBtn.style.display = 'none';
}

function applyBookmarksBarVisibility() {
  const show = !!bookmarksData?.settings.showBar;
  document.body.classList.toggle('bookmarks-bar-visible', show);
  const toggleBtn = document.getElementById('toggle-bookmarks-bar');
  if (toggleBtn) toggleBtn.classList.toggle('active', show);
  if (bmManager) {
    const cb = bmManager.element.querySelector('#bm-show-bar');
    if (cb) cb.checked = show;
  }
  requestAnimationFrame(() => {
    renderBookmarksBar();
    if (typeof devToolsOpen !== 'undefined' && devToolsOpen) {
      window.zenithAPI.resizeDevToolsPanel(getDevToolsBounds());
    }
  });
}

function toggleBookmarksBar(force) {
  bookmarksData.settings.showBar = typeof force === 'boolean' ? force : !bookmarksData.settings.showBar;
  applyBookmarksBarVisibility();
  bmCommit();
}

// ---- Menus déroulants des dossiers ----
function bmToggleBarMenu(anchor, nodes, folder = null) {
  if (bmMenuStack.length && bmMenuStack[0].anchor === anchor) {
    bmCloseAll();
    return;
  }
  bmOpenBarMenu(anchor, nodes, folder);
}

function bmOpenBarMenu(anchor, nodes, folder) {
  bmCloseAll();
  bmCreateOverlay();
  // La barre passe au-dessus de l'overlay : survol pour basculer entre dossiers
  if (anchor.closest('#bookmarks-bar')) document.body.classList.add('bm-menu-open');
  anchor.classList.add('open');
  const r = anchor.getBoundingClientRect();
  bmOpenMenuLevel(0, nodes, folder, r.left, r.bottom + 4, anchor);
}

function bmOpenMenuLevel(level, nodes, folder, x, y, anchor) {
  // Ferme les niveaux plus profonds
  while (bmMenuStack.length > level) bmMenuStack.pop().el.remove();

  const menu = bmEl('div', 'bm-menu');
  if (!nodes.length) {
    menu.appendChild(bmEl('div', 'bm-menu-empty', '(vide)'));
  }
  nodes.forEach(node => {
    const row = bmEl('div', 'bm-menu-item' + (node.type === 'folder' ? ' is-folder' : ''));
    row.dataset.id = node.id;
    row.draggable = true;
    row.appendChild(bmFaviconEl(node));
    row.appendChild(bmEl('span', 'bm-menu-label', node.title || node.url));
    if (node.type === 'folder') {
      const c = bmEl('span', 'bm-menu-caret');
      c.innerHTML = BM_ICONS.caret;
      row.appendChild(c);
    } else {
      row.title = node.url;
    }

    let hoverTimer;
    const openSub = () => {
      const rr = row.getBoundingClientRect();
      menu.querySelectorAll('.bm-menu-item.open').forEach(o => o.classList.remove('open'));
      row.classList.add('open');
      bmOpenMenuLevel(level + 1, node.children, node, rr.right - 2, rr.top - 5, row);
    };
    row.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      if (node.type === 'folder') hoverTimer = setTimeout(openSub, 180);
      else hoverTimer = setTimeout(() => {
        while (bmMenuStack.length > level + 1) bmMenuStack.pop().el.remove();
        menu.querySelectorAll('.bm-menu-item.open').forEach(o => o.classList.remove('open'));
      }, 180);
    });
    row.addEventListener('mouseleave', () => clearTimeout(hoverTimer));
    row.addEventListener('click', (e) => {
      if (node.type === 'folder') { clearTimeout(hoverTimer); openSub(); return; }
      bmCloseAll();
      bmOpenUrl(node.url, e.ctrlKey || e.metaKey);
    });
    row.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      if (node.type === 'url') { bmOpenUrl(node.url, true); }
      else { bmCloseAll(); bmOpenAll(node); }
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bmShowContextMenu(bmNodeContextItems(node), e.clientX, e.clientY);
    });
    bmSetupDragSource(row, () => [node.id], node);
    bmSetupDropTarget(row, (e) => bmDropPosition(e, row, node, folder ? folder.id : null, 'vertical'));
    menu.appendChild(row);
  });

  if (folder && nodes.length > 1) {
    menu.appendChild(bmEl('div', 'context-menu-separator'));
    const all = bmEl('div', 'bm-menu-item bm-menu-action');
    const ic = bmEl('span', 'bm-favicon');
    ic.innerHTML = BM_ICONS.tabs;
    all.append(ic, bmEl('span', 'bm-menu-label', `Tout ouvrir (${bmCountUrls(folder)})`));
    all.addEventListener('click', () => { bmCloseAll(); bmOpenAll(folder); });
    menu.appendChild(all);
  }

  document.body.appendChild(menu);
  bmMenuStack.push({ el: menu, anchor, folderId: folder?.id });
  bmPlace(menu, x, y);
  if (level > 0) {
    // Si le sous-menu déborde à droite, l'ouvrir à gauche du parent
    const parentRect = bmMenuStack[level - 1].el.getBoundingClientRect();
    const mr = menu.getBoundingClientRect();
    if (mr.left < parentRect.right - 10) menu.style.left = Math.max(8, parentRect.left - mr.width + 2) + 'px';
  }
}

// ========== GLISSER-DÉPOSER ==========
function bmSetupDragSource(el, getIds, node) {
  el.addEventListener('dragstart', (e) => {
    bmDragIds = getIds();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(BM_DRAG_TYPE, JSON.stringify(bmDragIds));
    if (node?.type === 'url') {
      e.dataTransfer.setData('text/uri-list', node.url);
      e.dataTransfer.setData('text/plain', node.url);
    }
    el.classList.add('bm-dragging');
    document.body.classList.add('bm-drag-active');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('bm-dragging');
    bmDragIds = null;
    document.body.classList.remove('bm-drag-active');
    bmClearDropMarks();
  });
}

function bmClearDropMarks() {
  document.querySelectorAll('.bm-drop-before, .bm-drop-after, .bm-drop-into').forEach(x => {
    x.classList.remove('bm-drop-before', 'bm-drop-after', 'bm-drop-into');
  });
}

/**
 * Calcule où déposer par rapport à un élément : avant / après / dans (dossier).
 * orientation : 'horizontal' (barre, grilles) ou 'vertical' (listes, menus)
 */
function bmDropPosition(e, el, node, parentId, orientation) {
  if (!parentId) {
    const info = bmFind(node.id);
    parentId = info?.parent?.id;
  }
  if (!parentId) return null;
  const r = el.getBoundingClientRect();
  const ratio = orientation === 'horizontal' ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
  if (node.type === 'folder' && ratio > 0.25 && ratio < 0.75) {
    return { parentId: node.id, beforeId: null, into: true, el };
  }
  if (ratio <= 0.5) return { parentId, beforeId: node.id, mark: 'before', el };
  const info = bmFind(node.id);
  const siblings = info ? info.parent.children : [];
  const next = siblings[siblings.indexOf(node) + 1];
  return { parentId, beforeId: next ? next.id : null, mark: 'after', el };
}

function bmSetupDropTarget(el, compute) {
  el.addEventListener('dragover', (e) => {
    if (!bmDragIds) return;
    const pos = compute(e);
    if (!pos) return;
    // Impossible de déposer un dossier dans lui-même
    if (bmDragIds.some(id => id === pos.parentId || bmIsAncestor(id, pos.parentId))) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    bmClearDropMarks();
    const target = pos.el || el;
    if (pos.into) target.classList.add('bm-drop-into');
    else if (pos.mark) target.classList.add(pos.mark === 'before' ? 'bm-drop-before' : 'bm-drop-after');
  });
  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('bm-drop-before', 'bm-drop-after', 'bm-drop-into');
  });
  el.addEventListener('drop', (e) => {
    if (!bmDragIds) return;
    const pos = compute(e);
    if (!pos) return;
    e.preventDefault();
    e.stopPropagation();
    const ids = bmDragIds;
    bmDragIds = null;
    bmClearDropMarks();
    bmMove(ids, pos.parentId, pos.beforeId);
  });
}

// ========== GESTIONNAIRE DE SIGNETS (zenith://bookmarks) ==========
function openBookmarksPage(folderId = null) {
  // Une seule page gestionnaire : on la réutilise si elle existe
  const existing = tabs.find(t => t.isBookmarksPage);
  if (existing) {
    switchToTab(existing.id);
    if (folderId) bmManagerGo(folderId);
    return;
  }

  const tabId = `tab-${++tabCounter}`;
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  tabElement.id = tabId;
  tabElement.innerHTML = `
    <div class="tab-favicon">${BM_ICONS.bookmark}</div>
    <span class="tab-title">Signets</span>
    <button class="tab-close" title="Fermer">
      <svg class="icon" viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>`;
  tabElement.addEventListener('click', (e) => { if (!e.target.closest('.tab-close')) switchToTab(tabId); });
  tabElement.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(tabId); });
  tabElement.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tabId); } });
  if (typeof setupTabDragAndDrop === 'function') setupTabDragAndDrop(tabElement, tabId);
  document.getElementById('tabs-container').insertBefore(tabElement, document.getElementById('new-tab-btn'));

  const page = bmEl('div', 'browser-view bookmarks-page');
  page.id = `webview-${tabId}`;
  page.tabIndex = -1;
  document.getElementById('webviews-container').appendChild(page);

  bmManager = {
    element: page,
    tabId,
    folderId: folderId && bmFind(folderId) ? folderId : 'bar',
    view: localStorage.getItem('bmView') || 'list',
    search: '',
    selected: new Set(),
    lastClicked: null,
    expanded: new Set(JSON.parse(localStorage.getItem('bmExpanded') || '["bar","other"]'))
  };
  bmBuildManagerShell(page);

  tabs.push({ id: tabId, url: 'zenith://bookmarks', title: 'Signets', isBookmarksPage: true, element: page });
  switchToTab(tabId);
  renderBookmarksManager();
}

function bmBuildManagerShell(page) {
  page.innerHTML = `
    <aside class="bm-sidebar">
      <div class="bm-sidebar-title">${BM_ICONS.bookmark}<span>Signets</span></div>
      <nav class="bm-tree"></nav>
      <div class="bm-tree-trash"></div>
      <div class="bm-sidebar-footer">
        <button class="bm-btn bm-io-btn">Importer / Exporter${BM_ICONS.chevronDown}</button>
      </div>
    </aside>
    <section class="bm-main">
      <div class="bm-toolbar">
        <div class="bm-view-switch">
          <button data-view="large" title="Grandes vignettes">${BM_ICONS.gridLarge}</button>
          <button data-view="small" title="Petites vignettes">${BM_ICONS.gridSmall}</button>
          <button data-view="list" title="Liste">${BM_ICONS.list}</button>
        </div>
        <button class="bm-tool-btn" data-a="new-folder" title="Nouveau dossier">${BM_ICONS.folderPlus}</button>
        <button class="bm-tool-btn" data-a="new-bookmark" title="Nouveau signet">${BM_ICONS.plus}</button>
        <div class="bm-search">${BM_ICONS.search}<input type="text" id="bm-search-input" placeholder="Rechercher dans les signets" spellcheck="false" autocomplete="off"><button class="bm-search-clear" title="Effacer">${BM_ICONS.close}</button></div>
        <label class="bm-check"><input type="checkbox" id="bm-show-bar"><span>Afficher la barre de signets</span></label>
      </div>
      <div class="bm-heading"></div>
      <div class="bm-content"></div>
    </section>`;

  page.querySelectorAll('.bm-view-switch button').forEach(b => {
    b.addEventListener('click', () => {
      bmManager.view = b.dataset.view;
      localStorage.setItem('bmView', bmManager.view);
      renderBookmarksManager();
    });
  });
  page.querySelector('[data-a="new-folder"]').addEventListener('click', async () => {
    const node = await bmPromptNewFolder(bmManagerTargetFolder());
    if (node) bmManagerSelect([node.id]);
  });
  page.querySelector('[data-a="new-bookmark"]').addEventListener('click', async () => {
    const node = await bmPromptNewBookmark(bmManagerTargetFolder());
    if (node) bmManagerSelect([node.id]);
  });

  const search = page.querySelector('#bm-search-input');
  search.addEventListener('input', debounce(() => {
    bmManager.search = search.value.trim();
    bmManager.selected.clear();
    renderBookmarksManager();
  }, 150));
  page.querySelector('.bm-search-clear').addEventListener('click', () => {
    search.value = '';
    bmManager.search = '';
    renderBookmarksManager();
    search.focus();
  });

  const cb = page.querySelector('#bm-show-bar');
  cb.checked = !!bookmarksData.settings.showBar;
  cb.addEventListener('change', () => toggleBookmarksBar(cb.checked));

  const ioBtn = page.querySelector('.bm-io-btn');
  ioBtn.addEventListener('click', () => {
    const r = ioBtn.getBoundingClientRect();
    bmShowContextMenu([
      { label: 'Importer des signets (fichier HTML)…', icon: BM_ICONS.importIcon, action: bmImport },
      { label: 'Exporter les signets (fichier HTML)…', icon: BM_ICONS.exportIcon, action: bmExport }
    ], r.left, r.top - 90);
  });

  // Clic droit / clic dans une zone vide du contenu
  const content = page.querySelector('.bm-content');
  content.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.bm-entry')) return;
    e.preventDefault();
    if (bmManager.folderId === 'trash') {
      bmShowContextMenu([
        { label: 'Vider la corbeille', icon: BM_ICONS.trash, danger: true, action: bmEmptyTrash, disabled: !bookmarksData.trash.length }
      ], e.clientX, e.clientY);
      return;
    }
    const target = bmManagerTargetFolder();
    bmShowContextMenu([
      { label: 'Nouveau signet…', icon: BM_ICONS.plus, action: () => bmPromptNewBookmark(target) },
      { label: 'Nouveau dossier…', icon: BM_ICONS.folderPlus, action: () => bmPromptNewFolder(target) },
      { label: 'Ajouter la page actuelle ici', icon: BM_ICONS.bookmark, action: () => bmAddCurrentTo(target) }
    ], e.clientX, e.clientY);
  });
  content.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !e.target.closest('.bm-entry')) {
      bmManager.selected.clear();
      bmManagerApplySelection();
    }
  });
  // Dépôt dans la zone vide = à la fin du dossier courant
  bmSetupDropTarget(content, (e) => {
    if (e.target.closest('.bm-entry') || bmManager.search || bmManager.folderId === 'trash') return null;
    return { parentId: bmManager.folderId, beforeId: null };
  });
}

function bmManagerTargetFolder() {
  if (!bmManager || bmManager.folderId === 'trash' || bmManager.search) return 'bar';
  return bmManager.folderId;
}

function bmManagerGo(folderId) {
  if (!bmManager) return;
  bmManager.folderId = folderId;
  bmManager.selected.clear();
  bmManager.lastClicked = null;
  if (bmManager.search) {
    bmManager.search = '';
    const s = bmManager.element.querySelector('#bm-search-input');
    if (s) s.value = '';
  }
  // Déplier l'arborescence jusqu'au dossier
  const info = bmFind(folderId);
  if (info) info.path.forEach(p => bmManager.expanded.add(p.id));
  bmSaveExpanded();
  renderBookmarksManager();
}

function bmSaveExpanded() {
  localStorage.setItem('bmExpanded', JSON.stringify([...bmManager.expanded]));
}

function bmManagerSelect(ids) {
  if (!bmManager) return;
  bmManager.selected = new Set(ids);
  bmManagerApplySelection();
  const el = bmManager.element.querySelector(`.bm-entry[data-id="${CSS.escape(ids[0] || '')}"]`);
  el?.scrollIntoView({ block: 'nearest' });
}

function bmManagerApplySelection() {
  bmManager.element.querySelectorAll('.bm-entry').forEach(el => {
    el.classList.toggle('selected', bmManager.selected.has(el.dataset.id));
  });
}

function renderBookmarksManager() {
  if (!bmManager) return;
  const page = bmManager.element;
  if (bmManager.folderId !== 'trash' && !bmFind(bmManager.folderId)) bmManager.folderId = 'bar';

  // Vue active
  page.querySelectorAll('.bm-view-switch button').forEach(b => b.classList.toggle('active', b.dataset.view === bmManager.view));
  const isTrash = bmManager.folderId === 'trash';
  page.querySelector('.bm-view-switch').classList.toggle('disabled', isTrash);
  page.querySelectorAll('[data-a="new-folder"], [data-a="new-bookmark"]').forEach(b => b.disabled = isTrash);

  bmRenderTree(page.querySelector('.bm-tree'));
  bmRenderTrashLink(page.querySelector('.bm-tree-trash'));
  bmRenderHeading(page.querySelector('.bm-heading'));

  const content = page.querySelector('.bm-content');
  const scroll = content.scrollTop;
  content.innerHTML = '';
  content.className = 'bm-content view-' + (isTrash ? 'list' : bmManager.view);

  if (isTrash) bmRenderTrash(content);
  else if (bmManager.search) bmRenderSearch(content);
  else bmRenderFolder(content, bmFind(bmManager.folderId).node);

  content.scrollTop = scroll;
  // Purge de la sélection des éléments disparus
  const present = new Set([...content.querySelectorAll('.bm-entry')].map(e => e.dataset.id));
  bmManager.selected.forEach(id => { if (!present.has(id)) bmManager.selected.delete(id); });
  bmManagerApplySelection();
}

function bmRenderTree(nav) {
  nav.innerHTML = '';
  const build = (folder, depth) => {
    const subfolders = folder.children.filter(c => c.type === 'folder');
    const row = bmEl('div', 'bm-tree-row');
    row.style.paddingLeft = (8 + depth * 14) + 'px';
    row.dataset.id = folder.id;
    if (bmManager.folderId === folder.id && !bmManager.search) row.classList.add('active');
    if (bmIsRoot(folder.id)) row.classList.add('root');

    const caret = bmEl('span', 'bm-tree-caret');
    if (subfolders.length) {
      caret.innerHTML = BM_ICONS.caret;
      if (bmManager.expanded.has(folder.id)) caret.classList.add('expanded');
      caret.addEventListener('click', (e) => {
        e.stopPropagation();
        if (bmManager.expanded.has(folder.id)) bmManager.expanded.delete(folder.id);
        else bmManager.expanded.add(folder.id);
        bmSaveExpanded();
        bmRenderTree(nav);
      });
    }
    row.appendChild(caret);
    if (!bmIsRoot(folder.id)) {
      const ic = bmEl('span', 'bm-tree-icon');
      ic.innerHTML = BM_ICONS.folder;
      row.appendChild(ic);
    }
    row.appendChild(bmEl('span', 'bm-tree-label', bmFolderTitle(folder)));
    row.addEventListener('click', () => bmManagerGo(folder.id));
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      bmShowContextMenu(bmNodeContextItems(folder, { inManager: true }), e.clientX, e.clientY);
    });
    if (!bmIsRoot(folder.id)) {
      row.draggable = true;
      bmSetupDragSource(row, () => [folder.id], folder);
    }
    bmSetupDropTarget(row, () => ({ parentId: folder.id, beforeId: null, into: true }));
    nav.appendChild(row);

    if (subfolders.length && bmManager.expanded.has(folder.id)) {
      subfolders.forEach(sf => build(sf, depth + 1));
    }
  };
  bmRoots().forEach(r => build(r, 0));
}

function bmRenderTrashLink(container) {
  container.innerHTML = '';
  const row = bmEl('div', 'bm-tree-row trash');
  if (bmManager.folderId === 'trash') row.classList.add('active');
  const ic = bmEl('span', 'bm-tree-icon');
  ic.innerHTML = BM_ICONS.trash;
  row.append(ic, bmEl('span', 'bm-tree-label', 'Corbeille'));
  if (bookmarksData.trash.length) row.appendChild(bmEl('span', 'bm-tree-count', String(bookmarksData.trash.length)));
  row.addEventListener('click', () => bmManagerGo('trash'));
  // Glisser vers la corbeille = supprimer
  row.addEventListener('dragover', (e) => {
    if (!bmDragIds) return;
    e.preventDefault();
    row.classList.add('bm-drop-into');
  });
  row.addEventListener('dragleave', () => row.classList.remove('bm-drop-into'));
  row.addEventListener('drop', (e) => {
    if (!bmDragIds) return;
    e.preventDefault();
    const ids = bmDragIds;
    bmDragIds = null;
    bmClearDropMarks();
    bmDeleteWithToast(ids);
  });
  container.appendChild(row);
}

function bmRenderHeading(h) {
  h.innerHTML = '';
  if (bmManager.folderId === 'trash') {
    h.appendChild(bmEl('span', 'bm-crumb current', 'Corbeille'));
    if (bookmarksData.trash.length) {
      const btn = bmEl('button', 'bm-btn danger bm-heading-action');
      btn.innerHTML = BM_ICONS.trash + 'Vider la corbeille';
      btn.addEventListener('click', bmEmptyTrash);
      h.appendChild(btn);
    }
    return;
  }
  if (bmManager.search) {
    h.appendChild(bmEl('span', 'bm-crumb current', `Résultats pour « ${bmManager.search} »`));
    return;
  }
  const info = bmFind(bmManager.folderId);
  const chain = [...info.path, info.node];
  chain.forEach((f, i) => {
    if (i > 0) {
      const sep = bmEl('span', 'bm-crumb-sep');
      sep.innerHTML = BM_ICONS.caret;
      h.appendChild(sep);
    }
    const c = bmEl('span', 'bm-crumb' + (i === chain.length - 1 ? ' current' : ''), bmFolderTitle(f));
    if (i < chain.length - 1) c.addEventListener('click', () => bmManagerGo(f.id));
    bmSetupDropTarget(c, () => (i < chain.length - 1 ? { parentId: f.id, beforeId: null, into: true, el: c } : null));
    h.appendChild(c);
  });
  const count = info.node.children.length;
  h.appendChild(bmEl('span', 'bm-heading-count', count ? `${count} élément${count > 1 ? 's' : ''}` : ''));
}

function bmRenderFolder(content, folder) {
  if (!folder.children.length) {
    const empty = bmEl('div', 'bm-empty');
    empty.innerHTML = `${BM_ICONS.bookmark}<h2>Ce dossier est vide</h2><p>Ajoutez des pages avec le bouton signet de la barre d'adresse (Ctrl+D), ou glissez des signets ici.</p>`;
    content.appendChild(empty);
    return;
  }
  const orientation = bmManager.view === 'list' ? 'vertical' : 'horizontal';
  folder.children.forEach(node => {
    const entry = bmCreateEntry(node);
    bmSetupDropTarget(entry, (e) => bmDropPosition(e, entry, node, folder.id, orientation));
    content.appendChild(entry);
  });
}

function bmRenderSearch(content) {
  const q = bmManager.search.toLowerCase();
  const results = [];
  bmWalk((node, parent, path) => {
    if (!parent) return;
    const hay = (node.title + ' ' + (node.url || '')).toLowerCase();
    if (hay.includes(q)) results.push({ node, path: [...path, parent].slice(0) });
  });
  if (!results.length) {
    const empty = bmEl('div', 'bm-empty');
    empty.innerHTML = `${BM_ICONS.search}<h2>Aucun résultat</h2><p>Aucun signet ne correspond à votre recherche.</p>`;
    content.appendChild(empty);
    return;
  }
  results.forEach(r => {
    const parentPath = r.path.filter(Boolean).map(bmFolderTitle).join(' › ');
    content.appendChild(bmCreateEntry(r.node, parentPath));
  });
}

function bmCreateEntry(node, pathLabel = null) {
  const view = bmManager.view;
  const entry = bmEl('div', `bm-entry ${node.type === 'folder' ? 'is-folder' : 'is-url'}`);
  entry.dataset.id = node.id;
  entry.draggable = !bmManager.search;

  if (view === 'list') {
    entry.appendChild(bmFaviconEl(node));
    const title = bmEl('span', 'bm-entry-title', node.title || node.url);
    entry.appendChild(title);
    const n = node.type === 'folder' ? bmCountUrls(node) : 0;
    const sub = bmEl('span', 'bm-entry-url',
      node.type === 'url' ? node.url : (n ? `${n} signet${n > 1 ? 's' : ''}` : 'Vide'));
    entry.appendChild(sub);
    if (pathLabel) entry.appendChild(bmEl('span', 'bm-entry-path', pathLabel));
    const actions = bmEl('span', 'bm-entry-actions');
    const editBtn = bmEl('button', 'bm-icon-btn');
    editBtn.title = node.type === 'folder' ? 'Renommer' : 'Modifier';
    editBtn.innerHTML = BM_ICONS.edit;
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); bmEditNode(node.id); });
    const delBtn = bmEl('button', 'bm-icon-btn danger');
    delBtn.title = 'Supprimer';
    delBtn.innerHTML = BM_ICONS.trash;
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); bmDeleteWithToast([node.id]); });
    actions.append(editBtn, delBtn);
    entry.appendChild(actions);
  } else {
    const thumb = bmEl('div', 'bm-thumb');
    thumb.appendChild(bmFaviconEl(node, view === 'large'));
    if (node.type === 'folder') {
      const n = bmCountUrls(node);
      thumb.appendChild(bmEl('span', 'bm-thumb-count', String(n)));
    }
    entry.appendChild(thumb);
    entry.appendChild(bmEl('div', 'bm-entry-title', node.title || node.url));
    if (view === 'large') {
      entry.appendChild(bmEl('div', 'bm-entry-url', node.type === 'url' ? bmDisplayUrl(bmHost(node.url) || node.url) : 'Dossier'));
    }
    entry.title = node.type === 'url' ? `${node.title}\n${node.url}` : node.title;
  }

  entry.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  entry.addEventListener('click', (e) => bmEntryClick(e, node));
  entry.addEventListener('dblclick', () => {
    if (node.type === 'folder') bmManagerGo(node.id);
    else bmOpenUrl(node.url, true);
  });
  entry.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    if (node.type === 'url') bmOpenUrl(node.url, true);
    else bmOpenAll(node);
  });
  entry.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!bmManager.selected.has(node.id)) bmManagerSelect([node.id]);
    const sel = [...bmManager.selected];
    if (sel.length > 1) {
      const urls = sel.map(id => bmFind(id)?.node).filter(n => n?.type === 'url');
      bmShowContextMenu([
        { label: `Ouvrir ${urls.length} signets dans de nouveaux onglets`, icon: BM_ICONS.tabs, action: () => urls.forEach(u => createNewTab(u.url)), disabled: !urls.length },
        { separator: true },
        { label: `Supprimer ${sel.length} éléments`, icon: BM_ICONS.trash, danger: true, action: () => bmDeleteWithToast(sel), shortcut: 'Suppr' }
      ], e.clientX, e.clientY);
    } else {
      bmShowContextMenu(bmNodeContextItems(node, { inManager: true }), e.clientX, e.clientY);
    }
  });
  bmSetupDragSource(entry, () => (bmManager.selected.has(node.id) ? [...bmManager.selected] : [node.id]), node);
  return entry;
}

function bmEntryClick(e, node) {
  const sel = bmManager.selected;
  if (e.ctrlKey || e.metaKey) {
    sel.has(node.id) ? sel.delete(node.id) : sel.add(node.id);
    bmManager.lastClicked = node.id;
  } else if (e.shiftKey && bmManager.lastClicked) {
    const ids = [...bmManager.element.querySelectorAll('.bm-entry')].map(x => x.dataset.id);
    const a = ids.indexOf(bmManager.lastClicked);
    const b = ids.indexOf(node.id);
    if (a >= 0 && b >= 0) {
      sel.clear();
      ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(id => sel.add(id));
    }
  } else {
    sel.clear();
    sel.add(node.id);
    bmManager.lastClicked = node.id;
  }
  bmManagerApplySelection();
}

// ---- Corbeille ----
function bmRenderTrash(content) {
  const trash = bookmarksData.trash;
  if (!trash.length) {
    const empty = bmEl('div', 'bm-empty');
    empty.innerHTML = `${BM_ICONS.trash}<h2>La corbeille est vide</h2><p>Les signets supprimés apparaissent ici et peuvent être restaurés.</p>`;
    content.appendChild(empty);
    return;
  }
  trash.forEach((entry, idx) => {
    const node = entry.node;
    const row = bmEl('div', 'bm-entry ' + (node.type === 'folder' ? 'is-folder' : 'is-url'));
    row.dataset.id = 'trash-' + idx;
    row.appendChild(bmFaviconEl(node));
    row.appendChild(bmEl('span', 'bm-entry-title', node.title || node.url));
    row.appendChild(bmEl('span', 'bm-entry-url', node.type === 'url' ? node.url : `Dossier · ${bmCountUrls(node)} signet(s)`));
    row.appendChild(bmEl('span', 'bm-entry-path', new Date(entry.deletedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
    const actions = bmEl('span', 'bm-entry-actions visible');
    const restore = bmEl('button', 'bm-icon-btn');
    restore.title = 'Restaurer';
    restore.innerHTML = BM_ICONS.restore;
    restore.addEventListener('click', (e) => { e.stopPropagation(); bmRestore([idx]); showNotification('Signet restauré'); });
    const del = bmEl('button', 'bm-icon-btn danger');
    del.title = 'Supprimer définitivement';
    del.innerHTML = BM_ICONS.close;
    del.addEventListener('click', (e) => { e.stopPropagation(); bmDeleteForever([idx]); });
    actions.append(restore, del);
    row.appendChild(actions);
    row.addEventListener('click', (e) => bmEntryClick(e, { id: row.dataset.id }));
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      bmShowContextMenu([
        { label: 'Restaurer', icon: BM_ICONS.restore, action: () => { bmRestore([idx]); showNotification('Signet restauré'); } },
        { label: 'Supprimer définitivement', icon: BM_ICONS.close, danger: true, action: () => bmDeleteForever([idx]) }
      ], e.clientX, e.clientY);
    });
    content.appendChild(row);
  });
}

function bmEmptyTrash() {
  if (!bookmarksData.trash.length) return;
  if (!confirm('Supprimer définitivement tous les éléments de la corbeille ?')) return;
  bookmarksData.trash = [];
  bmCommit();
}

// ---- Clavier dans le gestionnaire ----
function bmHandleManagerKeydown(e) {
  if (!bmManager || e.defaultPrevented) return;
  const active = tabs.find(t => t.id === activeTabId);
  if (!active?.isBookmarksPage) return;
  if (bmFloating.length) return;
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

  const sel = [...bmManager.selected];
  if (e.key === 'Delete' && sel.length) {
    e.preventDefault();
    if (bmManager.folderId === 'trash') {
      bmDeleteForever(sel.map(id => parseInt(id.replace('trash-', ''), 10)));
    } else {
      bmDeleteWithToast(sel);
    }
  } else if (e.key === 'Enter' && sel.length === 1 && bmManager.folderId !== 'trash') {
    const n = bmFind(sel[0])?.node;
    if (!n) return;
    if (n.type === 'folder') bmManagerGo(n.id);
    else bmOpenUrl(n.url, true);
  } else if (e.key === 'F2' && sel.length === 1 && bmManager.folderId !== 'trash') {
    e.preventDefault();
    bmEditNode(sel[0]);
  } else if (e.key === 'Backspace' && !bmManager.search && bmManager.folderId !== 'trash') {
    const info = bmFind(bmManager.folderId);
    if (info?.parent) bmManagerGo(info.parent.id);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    bmManagerSelect([...bmManager.element.querySelectorAll('.bm-entry')].map(x => x.dataset.id));
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    bmManager.element.querySelector('#bm-search-input')?.focus();
  }
}

/** Appelé quand l'onglet du gestionnaire est fermé. */
function bmOnTabClosed(tabId) {
  if (bmManager && bmManager.tabId === tabId) bmManager = null;
}

// ========== IMPORT / EXPORT (format HTML Netscape) ==========
function bmEscapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bmToNetscapeHtml() {
  const sec = (t) => Math.floor((t || Date.now()) / 1000);
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>'
  ];
  const writeFolder = (folder, depth, extra = '') => {
    const pad = '    '.repeat(depth);
    lines.push(`${pad}<DT><H3 ADD_DATE="${sec(folder.dateAdded)}"${extra}>${bmEscapeHtml(bmFolderTitle(folder))}</H3>`);
    lines.push(`${pad}<DL><p>`);
    folder.children.forEach(c => {
      if (c.type === 'folder') writeFolder(c, depth + 1);
      else lines.push(`${pad}    <DT><A HREF="${bmEscapeHtml(c.url)}" ADD_DATE="${sec(c.dateAdded)}">${bmEscapeHtml(c.title)}</A>`);
    });
    lines.push(`${pad}</DL><p>`);
  };
  writeFolder(bookmarksData.roots.bar, 1, ' PERSONAL_TOOLBAR_FOLDER="true"');
  writeFolder(bookmarksData.roots.other, 1);
  lines.push('</DL><p>');
  return lines.join('\n');
}

function bmParseNetscapeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rootDl = doc.querySelector('dl');
  if (!rootDl) return null;
  let count = 0;

  const parseDl = (dl) => {
    const out = [];
    for (const dt of dl.children) {
      if (dt.tagName !== 'DT') continue;
      const h3 = dt.querySelector(':scope > h3');
      const a = dt.querySelector(':scope > a');
      if (h3) {
        let sub = dt.querySelector(':scope > dl');
        if (!sub && dt.nextElementSibling?.tagName === 'DL') sub = dt.nextElementSibling;
        const folder = bmNewFolder(h3.textContent.trim() || 'Sans nom');
        const added = parseInt(h3.getAttribute('add_date'), 10);
        if (added) folder.dateAdded = added * 1000;
        folder.children = sub ? parseDl(sub) : [];
        folder._toolbar = h3.hasAttribute('personal_toolbar_folder');
        out.push(folder);
      } else if (a) {
        const href = a.getAttribute('href') || '';
        if (!href || /^(javascript|place):/i.test(href)) continue;
        const icon = a.getAttribute('icon') || '';
        const node = bmNewUrl(a.textContent.trim() || href, href, icon.startsWith('data:image') && icon.length < 30000 ? icon : '');
        const added = parseInt(a.getAttribute('add_date'), 10);
        if (added) node.dateAdded = added * 1000;
        out.push(node);
        count++;
      }
    }
    return out;
  };

  return { items: parseDl(rootDl), count };
}

async function bmImport() {
  let text;
  try {
    text = await window.zenithAPI.importBookmarksFile();
  } catch (e) {
    showNotification("Erreur lors de l'ouverture du fichier");
    return;
  }
  if (!text) return;

  const parsed = bmParseNetscapeHtml(text);
  if (!parsed || !parsed.count) {
    showNotification('Aucun signet trouvé dans ce fichier');
    return;
  }
  const strip = (n) => { delete n._toolbar; if (n.type === 'folder') n.children.forEach(strip); return n; };

  // Le dossier "barre personnelle" (Opera/Chrome/Firefox) va dans la barre de signets,
  // le reste dans un dossier "Importés" dans Autres signets.
  const rest = [];
  parsed.items.forEach(item => {
    if (item.type === 'folder' && item._toolbar) {
      bookmarksData.roots.bar.children.push(...item.children.map(strip));
    } else {
      rest.push(strip(item));
    }
  });
  if (rest.length) {
    const date = new Date().toLocaleDateString('fr-FR');
    const folder = bmNewFolder(`Importés le ${date}`);
    folder.children = rest;
    bookmarksData.roots.other.children.push(folder);
  }
  bmCommit();
  showNotification(`${parsed.count} signet${parsed.count > 1 ? 's' : ''} importé${parsed.count > 1 ? 's' : ''}`);
}

async function bmExport() {
  try {
    const path = await window.zenithAPI.exportBookmarksFile(bmToNetscapeHtml());
    if (path) showNotification('Signets exportés');
  } catch (e) {
    showNotification("Erreur lors de l'export");
  }
}

// ============================================================
// ==================== PILES D'ONGLETS =======================
// ============================================================

/**
 * Zenith Browser - Piles d'onglets (inspiré des "Tab Islands" d'Opera)
 *
 * - Un lien ouvert depuis un onglet (target=_blank, "Ouvrir dans un nouvel onglet")
 *   crée automatiquement une pile regroupant l'onglet d'origine et le nouvel onglet.
 * - Chaque pile a une couleur, un nom, un logo (logo Zenith par défaut, ou image importée),
 *   et peut être réduite / développée en cliquant sur son onglet de tête.
 * - Quand on choisit une couleur, l'onglet de tête de la pile est entièrement coloré,
 *   le logo étant détouré dans une découpe.
 * - Une pile peut être enregistrée en dossier de signets, et un dossier de signets
 *   peut être rouvert en pile.
 * - Glisser un onglet entre deux onglets d'une pile l'y ajoute ; le sortir l'en retire.
 */

const PILE_COLORS = [
  { name: 'Bleu', value: '#5b8def' },
  { name: 'Vert', value: '#30a46c' },
  { name: 'Orange', value: '#f5a524' },
  { name: 'Violet', value: '#8e4ec6' },
  { name: 'Rouge', value: '#e5484d' },
  { name: 'Turquoise', value: '#12a594' },
  { name: 'Rose', value: '#e93d82' },
  { name: 'Gris', value: '#8b8d98' }
];

const PILE_DEFAULT_LOGO = 'home/assets/img/logo.png';

const PILE_ICONS = {
  pile: '<svg class="icon" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="12" rx="3"/><path d="M6 7V5h12v2"/></svg>',
  out: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  collapse: '<svg class="icon" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
  expand: '<svg class="icon" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
  image: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  noImage: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
  save: '<svg class="icon" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>'
};

const piles = new Map();
let pileCounter = 0;
let pilesAuto = (localStorage.getItem('pilesAuto') ?? localStorage.getItem('islandsAuto')) !== 'false';
// Clic sur la tête de pile : ouvrir la page de la pile (sinon : réduire / développer)
let pileHeadOpensPage = localStorage.getItem('pileHeadPage') !== 'false';

function initializePiles() {
  const container = document.getElementById('tabs-container');

  // Clic droit sur un onglet ou sur l'onglet de tête d'une pile
  container.addEventListener('contextmenu', (e) => {
    const handle = e.target.closest('.pile-handle');
    if (handle) {
      e.preventDefault();
      showPileMenu(handle.dataset.pile, e.clientX, e.clientY);
      return;
    }
    const tabEl = e.target.closest('.tab');
    if (tabEl) {
      e.preventDefault();
      showTabMenu(tabEl.id, e.clientX, e.clientY);
    }
  });

  const pageToggle = document.getElementById('toggle-pile-page');
  if (pageToggle) {
    pageToggle.classList.toggle('active', pileHeadOpensPage);
    pageToggle.addEventListener('click', () => {
      pileHeadOpensPage = !pileHeadOpensPage;
      localStorage.setItem('pileHeadPage', String(pileHeadOpensPage));
      pageToggle.classList.toggle('active', pileHeadOpensPage);
      if (!pileHeadOpensPage && activePileView) closePilePage(true);
      renderPiles();
    });
  }

  const toggle = document.getElementById('toggle-piles');
  if (toggle) {
    toggle.classList.toggle('active', pilesAuto);
    toggle.addEventListener('click', () => {
      pilesAuto = !pilesAuto;
      localStorage.setItem('pilesAuto', String(pilesAuto));
      toggle.classList.toggle('active', pilesAuto);
    });
  }
}

// ======================= MODÈLE =======================
function nextPileColor() {
  const used = new Set([...piles.values()].map(p => p.color));
  const free = PILE_COLORS.find(c => !used.has(c.value));
  return (free || PILE_COLORS[pileCounter % PILE_COLORS.length]).value;
}

function createPile(tabIds, name = '') {
  const id = `pile-${++pileCounter}`;
  // colorChosen : la couleur a été choisie par l'utilisateur -> onglet de tête plein
  piles.set(id, { id, name, color: nextPileColor(), colorChosen: false, logo: null, collapsed: false });
  tabIds.forEach(tid => {
    const t = tabs.find(x => x.id === tid);
    if (t) t.pileId = id;
  });
  renderPiles();
  return id;
}

function pileTabs(pileId) {
  return tabs.filter(t => t.pileId === pileId);
}

/** Déplace un onglet (DOM + tableau tabs) juste après un autre. */
function moveTabAfter(tabId, afterTabId) {
  const tab = tabs.find(t => t.id === tabId);
  const after = tabs.find(t => t.id === afterTabId);
  if (!tab || !after || tab === after) return;
  tabs.splice(tabs.indexOf(tab), 1);
  tabs.splice(tabs.indexOf(after) + 1, 0, tab);
  const el = document.getElementById(tabId);
  const afterEl = document.getElementById(afterTabId);
  if (el && afterEl) afterEl.after(el);
}

/**
 * Appelé quand un onglet est ouvert depuis un autre (lien).
 * opts.inPile : true = dans la pile de l'onglet d'origine (créée si besoin),
 *               false = nouvel onglet hors pile, juste après la pile.
 *               Par défaut : réglage « Piles d'onglets automatiques ».
 */
function pilesOnTabOpened(newTabId, openerId, opts = {}) {
  const opener = tabs.find(t => t.id === openerId);
  const newTab = tabs.find(t => t.id === newTabId);
  if (!opener || !newTab || opener === newTab) return;
  const inPile = typeof opts.inPile === 'boolean' ? opts.inPile : pilesAuto;

  if (!inPile) {
    // Hors pile : à droite de la pile de l'onglet d'origine (ou de l'onglet lui-même)
    const group = opener.pileId && piles.has(opener.pileId) ? pileTabs(opener.pileId) : [opener];
    moveTabAfter(newTabId, group[group.length - 1].id);
    newTab.pileId = null;
    renderPiles();
    return;
  }

  if (!opener.pileId || !piles.has(opener.pileId)) createPile([opener.id]);
  newTab.pileId = opener.pileId;
  const members = pileTabs(opener.pileId).filter(t => t.id !== newTabId);
  moveTabAfter(newTabId, members[members.length - 1].id);
  const pile = piles.get(opener.pileId);
  if (pile) pile.collapsed = false;
  renderPiles();
}

/**
 * Appelé à chaque changement d'onglet actif. Une pile réduite reste réduite :
 * seuls sa tête et l'onglet actif (s'il en fait partie) restent visibles.
 */
function pilesOnSwitch(tabId) {
  renderPiles();
}

/** Après un glisser-déposer : rejoindre / quitter une pile selon les voisins. */
function pilesAfterDrag(tabId) {
  const i = tabs.findIndex(t => t.id === tabId);
  if (i < 0) return;
  const tab = tabs[i];
  const prev = tabs[i - 1];
  const next = tabs[i + 1];
  if (prev && next && prev.pileId && prev.pileId === next.pileId) {
    tab.pileId = prev.pileId;               // déposé au milieu d'une pile
  } else if (tab.pileId && prev?.pileId !== tab.pileId && next?.pileId !== tab.pileId) {
    tab.pileId = null;                      // sorti de sa pile
  }
  renderPiles();
}

// ====================== RENDU ======================
/** Couleur de texte lisible sur un fond donné. */
function pileTextColor(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map(x => parseInt(x, 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#141414' : '#ffffff';
}

function renderPiles() {
  const container = document.getElementById('tabs-container');
  if (!container) return;
  container.querySelectorAll('.pile-handle').forEach(h => h.remove());

  // Nettoyage : piles sans onglet
  const counts = {};
  tabs.forEach(t => {
    if (!t.pileId) return;
    if (!piles.has(t.pileId)) { t.pileId = null; return; }
    counts[t.pileId] = (counts[t.pileId] || 0) + 1;
  });
  for (const id of [...piles.keys()]) {
    if (!counts[id]) {
      piles.delete(id);
      document.getElementById(`pileview-${id}`)?.remove();
    }
  }

  tabs.forEach((t, i) => {
    const el = document.getElementById(t.id);
    if (!el) return;
    el.classList.remove('in-pile', 'pile-first', 'pile-last', 'pile-hidden');
    const pile = t.pileId && piles.get(t.pileId);
    if (!pile) { el.style.removeProperty('--pile-color'); return; }

    el.classList.add('in-pile');
    el.style.setProperty('--pile-color', pile.color);
    const prev = tabs[i - 1];
    const next = tabs[i + 1];
    if (!prev || prev.pileId !== t.pileId) {
      el.classList.add('pile-first');
      container.insertBefore(createPileHandle(pile, counts[pile.id]), el);
    }
    if (!next || next.pileId !== t.pileId) el.classList.add('pile-last');
    if (pile.collapsed && (t.id !== activeTabId || activePileView === pile.id)) el.classList.add('pile-hidden');
  });

  if (activePileView) schedulePilePageRender();
}

/** Onglet de tête de la pile : logo détouré + nom. */
function createPileHandle(pile, count) {
  const h = document.createElement('div');
  h.className = 'pile-handle'
    + (pile.collapsed ? ' collapsed' : '')
    + (pile.name ? ' named' : '')
    + ' solid';
  h.dataset.pile = pile.id;
  h.style.setProperty('--pile-color', pile.color);
  h.style.setProperty('--pile-text', pileTextColor(pile.color));
  if (pile.id === activePileView) h.classList.add('active');
  h.title = (pile.name ? `${pile.name} — ` : '') + `${count} onglet${count > 1 ? 's' : ''}\nClic : ${pileHeadOpensPage ? 'page de la pile' : (pile.collapsed ? 'développer' : 'réduire')} · Clic droit : options`;

  const logoWrap = document.createElement('span');
  logoWrap.className = 'pile-logo' + (pile.logo ? ' custom' : '');
  const img = new Image();
  img.alt = '';
  img.draggable = false;
  img.src = pile.logo || PILE_DEFAULT_LOGO;
  img.addEventListener('error', () => { img.remove(); });
  logoWrap.appendChild(img);
  h.appendChild(logoWrap);

  if (pile.name) {
    const span = document.createElement('span');
    span.className = 'pile-label';
    span.textContent = pile.name;
    h.appendChild(span);
  }
  // Nombre d'onglets : visible au survol uniquement
  const countEl = document.createElement('span');
  countEl.className = 'pile-count';
  countEl.textContent = String(count);
  h.appendChild(countEl);

  // Petit bouton pour réduire / développer la pile
  const toggle = document.createElement('button');
  toggle.className = 'pile-collapse-btn';
  toggle.title = pile.collapsed ? 'Développer la pile' : 'Réduire la pile';
  toggle.innerHTML = pile.collapsed ? PILE_ICONS.expand : PILE_ICONS.collapse;
  toggle.addEventListener('mousedown', (e) => e.stopPropagation());
  toggle.addEventListener('click', (e) => { e.stopPropagation(); togglePileCollapsed(pile.id); });
  h.appendChild(toggle);

  setupPileHandleDrag(h, pile.id);
  return h;
}

/**
 * L'onglet de tête se saisit comme un onglet classique : glisser = déplacer toute la pile,
 * simple clic = réduire / développer.
 */
function setupPileHandleDrag(handle, pileId) {
  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (e.button === 1) { e.preventDefault(); return; }
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    let dragging = false;
    let els = [];

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (!dragging && Math.abs(dx) > 5) {
        dragging = true;
        els = [handle, ...pileTabs(pileId).map(t => document.getElementById(t.id)).filter(Boolean)];
        els.forEach(el => { el.style.transition = 'none'; el.style.zIndex = '100'; el.classList.add('pile-dragging'); });
      }
      if (dragging) els.forEach(el => { el.style.transform = `translateX(${dx}px)`; });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragging) {
        if (pileHeadOpensPage) openPilePage(pileId);
        else togglePileCollapsed(pileId);
        return;
      }
      // Centre visuel du groupe déplacé
      const rects = els.map(el => el.getBoundingClientRect()).filter(r => r.width > 0);
      const left = Math.min(...rects.map(r => r.left));
      const right = Math.max(...rects.map(r => r.right));
      els.forEach(el => { el.style.transform = ''; el.style.zIndex = ''; el.classList.remove('pile-dragging'); });
      void handle.offsetWidth;
      els.forEach(el => { el.style.transition = ''; });
      movePileTo(pileId, (left + right) / 2);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/** Replace la pile à la position horizontale donnée, sans couper une autre pile. */
function movePileTo(pileId, centerX) {
  const memberIds = new Set(pileTabs(pileId).map(t => t.id));
  const members = tabs.filter(t => memberIds.has(t.id));
  const others = tabs.filter(t => !memberIds.has(t.id));

  let insertAt = others.length;
  for (let i = 0; i < others.length; i++) {
    const t = others[i];
    const el = document.getElementById(t.id);
    let r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
    if (!r && t.pileId) r = document.querySelector(`.pile-handle[data-pile="${t.pileId}"]`)?.getBoundingClientRect();
    if (!r) continue;
    if (centerX < r.left + r.width / 2) { insertAt = i; break; }
  }
  // Ne pas s'insérer au milieu d'une autre pile : se placer après elle
  const prev = others[insertAt - 1];
  if (prev?.pileId && others[insertAt]?.pileId === prev.pileId) {
    while (insertAt < others.length && others[insertAt].pileId === prev.pileId) insertAt++;
  }

  const order = [...others.slice(0, insertAt), ...members, ...others.slice(insertAt)];
  tabs.splice(0, tabs.length, ...order);
  const container = document.getElementById('tabs-container');
  const btn = document.getElementById('new-tab-btn');
  tabs.forEach(t => { const el = document.getElementById(t.id); if (el) container.insertBefore(el, btn); });
  renderPiles();
}

// ========== ACTIONS ==========
function togglePileCollapsed(pileId, force) {
  const pile = piles.get(pileId);
  if (!pile) return;
  // Réduite : seuls la tête et l'onglet actif (s'il est dans la pile) restent affichés
  pile.collapsed = typeof force === 'boolean' ? force : !pile.collapsed;
  renderPiles();
}

function renamePile(pileId) {
  const pile = piles.get(pileId);
  if (!pile) return;
  bmDialog({
    heading: 'Nommer la pile',
    title: pile.name || '',
    showUrl: false,
    showFolder: false,
    confirmLabel: 'Enregistrer'
  }).then(res => {
    if (!res) return;
    pile.name = res.title;
    renderPiles();
  });
}

function setPileColor(pileId, color) {
  const pile = piles.get(pileId);
  if (!pile) return;
  pile.color = color;
  pile.colorChosen = true;
  renderPiles();
}

/** Importer une image comme logo (redimensionnée en 64×64, recadrée au centre). */
function choosePileLogo(pileId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,image/bmp';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const w = img.naturalWidth || size;
        const hgt = img.naturalHeight || size;
        const side = Math.min(w, hgt);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (w - side) / 2, (hgt - side) / 2, side, side, 0, 0, size, size);
        const pile = piles.get(pileId);
        if (!pile) return;
        pile.logo = canvas.toDataURL('image/png');
        renderPiles();
      };
      img.onerror = () => showNotification("Impossible de lire cette image");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  document.body.appendChild(input);
  input.click();
}

function removePileLogo(pileId) {
  const pile = piles.get(pileId);
  if (!pile) return;
  pile.logo = null;
  renderPiles();
}

/** Enregistre tous les onglets de la pile dans un nouveau dossier de signets. */
async function savePileToBookmarks(pileId) {
  const pile = piles.get(pileId);
  if (!pile) return;
  const pages = pileTabs(pileId).filter(t => t.webview && bmIsBookmarkableUrl(t.url));
  if (!pages.length) {
    showNotification('Aucune page à enregistrer dans cette pile');
    return;
  }
  const res = await bmDialog({
    heading: 'Enregistrer la pile dans les signets',
    title: pile.name || `Pile du ${new Date().toLocaleDateString('fr-FR')}`,
    showUrl: false,
    parentId: 'bar',
    confirmLabel: `Enregistrer (${pages.length} page${pages.length > 1 ? 's' : ''})`
  });
  if (!res) return;
  const folder = bmNewFolder(res.title);
  folder.children = pages.map(t => bmNewUrl(t.title || t.url, t.url, t.faviconUrl));
  bmAdd(res.parentId, folder);
  if (!pile.name) { pile.name = res.title; renderPiles(); }
  showNotification(`Pile enregistrée dans les signets (${pages.length} page${pages.length > 1 ? 's' : ''})`);
}

/** Ouvre une liste d'URL dans une nouvelle pile (utilisé par « Tout ouvrir » des signets). */
function openUrlsAsPile(urls, name = '') {
  if (!urls.length) return;
  const ids = [];
  urls.forEach(u => {
    createNewTab(u);
    ids.push(tabs[tabs.length - 1].id);
  });
  if (ids.length > 1) createPile(ids, name);
  switchToTab(ids[0]);
}

function ungroupPile(pileId) {
  pileTabs(pileId).forEach(t => { t.pileId = null; });
  piles.delete(pileId);
  renderPiles();
}

function closePile(pileId) {
  const members = pileTabs(pileId);
  if (members.length > 3 && !confirm(`Fermer les ${members.length} onglets de cette pile ?`)) return;
  // Fermer en dernier l'onglet actif pour éviter les bascules inutiles
  members.sort((a, b) => (a.id === activeTabId) - (b.id === activeTabId)).forEach(t => closeTab(t.id));
}

function newTabInPile(pileId) {
  const members = pileTabs(pileId);
  if (!members.length) return;
  createNewTab();
  const newTab = tabs[tabs.length - 1];
  newTab.pileId = pileId;
  moveTabAfter(newTab.id, members[members.length - 1].id);
  renderPiles();
}

function removeTabFromPile(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab?.pileId) return;
  const members = pileTabs(tab.pileId);
  tab.pileId = null;
  // Le sortir à droite de la pile pour la garder contiguë
  const remaining = members.filter(t => t.id !== tabId);
  if (remaining.length) moveTabAfter(tabId, remaining[remaining.length - 1].id);
  renderPiles();
}

// ========== MENUS ==========
function addColorSwatches(pileId) {
  const menu = bmFloating[bmFloating.length - 1];
  const pile = piles.get(pileId);
  if (!menu || !pile) return;
  const row = document.createElement('div');
  row.className = 'pile-swatches';
  PILE_COLORS.forEach(c => {
    const s = document.createElement('button');
    s.className = 'pile-swatch' + (pile.color === c.value ? ' active' : '');
    s.style.background = c.value;
    s.title = c.name;
    s.addEventListener('click', () => {
      bmCloseAll();
      setPileColor(pileId, c.value);
    });
    row.appendChild(s);
  });
  menu.insertBefore(row, menu.firstChild);
  const sep = document.createElement('div');
  sep.className = 'context-menu-separator';
  row.after(sep);
  const r = menu.getBoundingClientRect();
  bmPlace(menu, r.left, r.top);
}

function showPileMenu(pileId, x, y) {
  const pile = piles.get(pileId);
  if (!pile) return;
  const count = pileTabs(pileId).length;
  bmShowContextMenu([
    { label: pile.name ? 'Renommer la pile' : 'Nommer la pile', icon: BM_ICONS.edit, action: () => renamePile(pileId) },
    { label: pile.logo ? 'Changer le logo' : 'Choisir un logo', icon: PILE_ICONS.image, action: () => choosePileLogo(pileId) },
    pile.logo ? { label: 'Remettre le logo Zenith', icon: PILE_ICONS.noImage, action: () => removePileLogo(pileId) } : null,
    { separator: true },
    { label: 'Enregistrer la pile dans les signets', icon: PILE_ICONS.save, action: () => savePileToBookmarks(pileId) },
    { label: pile.collapsed ? 'Développer la pile' : 'Réduire la pile', icon: pile.collapsed ? PILE_ICONS.expand : PILE_ICONS.collapse, action: () => togglePileCollapsed(pileId) },
    { label: 'Nouvel onglet dans la pile', icon: BM_ICONS.plus, action: () => newTabInPile(pileId) },
    { separator: true },
    { label: 'Dégrouper les onglets', icon: PILE_ICONS.out, action: () => ungroupPile(pileId) },
    { label: `Fermer la pile (${count} onglet${count > 1 ? 's' : ''})`, icon: BM_ICONS.close, danger: true, action: () => closePile(pileId) }
  ], x, y);
  addColorSwatches(pileId);
}

function showTabMenu(tabId, x, y) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  const pile = tab.pileId && piles.get(tab.pileId);
  const items = [
    { label: 'Nouvel onglet', icon: BM_ICONS.plus, action: () => createNewTab(), shortcut: 'Ctrl+T' }
  ];
  if (tab.webview) {
    items.push({ label: 'Actualiser', icon: '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>', action: () => tab.webview.reload() });
    items.push({ label: 'Dupliquer', icon: BM_ICONS.tabs, action: () => { createNewTab(tab.url); const n = tabs[tabs.length - 1]; n.pileId = tab.pileId || null; moveTabAfter(n.id, tab.id); renderPiles(); } });
  }
  items.push({ separator: true });
  if (pile) {
    items.push({ label: 'Nouvel onglet dans la pile', icon: BM_ICONS.plus, action: () => newTabInPile(pile.id) });
    items.push({ label: 'Enregistrer la pile dans les signets', icon: PILE_ICONS.save, action: () => savePileToBookmarks(pile.id) });
    items.push({ label: 'Retirer de la pile', icon: PILE_ICONS.out, action: () => removeTabFromPile(tabId) });
    items.push({ label: pile.collapsed ? 'Développer la pile' : 'Réduire la pile', icon: PILE_ICONS.collapse, action: () => togglePileCollapsed(pile.id) });
  } else {
    items.push({ label: 'Créer une pile avec cet onglet', icon: PILE_ICONS.pile, action: () => createPile([tabId]) });
    // Rejoindre une pile voisine
    const i = tabs.indexOf(tab);
    const neighbour = [tabs[i - 1], tabs[i + 1]].find(t => t?.pileId && piles.has(t.pileId));
    if (neighbour) {
      const n = piles.get(neighbour.pileId);
      items.push({ label: `Ajouter à la pile voisine${n.name ? ` « ${n.name} »` : ''}`, icon: PILE_ICONS.pile, action: () => { tab.pileId = n.id; renderPiles(); } });
    }
  }
  items.push({ separator: true });
  items.push({ label: "Fermer l'onglet", icon: BM_ICONS.close, action: () => closeTab(tabId), shortcut: 'Ctrl+W' });
  if (tabs.length > 1) {
    items.push({ label: 'Fermer les autres onglets', icon: BM_ICONS.close, action: () => tabs.filter(t => t.id !== tabId).forEach(t => closeTab(t.id)) });
  }
  items.push({ label: 'Rouvrir le dernier onglet fermé', icon: BM_ICONS.restore, action: () => reopenLastClosedTab(), shortcut: 'Ctrl+Shift+T', disabled: !closedTabs.length });
  bmShowContextMenu(items, x, y);
}


// ========== PAGE DE LA PILE ==========
// La tête de pile est une page à part entière : elle affiche les pages que la pile contient.
let activePileView = null;
let pilePageRenderQueued = false;
let pilePageRenderPending = false;

function escapePileHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Capture un aperçu de l'onglet (uniquement quand il est visible). */
function capturePileThumb(tab) {
  const wv = tab?.webview;
  if (!wv || !tab.pileId || typeof wv.capturePage !== 'function') return;
  if (!bmIsBookmarkableUrl(tab.url)) return;
  try {
    wv.capturePage().then(img => {
      if (!img || (typeof img.isEmpty === 'function' && img.isEmpty())) return;
      const size = img.getSize ? img.getSize() : { width: 0 };
      const small = size.width > 520 ? img.resize({ width: 520, quality: 'good' }) : img;
      tab.thumb = small.toDataURL();
      if (activePileView && tab.pileId === activePileView) schedulePilePageRender();
    }).catch(() => {});
  } catch { /* webview pas encore prête */ }
}

function openPilePage(pileId) {
  const pile = piles.get(pileId);
  if (!pile) return;
  if (activePileView === pileId) return;
  if (activePileView) closePilePage();

  // Masquer l'onglet actuel (en capturant son aperçu)
  const current = tabs.find(t => t.id === activeTabId);
  if (current) capturePileThumb(current);
  if (activeTabId) {
    document.getElementById(activeTabId)?.classList.remove('active');
    document.getElementById(`webview-${activeTabId}`)?.classList.remove('active');
  }

  let page = document.getElementById(`pileview-${pileId}`);
  if (!page) {
    page = document.createElement('div');
    page.id = `pileview-${pileId}`;
    page.className = 'browser-view pile-page';
    document.getElementById('webviews-container').appendChild(page);
  }
  page.classList.add('active');
  activePileView = pileId;

  const urlBar = document.getElementById('url-bar');
  urlBar.value = '';
  urlBar.placeholder = `Ouvrir une page dans la pile « ${pile.name || 'Pile'} »`;
  document.getElementById('bookmark-star')?.classList.add('hidden');

  renderPiles();
  renderPilePage();
}

/** Ferme la page de pile. restore = revenir sur l'onglet actif. */
function closePilePage(restore = false) {
  if (!activePileView) return;
  activePileView = null;
  document.querySelectorAll('.pile-page.active').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.pile-handle.active').forEach(h => h.classList.remove('active'));
  if (typeof updateSearchEnginePlaceholder === 'function') updateSearchEnginePlaceholder();
  if (restore) {
    const t = tabs.find(x => x.id === activeTabId) || tabs[0];
    if (t) switchToTab(t.id);
  }
}

function schedulePilePageRender() {
  if (pilePageRenderQueued) return;
  pilePageRenderQueued = true;
  requestAnimationFrame(() => {
    pilePageRenderQueued = false;
    if (!activePileView) return;
    if (!piles.has(activePileView)) { closePilePage(true); return; }
    // Pas de re-rendu pendant que l'utilisateur modifie le nom
    if (document.activeElement?.classList.contains('pp-title')) { pilePageRenderPending = true; return; }
    renderPilePage();
  });
}

/** Ouvre une URL dans un nouvel onglet de la pile (barre d'adresse sur la page de pile). */
function pileOpenUrl(pileId, url) {
  const members = pileTabs(pileId);
  createNewTab(url);
  const t = tabs[tabs.length - 1];
  t.pileId = pileId;
  if (members.length) moveTabAfter(t.id, members[members.length - 1].id);
  renderPiles();
}

function moveTabBefore(tabId, beforeTabId) {
  const tab = tabs.find(t => t.id === tabId);
  const before = tabs.find(t => t.id === beforeTabId);
  if (!tab || !before || tab === before) return;
  tabs.splice(tabs.indexOf(tab), 1);
  tabs.splice(tabs.indexOf(before), 0, tab);
  const el = document.getElementById(tabId);
  const beforeEl = document.getElementById(beforeTabId);
  if (el && beforeEl) beforeEl.before(el);
}

function pileTabFavicon(t) {
  const img = document.getElementById(t.id)?.querySelector('.tab-favicon img');
  if (img?.src) return img.src;
  try { return `https://www.google.com/s2/favicons?domain=${new URL(t.url).hostname}&sz=64`; } catch { return ''; }
}

function renderPilePage() {
  const pile = piles.get(activePileView);
  const page = pile && document.getElementById(`pileview-${pile.id}`);
  if (!page) return;
  const members = pileTabs(pile.id);
  const scroll = page.scrollTop;
  const textColor = pileTextColor(pile.color);

  page.style.setProperty('--pile-color', pile.color);
  page.style.setProperty('--pile-text', textColor);
  page.innerHTML = `
    <div class="pp-container">
      <header class="pp-header">
        <button class="pp-logo${pile.logo ? ' custom' : ''}" title="Changer le logo">
          <img src="${escapePileHtml(pile.logo || PILE_DEFAULT_LOGO)}" alt="">
          <span class="pp-logo-edit">${BM_ICONS.edit}</span>
        </button>
        <div class="pp-title-block">
          <h1 class="pp-title" contenteditable="plaintext-only" spellcheck="false" data-placeholder="Nommer la pile" title="Cliquer pour renommer">${escapePileHtml(pile.name || '')}</h1>
          <div class="pp-subtitle">${members.length} page${members.length > 1 ? 's' : ''} dans cette pile</div>
          <div class="pp-swatches">
            ${PILE_COLORS.map(c => `<button class="pp-swatch${c.value === pile.color ? ' active' : ''}" data-color="${c.value}" title="${c.name}" style="background:${c.value}"></button>`).join('')}
          </div>
        </div>
        <div class="pp-actions">
          <button class="pp-btn primary" data-a="new">${BM_ICONS.plus}Nouvel onglet</button>
          <button class="pp-btn" data-a="bookmark">${PILE_ICONS.save}Enregistrer en signets</button>
          <button class="pp-btn" data-a="collapse">${pile.collapsed ? PILE_ICONS.expand : PILE_ICONS.collapse}${pile.collapsed ? 'Développer' : 'Réduire'}</button>
          <button class="pp-btn" data-a="ungroup">${PILE_ICONS.out}Dégrouper</button>
          <button class="pp-btn danger" data-a="close">${BM_ICONS.close}Fermer la pile</button>
        </div>
      </header>
      <div class="pp-grid"></div>
    </div>`;

  const grid = page.querySelector('.pp-grid');
  members.forEach(t => {
    const card = document.createElement('div');
    card.className = 'pp-card' + (t.id === activeTabId ? ' last-active' : '');
    card.draggable = true;
    card.dataset.id = t.id;
    let host = '';
    try { host = new URL(t.url).hostname.replace(/^www\./, ''); } catch { host = t.url || ''; }
    const favicon = pileTabFavicon(t);
    card.innerHTML = `
      <div class="pp-thumb">
        ${t.thumb
          ? `<img class="pp-shot" src="${t.thumb}" alt="">`
          : `<div class="pp-noshot">${favicon ? `<img src="${escapePileHtml(favicon)}" alt="">` : BM_ICONS.globe}</div>`}
        ${t.id === activeTabId ? '<span class="pp-badge">Dernier onglet ouvert</span>' : ''}
        <button class="pp-card-close" title="Fermer l'onglet">${BM_ICONS.close}</button>
      </div>
      <div class="pp-card-info">
        ${favicon ? `<img class="pp-favicon" src="${escapePileHtml(favicon)}" alt="">` : `<span class="pp-favicon">${BM_ICONS.globe}</span>`}
        <div class="pp-card-text">
          <div class="pp-card-title">${escapePileHtml(t.title || 'Nouvel onglet')}</div>
          <div class="pp-card-url">${escapePileHtml(host || 'Page d\'accueil')}</div>
        </div>
      </div>`;
    card.querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.style.visibility = 'hidden'; }));

    card.addEventListener('click', (e) => {
      if (e.target.closest('.pp-card-close')) return;
      switchToTab(t.id);
    });
    card.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTabFromPilePage(t.id, pile.id); } });
    card.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    card.querySelector('.pp-card-close').addEventListener('click', (e) => { e.stopPropagation(); closeTabFromPilePage(t.id, pile.id); });
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabMenu(t.id, e.clientX, e.clientY); });

    // Réorganiser par glisser-déposer
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-zenith-tab', t.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.querySelectorAll('.drop-before, .drop-after').forEach(c => c.classList.remove('drop-before', 'drop-after'));
    });
    card.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/x-zenith-tab')) return;
      e.preventDefault();
      const r = card.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      grid.querySelectorAll('.drop-before, .drop-after').forEach(c => c.classList.remove('drop-before', 'drop-after'));
      card.classList.add(after ? 'drop-after' : 'drop-before');
    });
    card.addEventListener('drop', (e) => {
      const id = e.dataTransfer.getData('text/x-zenith-tab');
      if (!id || id === t.id) return;
      e.preventDefault();
      const r = card.getBoundingClientRect();
      if (e.clientX > r.left + r.width / 2) moveTabAfter(id, t.id);
      else moveTabBefore(id, t.id);
      renderPiles();
    });
    grid.appendChild(card);
  });

  // Carte « nouvel onglet »
  const add = document.createElement('button');
  add.className = 'pp-card pp-add';
  add.innerHTML = `<div class="pp-add-inner">${BM_ICONS.plus}<span>Nouvel onglet dans la pile</span></div>`;
  add.addEventListener('click', () => newTabInPile(pile.id));
  grid.appendChild(add);

  // En-tête
  page.querySelector('.pp-logo').addEventListener('click', () => choosePileLogo(pile.id));
  // Nom modifiable directement : Entrée ou clic ailleurs pour valider, Échap pour annuler
  const titleEl = page.querySelector('.pp-title');
  const commitTitle = () => {
    const name = titleEl.textContent.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (name !== (pile.name || '')) {
      pile.name = name;
      renderPiles();
    }
    if (pilePageRenderPending) { pilePageRenderPending = false; schedulePilePageRender(); }
  };
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); titleEl.textContent = pile.name || ''; titleEl.blur(); }
  });
  titleEl.addEventListener('blur', commitTitle);
  titleEl.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData?.getData('text/plain') || '').replace(/\s+/g, ' '));
  });
  page.querySelectorAll('.pp-swatch').forEach(b => b.addEventListener('click', () => setPileColor(pile.id, b.dataset.color)));
  page.querySelector('[data-a="new"]').addEventListener('click', () => newTabInPile(pile.id));
  page.querySelector('[data-a="bookmark"]').addEventListener('click', () => savePileToBookmarks(pile.id));
  page.querySelector('[data-a="collapse"]').addEventListener('click', () => togglePileCollapsed(pile.id));
  page.querySelector('[data-a="ungroup"]').addEventListener('click', () => { ungroupPile(pile.id); closePilePage(true); });
  page.querySelector('[data-a="close"]').addEventListener('click', () => closePile(pile.id));

  page.scrollTop = scroll;
}

/** Fermer un onglet depuis la page de pile sans quitter la page. */
function closeTabFromPilePage(tabId, pileId) {
  closeTab(tabId);
  if (piles.has(pileId) && pileTabs(pileId).length) {
    if (activePileView !== pileId) openPilePage(pileId);
    else schedulePilePageRender();
  }
}

// ============================================================
// ===================== CLAUDE CONNECT =======================
// ============================================================
/**
 * Assistant IA intégré (panneau latéral façon Comet) et outils du navigateur.
 * Les outils sont exécutés ici, à la demande du process principal, pour l'assistant
 * comme pour les clients MCP (Claude Desktop, Claude Code) connectés à Zenith.
 */

const CC_ICONS = {
  spark: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  send: '<svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  stop: '<svg class="icon" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  gear: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>',
  back: '<svg class="icon" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  alert: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  retry: '<svg class="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  globe: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  plug: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/></svg>'
};

const CC_TOOL_LABELS = {
  list_tabs: () => 'Liste des onglets',
  open_tab: (i) => `Ouverture : ${ccShort(i.url)}`,
  switch_tab: (i) => `Affichage de l'onglet ${i.tab_id}`,
  close_tab: (i) => `Fermeture de l'onglet ${i.tab_id}`,
  navigate: (i) => `Navigation : ${ccShort(i.url)}`,
  history_navigation: (i) => ({ back: 'Page précédente', forward: 'Page suivante', reload: 'Actualisation' }[i.action] || 'Navigation'),
  read_page: () => 'Lecture de la page',
  get_selection: () => 'Lecture de la sélection',
  find_in_page: (i) => `Recherche de « ${ccShort(i.query, 40)} » dans la page`,
  get_interactive_elements: () => 'Analyse des éléments de la page',
  click_element: (i) => `Clic sur l'élément ${i.ref}`,
  fill_input: (i) => `Saisie dans le champ ${i.ref}`,
  scroll_page: () => 'Défilement de la page',
  screenshot: () => "Capture d'écran",
  search_history: (i) => `Historique : « ${ccShort(i.query, 40)} »`,
  list_bookmarks: () => 'Lecture des signets',
  add_bookmark: () => 'Ajout aux signets',
  list_notes: () => 'Lecture de la liste des notes',
  read_note: () => "Lecture d'une note",
  create_note: (i) => `Création de la note « ${ccShort(i.title, 40)} »`,
  update_note: () => "Modification d'une note"
};

const CC_SUGGESTIONS = [
  'Résume cette page',
  'Quels sont les points clés de cette page ?',
  'Compare mes onglets ouverts',
  'Crée une note avec un résumé de cette page'
];

const ccState = {
  settings: null,
  view: 'chat',            // chat | config
  messages: [],            // historique de la conversation ({ role, content })
  conversationId: null,    // identifiant dans assistant-history.json
  run: null,               // { requestId, turn, segments, text }
  quote: null,             // { text, title, url }
  lastUserText: ''
};
let ccPanelWidth = parseInt(localStorage.getItem('ccPanelWidth') || '400', 10);
let ccRenderQueued = false;
let ccMcpNoticeAt = 0;

// ---------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------
function ccEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function ccShort(s, n = 60) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
const ccSleep = (ms) => new Promise(r => setTimeout(r, ms));
const ccClamp = (v, min, max, def) => {
  const n = Number.isFinite(+v) ? Math.round(+v) : def;
  return Math.min(max, Math.max(min, n));
};

async function ccCopy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

/** Markdown -> HTML (sûr : tout est échappé avant mise en forme). notes=true : format de l'éditeur de notes. */
function ccMarkdownToHtml(md, { notes = false } = {}) {
  const inline = (t) => {
    let s = ccEsc(t);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => `<a href="${url}" data-cc-link="${url}">${label}</a>`);
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, (m, pre, url) => `${pre}<a href="${url}" data-cc-link="${url}">${url}</a>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>');
    s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<i>$2</i>').replace(/(^|\W)_([^_\s][^_]*?)_(?=\W|$)/g, '$1<i>$2</i>');
    s = s.replace(/~~([^~]+)~~/g, notes ? '<strike>$1</strike>' : '<s>$1</s>');
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[+i]}</code>`);
    return s;
  };
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const para = notes ? 'div' : 'p';
  let list = null; // { tag, items }
  const flushList = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${i}</li>`).join('')}</${list.tag}>`); list = null; }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```/);
    if (fence) {
      flushList();
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${ccEsc(code.join('\n'))}</code></pre>`);
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushList();
      const level = m[1].length;
      const tag = notes ? (level === 1 ? 'h1' : 'h2') : `h${Math.min(6, level + 2)}`;
      out.push(`<${tag}>${inline(m[2])}</${tag}>`);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(inline(m[1]));
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(inline(m[1]));
    } else if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flushList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushList();
      out.push(notes ? '<div><br></div>' : '<hr>');
    } else if (!line.trim()) {
      flushList();
      if (notes && out.length) out.push('<div><br></div>');
    } else {
      flushList();
      out.push(`<${para}>${inline(line)}</${para}>`);
    }
  }
  flushList();
  if (notes) while (out.length && out[out.length - 1] === '<div><br></div>') out.pop();
  return out.join('');
}

/** HTML d'une note -> Markdown. */
function ccHtmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const inlineOf = (node) => {
    let s = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { s += n.textContent; return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      const inner = inlineOf(n);
      if (t === 'B' || t === 'STRONG') s += inner.trim() ? `**${inner}**` : inner;
      else if (t === 'I' || t === 'EM') s += inner.trim() ? `*${inner}*` : inner;
      else if (t === 'S' || t === 'STRIKE' || t === 'DEL') s += `~~${inner}~~`;
      else if (t === 'CODE') s += '`' + inner + '`';
      else if (t === 'A') s += n.getAttribute('href') ? `[${inner}](${n.getAttribute('href')})` : inner;
      else if (t === 'BR') s += '\n';
      else s += inner;
    });
    return s;
  };
  const wrapInline = (n) => { const w = doc.createElement('span'); w.appendChild(n.cloneNode(true)); return w; };
  const lines = [];
  const BLOCK = /^(DIV|P|H\d|UL|OL|LI|BLOCKQUOTE|PRE|HR)$/;
  const block = (node) => {
    // Les nœuds "en ligne" consécutifs (texte, gras, italique...) forment une seule ligne
    let buf = null;
    const flush = () => { if (buf !== null) { if (buf.trim()) lines.push(buf); buf = null; } };
    node.childNodes.forEach(n => {
      if (n.nodeType === 3 || (n.nodeType === 1 && !BLOCK.test(n.tagName) && n.tagName !== 'BR')) {
        buf = (buf || '') + (n.nodeType === 3 ? n.textContent : inlineOf(wrapInline(n)));
        return;
      }
      if (n.nodeType !== 1) return;
      flush();
      const t = n.tagName;
      if (t === 'H1') lines.push('# ' + inlineOf(n).trim());
      else if (t === 'H2') lines.push('## ' + inlineOf(n).trim());
      else if (/^H[3-6]$/.test(t)) lines.push('### ' + inlineOf(n).trim());
      else if (t === 'BLOCKQUOTE') inlineOf(n).split('\n').forEach(l => lines.push('> ' + l));
      else if (t === 'UL' || t === 'OL') {
        [...n.children].forEach((li, i) => lines.push((t === 'OL' ? `${i + 1}. ` : '- ') + inlineOf(li).trim()));
      } else if (t === 'PRE') lines.push('```\n' + n.textContent + '\n```');
      else if (t === 'DIV' || t === 'P') {
        const hasBlocks = [...n.children].some(c => /^(DIV|P|H\d|UL|OL|BLOCKQUOTE|PRE)$/.test(c.tagName));
        if (hasBlocks) block(n);
        else { const s = inlineOf(n); lines.push(s.trim() ? s : ''); }
      } else if (t === 'BR') { /* fin de ligne */ }
      else if (t === 'HR') lines.push('---');
    });
    flush();
  };
  block(doc.body);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------
// Outils : onglets et pages
// ---------------------------------------------------------------
function ccOk(text) { return { content: [{ type: 'text', text }] }; }

function ccGetTab(tabId) {
  const tab = tabId ? tabs.find(t => t.id === tabId) : tabs.find(t => t.id === activeTabId);
  if (!tab) throw new Error(tabId ? `Onglet introuvable : ${tabId}. Utilise list_tabs pour voir les onglets.` : 'Aucun onglet actif.');
  return tab;
}

function ccGetWebTab(tabId) {
  const tab = ccGetTab(tabId);
  if (!tab.webview) throw new Error(`L'onglet ${tab.id} (« ${tab.title} ») est une page interne de Zenith, sans contenu web.`);
  return tab;
}

function ccTabInfo(tab) {
  let url = tab.url || '';
  let title = tab.title || '';
  try {
    if (tab.webview) {
      url = tab.webview.getURL() || url;
      title = tab.webview.getTitle() || title;
    }
  } catch { /* webview pas encore prête */ }
  const home = isHomePage(url);
  const pile = tab.pileId && typeof piles !== 'undefined' ? piles.get(tab.pileId) : null;
  return {
    id: tab.id,
    title: home ? "Page d'accueil Zenith" : title,
    url: home ? 'zenith://home' : url,
    isHome: home,
    active: tab.id === activeTabId,
    pile: pile ? (pile.name || 'pile sans nom') : null
  };
}

function ccResolveUrl(input) {
  const s = String(input || '').trim();
  if (!s) throw new Error('URL vide.');
  if (/^zenith:\/\/(bookmarks|history)$/i.test(s)) return s.toLowerCase();
  if (/^zenith:\/\/home$/i.test(s)) return DEFAULT_PAGE;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^localhost:/i.test(s)) throw new Error(`Protocole non autorisé : ${s.split(':')[0]}`);
  if (isValidUrl(s)) return 'https://' + s;
  return SEARCH_ENGINES[currentSearchEngine].url + encodeURIComponent(s);
}

/** Exécute une fonction autonome dans la page (arguments sérialisés en JSON). */
function ccRun(webview, fn, ...args) {
  const code = `(${fn.toString()})(...${JSON.stringify(args)})`;
  return Promise.race([
    webview.executeJavaScript(code, false),
    new Promise((_, reject) => setTimeout(() => reject(new Error('La page ne répond pas.')), 15000))
  ]);
}

function ccWaitForLoad(webview, timeout = 20000) {
  return new Promise((resolve) => {
    let started = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer); clearTimeout(probe);
      webview.removeEventListener('did-start-loading', onStart);
      webview.removeEventListener('did-stop-loading', finish);
      webview.removeEventListener('did-fail-load', onFail);
      setTimeout(resolve, 150);
    };
    const onStart = () => { started = true; };
    const onFail = (e) => { if (e.errorCode !== -3) finish(); };
    const timer = setTimeout(finish, timeout);
    const probe = setTimeout(() => {
      try { if (!started && !webview.isLoading()) finish(); } catch { finish(); }
    }, 1500);
    webview.addEventListener('did-start-loading', onStart);
    webview.addEventListener('did-stop-loading', finish);
    webview.addEventListener('did-fail-load', onFail);
  });
}

/** Après un clic ou une saisie : laisse la page réagir, attend une éventuelle navigation. */
async function ccSettle(webview) {
  await ccSleep(600);
  try { if (webview.isLoading()) await ccWaitForLoad(webview, 15000); } catch {}
}

/** Signale visuellement l'onglet sur lequel Claude agit. */
function ccMarkActing(tab) {
  const el = tab && document.getElementById(tab.id);
  if (!el) return;
  el.classList.add('cc-acting');
  clearTimeout(el._ccActTimer);
  el._ccActTimer = setTimeout(() => el.classList.remove('cc-acting'), 2500);
}

function ccDescribeTab(info) {
  return `Onglet ${info.id} : « ${info.title || 'sans titre'} » — ${info.url}`;
}

// Fonctions exécutées DANS la page (doivent être autonomes)
function ccPageRead() {
  const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
  const text = (document.body ? document.body.innerText : '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title: document.title, url: location.href, description: meta ? meta.content : '', text };
}

function ccPageInteractive(filter, limit) {
  const sel = 'a[href], button, input:not([type="hidden"]), textarea, select, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="combobox"], [contenteditable=""], [contenteditable="true"], [onclick], [tabindex]:not([tabindex="-1"])';
  document.querySelectorAll('[data-zcc]').forEach(e => e.removeAttribute('data-zcc'));
  const f = (filter || '').toLowerCase();
  const out = [];
  let n = 0;
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('[aria-hidden="true"]') || el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
    const own = el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? '' : el.innerText;
    const assoc = el.labels && el.labels[0] ? el.labels[0].innerText : '';
    const label = (el.getAttribute('aria-label') || assoc || own || el.placeholder || (el.type !== 'password' && el.tagName !== 'SELECT' ? el.value : '') || el.title || el.alt || el.getAttribute('name') || '').trim().replace(/\s+/g, ' ').slice(0, 90);
    if (f && !label.toLowerCase().includes(f)) continue;
    n++;
    el.setAttribute('data-zcc', String(n));
    const item = { ref: n, tag: el.tagName.toLowerCase(), label };
    const type = el.getAttribute('type') || el.getAttribute('role');
    if (type) item.type = type;
    if (el.tagName === 'A' && el.href) item.href = String(el.href).slice(0, 140);
    if (el.tagName === 'SELECT') item.value = el.options[el.selectedIndex]?.text || '';
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'password' && el.value) item.value = el.value.slice(0, 60);
    if (el.type === 'checkbox' || el.type === 'radio') item.checked = el.checked;
    item.visible = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

const CC_TOOL_HANDLERS = {
  list_tabs() {
    if (!tabs.length) return ccOk('Aucun onglet ouvert.');
    return ccOk(tabs.map(t => {
      const i = ccTabInfo(t);
      return `${i.active ? '▶ ' : '  '}${i.id} — ${i.title || '(sans titre)'}\n    ${i.url}${i.pile ? `\n    pile : ${i.pile}` : ''}`;
    }).join('\n'));
  },

  async open_tab({ url, background }) {
    const target = ccResolveUrl(url);
    const before = tabCounter;
    createNewTab(target, { background: !!background });
    const tab = tabs.find(t => t.id === `tab-${tabCounter}`);
    if (!tab || tabCounter === before || !tab.webview) return ccOk(`Page ouverte : ${target}`);
    ccMarkActing(tab);
    await ccWaitForLoad(tab.webview);
    return ccOk(`${ccDescribeTab(ccTabInfo(tab))}${background ? ' (ouvert en arrière-plan)' : ''}`);
  },

  switch_tab({ tab_id }) {
    const tab = ccGetTab(tab_id);
    switchToTab(tab.id);
    return ccOk(`Onglet affiché. ${ccDescribeTab(ccTabInfo(tab))}`);
  },

  close_tab({ tab_id }) {
    const tab = ccGetTab(tab_id);
    const info = ccTabInfo(tab);
    if (tabs.length <= 1) createNewTab(); // ne pas fermer la fenêtre avec le dernier onglet
    closeTab(tab.id);
    return ccOk(`Onglet fermé : « ${info.title} ».`);
  },

  async navigate({ url, tab_id }) {
    const target = ccResolveUrl(url);
    if (target.startsWith('zenith://')) { createNewTab(target); return ccOk(`Page ouverte : ${target}`); }
    const tab = ccGetWebTab(tab_id);
    tab.isNewTab = false;
    tab.url = target;
    tab.webview.src = target;
    if (tab.id === activeTabId) document.getElementById('url-bar').value = target;
    ccMarkActing(tab);
    await ccWaitForLoad(tab.webview);
    return ccOk(ccDescribeTab(ccTabInfo(tab)));
  },

  async history_navigation({ action, tab_id }) {
    const tab = ccGetWebTab(tab_id);
    const wv = tab.webview;
    if (action === 'back') { if (!wv.canGoBack()) throw new Error("Pas de page précédente dans cet onglet."); wv.goBack(); }
    else if (action === 'forward') { if (!wv.canGoForward()) throw new Error('Pas de page suivante dans cet onglet.'); wv.goForward(); }
    else if (action === 'reload') wv.reload();
    else throw new Error('Action inconnue (back, forward ou reload).');
    ccMarkActing(tab);
    await ccWaitForLoad(wv);
    return ccOk(ccDescribeTab(ccTabInfo(tab)));
  },

  async read_page({ tab_id, max_chars, offset }) {
    const tab = ccGetWebTab(tab_id);
    const page = await ccRun(tab.webview, ccPageRead);
    const max = ccClamp(max_chars, 500, 60000, 15000);
    const start = ccClamp(offset, 0, Math.max(0, page.text.length), 0);
    const chunk = page.text.slice(start, start + max);
    const end = start + chunk.length;
    const info = ccTabInfo(tab);
    const head = [
      `Titre : ${page.title || '(sans titre)'}`,
      `URL : ${info.isHome ? 'zenith://home' : page.url}`,
      page.description ? `Description : ${page.description}` : null,
      `Texte (caractères ${start}–${end} sur ${page.text.length}) :`
    ].filter(Boolean).join('\n');
    const more = end < page.text.length ? `\n\n[… suite disponible : read_page avec offset=${end}]` : '';
    return ccOk(`${head}\n\n${chunk || '(aucun texte visible)'}${more}`);
  },

  async get_selection({ tab_id }) {
    const tab = ccGetWebTab(tab_id);
    const text = await ccRun(tab.webview, () => String(window.getSelection() || ''));
    return ccOk(text.trim() ? text : 'Aucun texte sélectionné dans la page.');
  },

  async find_in_page({ query, tab_id }) {
    const q = String(query || '').trim();
    if (!q) throw new Error('Texte à chercher vide.');
    const tab = ccGetWebTab(tab_id);
    const hits = await ccRun(tab.webview, (q) => {
      const text = document.body ? document.body.innerText : '';
      const lower = text.toLowerCase();
      const needle = q.toLowerCase();
      const res = [];
      let i = lower.indexOf(needle);
      let count = 0;
      while (i !== -1) {
        count++;
        if (res.length < 15) res.push(text.slice(Math.max(0, i - 120), i + needle.length + 120).replace(/\s+/g, ' ').trim());
        i = lower.indexOf(needle, i + needle.length);
      }
      return { count, res };
    }, q);
    if (!hits.count) return ccOk(`« ${q} » n'apparaît pas dans la page.`);
    return ccOk(`${hits.count} occurrence(s) de « ${q} »${hits.count > hits.res.length ? ` (${hits.res.length} premières)` : ''} :\n` + hits.res.map((s, i) => `${i + 1}. …${s}…`).join('\n'));
  },

  async get_interactive_elements({ filter, tab_id }) {
    const tab = ccGetWebTab(tab_id);
    const items = await ccRun(tab.webview, ccPageInteractive, filter || '', 150);
    if (!items.length) return ccOk(filter ? `Aucun élément interactif ne contient « ${filter} ».` : 'Aucun élément interactif visible.');
    const lines = items.map(e => {
      let s = `[${e.ref}] ${e.tag}${e.type ? `(${e.type})` : ''} « ${e.label || '—'} »`;
      if (e.value) s += ` valeur=« ${e.value} »`;
      if (e.checked !== undefined) s += e.checked ? ' [coché]' : ' [non coché]';
      if (e.href) s += ` → ${e.href}`;
      if (!e.visible) s += ' (hors écran)';
      return s;
    });
    return ccOk(`${items.length} élément(s) — refs valables jusqu'au prochain changement de page :\n${lines.join('\n')}`);
  },

  async click_element({ ref, tab_id }) {
    const tab = ccGetWebTab(tab_id);
    const wv = tab.webview;
    ccMarkActing(tab);
    const info = await ccRun(wv, (ref) => {
      const el = document.querySelector(`[data-zcc="${ref}"]`);
      if (!el) return { ok: false };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, label, tag: el.tagName.toLowerCase() };
    }, ref);
    if (!info.ok) throw new Error(`Élément ${ref} introuvable : la page a peut-être changé. Relance get_interactive_elements.`);
    if (tab.id === activeTabId) {
      // Vrai clic souris (événements "de confiance"), aux coordonnées de l'élément
      await ccSleep(120);
      const zoom = (() => { try { return wv.getZoomFactor() || 1; } catch { return 1; } })();
      const x = Math.round(info.x * zoom), y = Math.round(info.y * zoom);
      wv.sendInputEvent({ type: 'mouseMove', x, y });
      wv.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wv.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    } else {
      await ccRun(wv, (ref) => { document.querySelector(`[data-zcc="${ref}"]`)?.click(); }, ref);
    }
    await ccSettle(wv);
    return ccOk(`Clic sur [${ref}] ${info.tag} « ${info.label || '—'} ». ${ccDescribeTab(ccTabInfo(tab))}`);
  },

  async fill_input({ ref, value, submit, tab_id }) {
    const tab = ccGetWebTab(tab_id);
    const wv = tab.webview;
    const text = String(value ?? '');
    ccMarkActing(tab);
    const info = await ccRun(wv, (ref) => {
      const el = document.querySelector(`[data-zcc="${ref}"]`);
      if (!el) return { ok: false };
      if (el.type === 'password') return { ok: false, password: true };
      el.scrollIntoView({ block: 'center' });
      el.focus();
      if (el.tagName === 'SELECT') return { ok: true, select: true, options: [...el.options].map(o => o.text) };
      if (el.isContentEditable) {
        const r = document.createRange(); r.selectNodeContents(el);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      } else if (typeof el.select === 'function') el.select();
      return { ok: true, label: el.getAttribute('aria-label') || el.placeholder || el.getAttribute('name') || el.tagName.toLowerCase() };
    }, ref);
    if (info.password) throw new Error('Claude Connect ne remplit jamais les champs de mot de passe : laisse l’utilisateur le faire.');
    if (!info.ok) throw new Error(`Élément ${ref} introuvable : la page a peut-être changé. Relance get_interactive_elements.`);

    if (info.select) {
      const chosen = await ccRun(wv, (ref, v) => {
        const el = document.querySelector(`[data-zcc="${ref}"]`);
        const low = v.toLowerCase();
        const opt = [...el.options].find(o => o.text.trim().toLowerCase() === low || o.value.toLowerCase() === low)
          || [...el.options].find(o => o.text.toLowerCase().includes(low));
        if (!opt) return null;
        el.value = opt.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return opt.text;
      }, ref, text);
      if (chosen === null) throw new Error(`Option « ${text} » introuvable. Options : ${info.options.slice(0, 30).join(' | ')}`);
      return ccOk(`Option « ${chosen} » choisie dans [${ref}].`);
    }

    const setNative = () => ccRun(wv, (ref, v) => {
      const el = document.querySelector(`[data-zcc="${ref}"]`);
      if (!el) return false;
      if (el.isContentEditable) { el.textContent = v; }
      else {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, ref, text);

    if (tab.id === activeTabId && text) {
      wv.insertText(text); // saisie "réelle" dans le champ sélectionné
      await ccSleep(150);
      const current = await ccRun(wv, (ref) => {
        const el = document.querySelector(`[data-zcc="${ref}"]`);
        return el ? (el.isContentEditable ? el.innerText : el.value) : null;
      }, ref);
      if (current !== null && current.trim() !== text.trim()) await setNative();
    } else {
      await setNative();
    }

    if (submit) {
      if (tab.id === activeTabId) {
        wv.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
        wv.sendInputEvent({ type: 'char', keyCode: '\r' });
        wv.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      } else {
        await ccRun(wv, (ref) => {
          const el = document.querySelector(`[data-zcc="${ref}"]`);
          const form = el && el.form;
          if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); }
        }, ref);
      }
      await ccSettle(wv);
    }
    return ccOk(`Champ [${ref}] « ${info.label} » rempli${submit ? ' et validé' : ''}. ${ccDescribeTab(ccTabInfo(tab))}`);
  },

  async scroll_page({ direction, tab_id }) {
    const tab = ccGetWebTab(tab_id);
    ccMarkActing(tab);
    const pos = await ccRun(tab.webview, (dir) => {
      const el = document.scrollingElement || document.documentElement;
      if (dir === 'top') el.scrollTo({ top: 0 });
      else if (dir === 'bottom') el.scrollTo({ top: el.scrollHeight });
      else el.scrollBy({ top: (dir === 'up' ? -1 : 1) * innerHeight * 0.85 });
      return new Promise(r => setTimeout(() => r({ y: Math.round(el.scrollTop), max: Math.round(el.scrollHeight - innerHeight) }), 250));
    }, direction);
    return ccOk(`Position : ${pos.y} / ${Math.max(0, pos.max)} px.`);
  },

  async screenshot({ tab_id }) {
    const tab = ccGetWebTab(tab_id);
    const img = await tab.webview.capturePage();
    if (!img || img.isEmpty()) throw new Error(tab.id === activeTabId ? 'Capture vide.' : "Capture vide : l'onglet doit être affiché (utilise switch_tab).");
    const size = img.getSize();
    const out = size.width > 1280 ? img.resize({ width: 1280, quality: 'good' }) : img;
    const outSize = out.getSize();
    const data = out.toDataURL().split(',')[1];
    return {
      content: [
        { type: 'image', data, mimeType: 'image/png' },
        { type: 'text', text: `Capture de l'onglet ${tab.id} (${outSize.width}×${outSize.height}).` }
      ]
    };
  },

  async search_history({ query, limit }) {
    const list = (await window.zenithAPI.searchHistory(String(query || ''))) || [];
    const n = ccClamp(limit, 1, 100, 20);
    if (!list.length) return ccOk(`Rien dans l'historique pour « ${query} ».`);
    const fmt = (ts) => { try { return new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
    return ccOk(list.slice(0, n).map(h => `- ${h.title || '(sans titre)'} — ${h.url}${h.timestamp ? ` (${fmt(h.timestamp)})` : ''}`).join('\n'));
  },

  list_bookmarks({ query }) {
    if (!bookmarksData) throw new Error('Signets non chargés.');
    const q = String(query || '').toLowerCase();
    const out = [];
    bmWalk((node, parent, path) => {
      if (node.type !== 'url') return;
      if (q && !(`${node.title} ${node.url}`.toLowerCase().includes(q))) return;
      const folder = path.map(bmFolderTitle).join(' › ');
      out.push(`- ${node.title || node.url} — ${node.url}${folder ? ` [${folder}]` : ''}`);
      if (out.length >= 300) return false;
    });
    return ccOk(out.length ? out.join('\n') : (q ? `Aucun signet pour « ${query} ».` : 'Aucun signet.'));
  },

  add_bookmark({ url, title }) {
    if (!bookmarksData) throw new Error('Signets non chargés.');
    let target = url ? ccResolveUrl(url) : null;
    let name = title;
    if (!target) {
      const info = ccTabInfo(ccGetTab());
      target = info.url;
      name = name || info.title;
    }
    if (!bmIsBookmarkableUrl(target)) throw new Error('Cette page ne peut pas être ajoutée aux signets.');
    if (bmFindByUrl(target)) return ccOk(`Déjà dans les signets : ${target}`);
    bmAdd('bar', bmNewUrl(name || target, target));
    return ccOk(`Signet ajouté dans la barre de signets : « ${name || target} ».`);
  },

  // ----- Notes (base IndexedDB partagée avec la page d'accueil) -----
  async list_notes() {
    const { folders, files } = await ccNotesAll();
    const fmt = (ts) => { try { return new Date(ts).toLocaleDateString('fr-FR'); } catch { return ''; } };
    const lines = [];
    const walk = (parentId, depth) => {
      const pad = '   '.repeat(depth);
      folders.filter(f => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name)).forEach(f => {
        lines.push(`${pad}📁 ${f.name} (id ${f.id})`);
        walk(f.id, depth + 1);
      });
      files.filter(f => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name)).forEach(f => {
        lines.push(`${pad}📄 ${f.name} — modifiée le ${fmt(f.lastModified)} (id ${f.id})`);
      });
    };
    walk('root', 0);
    return ccOk(lines.length ? lines.join('\n') : 'Aucune note pour le moment.');
  },

  async read_note({ note_id }) {
    const file = await ccNotesGet('files', note_id);
    if (!file) throw new Error(`Note introuvable : ${note_id}. Utilise list_notes.`);
    const md = ccHtmlToMarkdown(file.content);
    return ccOk(`Note « ${file.name} » (id ${file.id})\n\n${md || '(note vide)'}`);
  },

  async create_note({ title, content, folder_id }) {
    const name = String(title || '').trim() || 'Nouvelle note';
    const parentId = folder_id || 'root';
    if (parentId !== 'root' && !(await ccNotesGet('folders', parentId))) throw new Error(`Dossier introuvable : ${parentId}.`);
    const file = { id: 'file_' + Date.now(), parentId, name, content: ccMarkdownToHtml(content, { notes: true }), lastModified: Date.now() };
    await ccNotesPut('files', file);
    ccNotesBroadcast(file.id);
    return ccOk(`Note « ${name} » créée (id ${file.id}). Elle est visible dans Zenith : page d'accueil > Notes.`);
  },

  async update_note({ note_id, content, mode, title }) {
    const file = await ccNotesGet('files', note_id);
    if (!file) throw new Error(`Note introuvable : ${note_id}. Utilise list_notes.`);
    if (typeof content === 'string' && content.trim()) {
      const html = ccMarkdownToHtml(content, { notes: true });
      file.content = mode === 'replace' ? html : (file.content ? file.content + '<div><br></div>' : '') + html;
    }
    if (title && String(title).trim()) file.name = String(title).trim();
    file.lastModified = Date.now();
    await ccNotesPut('files', file);
    ccNotesBroadcast(file.id);
    return ccOk(`Note « ${file.name} » mise à jour (${mode === 'replace' ? 'contenu remplacé' : 'texte ajouté à la fin'}).`);
  }
};

// ---------- Base des notes ----------
let ccNotesDb = null;
function ccNotesOpen() {
  if (ccNotesDb) return Promise.resolve(ccNotesDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ZenithNotesDB', 1);
    req.onupgradeneeded = (e) => {
      // Même schéma que la page d'accueil (js/notes.js)
      const db = e.target.result;
      if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders', { keyPath: 'id' }).createIndex('parentId', 'parentId', { unique: false });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' }).createIndex('parentId', 'parentId', { unique: false });
      e.target.transaction.objectStore('folders').put({ id: 'root', parentId: null, name: 'Root' });
    };
    req.onsuccess = (e) => {
      ccNotesDb = e.target.result;
      ccNotesDb.onversionchange = () => { ccNotesDb.close(); ccNotesDb = null; };
      resolve(ccNotesDb);
    };
    req.onerror = () => reject(new Error('Base des notes inaccessible.'));
    req.onblocked = () => reject(new Error('Base des notes occupée, réessaie.'));
  });
}
async function ccNotesTx(store, mode, fn) {
  const db = await ccNotesOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([store], mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(new Error('Erreur de la base des notes.'));
  });
}
const ccNotesGet = (store, id) => ccNotesTx(store, 'readonly', s => s.get(String(id || '')));
const ccNotesPut = (store, obj) => ccNotesTx(store, 'readwrite', s => s.put(obj));
async function ccNotesAll() {
  const [folders, files] = await Promise.all([
    ccNotesTx('folders', 'readonly', s => s.getAll()),
    ccNotesTx('files', 'readonly', s => s.getAll())
  ]);
  return { folders: folders || [], files: files || [] };
}
function ccNotesBroadcast(id) {
  try { new BroadcastChannel('zenith-notes').postMessage({ type: 'changed', id, source: 'claude' }); } catch {}
}

// ---------- Point d'entrée des appels d'outils ----------
async function ccHandleToolRequest({ callId, name, input, origin }) {
  let result;
  try {
    const fn = CC_TOOL_HANDLERS[name];
    if (!fn) throw new Error(`Outil inconnu : ${name}`);
    if (origin === 'mcp') ccShowMcpActivity(name, input || {});
    result = await fn(input || {});
  } catch (e) {
    result = { content: [{ type: 'text', text: e.message || String(e) }], isError: true };
  }
  window.zenithAPI.ccSendToolResult(callId, result);
}

function ccShowMcpActivity(name, input) {
  const btn = document.getElementById('assistant-btn');
  if (btn) {
    btn.classList.add('cc-busy');
    clearTimeout(btn._ccBusy);
    btn._ccBusy = setTimeout(() => btn.classList.remove('cc-busy'), 2000);
  }
  if (Date.now() - ccMcpNoticeAt > 5 * 60 * 1000) {
    ccMcpNoticeAt = Date.now();
    showNotification('Claude Connect : Claude utilise Zenith (' + ccEsc((CC_TOOL_LABELS[name] || (() => name))(input)) + ')');
  }
}

// ---------------------------------------------------------------
// Panneau assistant
// ---------------------------------------------------------------
async function initializeClaudeConnect() {
  window.zenithAPI.onCcToolRequest(ccHandleToolRequest);
  window.zenithAPI.onCcEvent(ccHandleEvent);
  window.zenithAPI.onCcState((s) => { ccState.settings = s; ccRefreshPanel(); });
  ccBuildPanel();

  document.getElementById('assistant-btn')?.addEventListener('click', () => ccTogglePanel());
  document.getElementById('cc-open-assistant')?.addEventListener('click', () => { closeSettingsMenu(); ccTogglePanel(true); });
  document.getElementById('cc-open-config')?.addEventListener('click', () => { closeSettingsMenu(); ccTogglePanel(true); ccShowView('config'); });

  try { ccState.settings = await window.zenithAPI.ccGetSettings(); } catch (e) { console.error('Claude Connect :', e); }
  ccRefreshPanel();
  if (localStorage.getItem('ccPanelOpen') === 'true') ccTogglePanel(true, false);
}

function ccBuildPanel() {
  const panel = document.createElement('aside');
  panel.id = 'cc-panel';
  panel.setAttribute('aria-label', 'Claude Connect');
  panel.style.width = ccClamp(ccPanelWidth, 320, 720, 400) + 'px';
  panel.innerHTML = `
    <div class="cc-resizer" title="Redimensionner"></div>
    <div class="cc-header">
      <div class="cc-title"><span class="cc-logo">${CC_ICONS.spark}</span><span>Claude Connect</span></div>
      <div class="cc-head-actions">
        <button class="cc-icon-btn" data-cc="back" title="Retour à la conversation">${CC_ICONS.back}</button>
        <button class="cc-icon-btn" data-cc="new" title="Nouvelle conversation">${CC_ICONS.plus}</button>
        <button class="cc-icon-btn" data-cc="config" title="Réglages de Claude Connect">${CC_ICONS.gear}</button>
        <button class="cc-icon-btn" data-cc="close" title="Fermer (Ctrl+Shift+A)">${CC_ICONS.close}</button>
      </div>
    </div>
    <div class="cc-body">
      <div class="cc-messages"></div>
      <div class="cc-config"></div>
    </div>
    <div class="cc-composer">
      <div class="cc-context" title="Onglet actif : Claude peut le lire si tu lui en parles">
        <span class="cc-context-icon">${CC_ICONS.globe}</span><span class="cc-context-title"></span>
      </div>
      <div class="cc-quote hidden">
        <div class="cc-quote-text"></div>
        <button class="cc-icon-btn cc-quote-close" title="Retirer l'extrait">${CC_ICONS.close}</button>
      </div>
      <div class="cc-input-row">
        <textarea class="cc-input" rows="1" placeholder="Demande à Claude…"></textarea>
        <button class="cc-send" title="Envoyer (Entrée)">${CC_ICONS.send}</button>
      </div>
      <div class="cc-composer-foot">
        <select class="cc-model-quick" title="Modèle utilisé pour les prochaines réponses"></select>
        <div class="cc-hint">Claude peut se tromper : vérifie les informations importantes.</div>
      </div>
    </div>`;
  document.getElementById('main-content').appendChild(panel);

  panel.querySelector('[data-cc="close"]').addEventListener('click', () => ccTogglePanel(false));
  panel.querySelector('[data-cc="new"]').addEventListener('click', ccNewConversation);
  panel.querySelector('[data-cc="config"]').addEventListener('click', () => ccShowView(ccState.view === 'config' ? 'chat' : 'config'));
  panel.querySelector('[data-cc="back"]').addEventListener('click', () => ccShowView('chat'));
  panel.querySelector('.cc-quote-close').addEventListener('click', () => ccSetQuote(null));

  const input = panel.querySelector('.cc-input');
  input.addEventListener('input', () => ccAutosize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ccSubmit(); }
    if (e.key === 'Escape' && ccState.run) { e.preventDefault(); ccCancel(); }
  });
  panel.querySelector('.cc-send').addEventListener('click', () => (ccState.run ? ccCancel() : ccSubmit()));
  panel.querySelector('.cc-model-quick').addEventListener('change', async (e) => {
    ccState.settings = await window.zenithAPI.ccSetSettings({ model: e.target.value });
    ccRefreshPanel();
  });

  // Liens dans les réponses : ouverts dans un nouvel onglet
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-cc-link]');
    if (!a) return;
    e.preventDefault();
    const url = a.getAttribute('data-cc-link');
    if (/^https?:\/\//i.test(url)) createNewTab(url, { openerId: activeTabId });
  });

  // Redimensionnement par le bord gauche
  const resizer = panel.querySelector('.cc-resizer');
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.body.classList.add('resizing', 'cc-resizing');
    const onMove = (ev) => {
      const rect = document.getElementById('main-content').getBoundingClientRect();
      ccPanelWidth = ccClamp(rect.right - ev.clientX, 320, Math.min(720, rect.width - 320), 400);
      panel.style.width = ccPanelWidth + 'px';
      ccSyncDevTools();
    };
    const onUp = () => {
      document.body.classList.remove('resizing', 'cc-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      localStorage.setItem('ccPanelWidth', String(ccPanelWidth));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  ccRenderMessages();
  ccUpdateContext();
}

function ccPanel() { return document.getElementById('cc-panel'); }

function ccSyncDevTools() {
  if (typeof devToolsOpen !== 'undefined' && devToolsOpen) window.zenithAPI.resizeDevToolsPanel(getDevToolsBounds());
}

function ccTogglePanel(force, focus = true) {
  const panel = ccPanel();
  if (!panel) return;
  const open = typeof force === 'boolean' ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  document.getElementById('assistant-btn')?.classList.toggle('active', open);
  localStorage.setItem('ccPanelOpen', String(open));
  requestAnimationFrame(ccSyncDevTools);
  if (open) {
    ccUpdateContext();
    if (focus) setTimeout(() => panel.querySelector('.cc-input')?.focus(), 50);
  }
}

function ccShowView(view) {
  ccState.view = view;
  ccRefreshPanel();
}

function ccRefreshPanel() {
  const panel = ccPanel();
  if (!panel) return;
  const hasKey = !!ccState.settings?.hasKey;
  const config = ccState.view === 'config';
  panel.classList.toggle('cc-view-config', config);
  panel.classList.toggle('cc-no-key', !hasKey);
  ccRenderModelQuick();
  if (config) ccRenderConfig();
  else ccRenderMessages();
}

/** Sélecteur de modèle compact sous la zone de saisie (même réglage que dans les Réglages). */
function ccRenderModelQuick() {
  const select = ccPanel()?.querySelector('.cc-model-quick');
  if (!select) return;
  const s = ccState.settings || {};
  const models = s.models || [];
  select.hidden = !models.length;
  select.innerHTML = models.map(m => {
    const short = m.id === 'default' ? 'Par défaut' : m.label.split(' — ')[0];
    return `<option value="${ccEsc(m.id)}" ${m.id === s.model ? 'selected' : ''} title="${ccEsc(m.label)}">${ccEsc(short)}</option>`;
  }).join('');
}

function ccAutosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  ta.style.overflowY = ta.scrollHeight > 180 ? 'auto' : 'hidden';
}

function ccUpdateContext() {
  const el = ccPanel()?.querySelector('.cc-context-title');
  if (!el) return;
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) { el.textContent = 'Aucun onglet'; return; }
  const info = ccTabInfo(tab);
  el.textContent = info.title || info.url || 'Nouvel onglet';
}

function ccContext() {
  const tab = tabs.find(t => t.id === activeTabId);
  const info = tab ? ccTabInfo(tab) : null;
  return {
    activeTab: info ? { id: info.id, title: info.title, url: info.url, isHome: info.isHome } : null,
    tabCount: tabs.length
  };
}

function ccSetQuote(quote) {
  ccState.quote = quote && quote.text && quote.text.trim() ? { ...quote, text: quote.text.trim().slice(0, 4000) } : null;
  const box = ccPanel()?.querySelector('.cc-quote');
  if (!box) return;
  box.classList.toggle('hidden', !ccState.quote);
  box.querySelector('.cc-quote-text').textContent = ccState.quote ? ccShort(ccState.quote.text, 280) : '';
}

/** Menu contextuel : « Demander à Claude » sur une sélection. */
function ccAskAboutSelection(text, webview) {
  const tab = tabs.find(t => t.webview === webview) || tabs.find(t => t.id === activeTabId);
  const info = tab ? ccTabInfo(tab) : { title: '', url: '' };
  ccTogglePanel(true);
  ccShowView('chat');
  ccSetQuote({ text, title: info.title, url: info.url });
}

function ccAskAboutPage(prompt) {
  ccTogglePanel(true);
  ccShowView('chat');
  ccSend(prompt);
}

function ccNewConversation() {
  if (ccState.run) ccCancel();
  ccState.messages = [];
  ccState.conversationId = null;
  ccState.run = null;
  ccSetQuote(null);
  ccShowView('chat');
  ccPanel()?.querySelector('.cc-input')?.focus();
}

// ---------- Rendu de la conversation ----------
function ccRenderMessages() {
  const panel = ccPanel();
  if (!panel) return;
  const box = panel.querySelector('.cc-messages');
  if (!ccState.settings?.hasKey) { ccRenderSetup(box); ccUpdateComposer(); return; }
  if (!box.querySelector('.cc-turn') && !ccState.messages.length) {
    box.innerHTML = `
      <div class="cc-empty">
        <div class="cc-empty-logo">${CC_ICONS.spark}</div>
        <div class="cc-empty-title">Comment puis-je t'aider ?</div>
        <div class="cc-empty-sub">Je peux lire cette page, chercher sur le web, agir dans tes onglets et écrire dans tes notes Zenith.</div>
        <div class="cc-suggestions">${CC_SUGGESTIONS.map(s => `<button class="cc-chip">${ccEsc(s)}</button>`).join('')}</div>
      </div>`;
    box.querySelectorAll('.cc-chip').forEach(b => b.addEventListener('click', () => ccSend(b.textContent)));
  }
  ccUpdateComposer();
}

const CC_CLI_DOCS = 'https://claude.com/claude-code';

function ccRenderSetup(box) {
  const err = ccState.settings?.cli?.error;
  box.innerHTML = `
    <div class="cc-setup">
      <div class="cc-empty-logo">${CC_ICONS.spark}</div>
      <div class="cc-empty-title">Connecte Claude à Zenith</div>
      <p>L'assistant utilise <b>Claude Code</b> avec ton abonnement Claude (Pro ou Max). Chaque question consomme une partie de ton abonnement.</p>
      <ol class="cc-small cc-steps">
        <li>Installe Claude Code (<a href="${CC_CLI_DOCS}" data-cc-link="${CC_CLI_DOCS}">guide d'installation</a>).</li>
        <li>Dans un terminal, lance <code>claude</code> puis connecte-toi avec <code>/login</code>.</li>
        <li>Clique sur « Rechercher Claude Code ».</li>
      </ol>
      <button class="cc-primary cc-cli-detect">Rechercher Claude Code</button>
      <div class="cc-setup-msg ${err ? 'error' : ''}">${err ? ccEsc(err) : ''}</div>
      <p class="cc-small">Installé ailleurs ? Indique le chemin dans les <a href="#" class="cc-open-config">Réglages</a>.</p>
    </div>`;
  const msg = box.querySelector('.cc-setup-msg');
  box.querySelector('.cc-cli-detect').addEventListener('click', async () => {
    msg.className = 'cc-setup-msg'; msg.textContent = 'Recherche…';
    ccState.settings = await window.zenithAPI.ccCheckCli();
    ccRefreshPanel();
    if (ccState.settings?.ready) ccPanel()?.querySelector('.cc-input')?.focus();
  });
  box.querySelector('.cc-open-config').addEventListener('click', (e) => { e.preventDefault(); ccShowView('config'); });
}

function ccUpdateComposer() {
  const panel = ccPanel();
  if (!panel) return;
  const send = panel.querySelector('.cc-send');
  const running = !!ccState.run;
  send.classList.toggle('stop', running);
  send.innerHTML = running ? CC_ICONS.stop : CC_ICONS.send;
  send.title = running ? 'Arrêter (Échap)' : 'Envoyer (Entrée)';
  panel.querySelector('.cc-input').disabled = !ccState.settings?.hasKey;
}

function ccScrollToBottom(force = false) {
  const box = ccPanel()?.querySelector('.cc-messages');
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (force || nearBottom) box.scrollTop = box.scrollHeight;
}

function ccSubmit() {
  const input = ccPanel()?.querySelector('.cc-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  ccAutosize(input);
  ccSend(text);
}

function ccSend(text) {
  if (ccState.run || !text.trim()) return;
  if (!ccState.settings?.hasKey) { ccShowView('chat'); return; }
  const box = ccPanel().querySelector('.cc-messages');
  box.querySelector('.cc-empty')?.remove();

  const quote = ccState.quote;
  let content = text;
  if (quote) {
    content = `Extrait sélectionné dans la page « ${quote.title} » (${quote.url}) :\n"""\n${quote.text}\n"""\n\n${text}`;
  }
  ccSetQuote(null);
  ccState.lastUserText = text;

  const turn = document.createElement('div');
  turn.className = 'cc-turn';
  turn.innerHTML = `
    <div class="cc-msg user">
      ${quote ? `<div class="cc-msg-quote">${ccEsc(ccShort(quote.text, 300))}</div>` : ''}
      <div class="cc-msg-text">${ccEsc(text).replace(/\n/g, '<br>')}</div>
    </div>
    <div class="cc-msg assistant"><div class="cc-segments"></div><div class="cc-thinking"><span></span><span></span><span></span></div></div>`;
  box.appendChild(turn);
  ccScrollToBottom(true);

  const requestId = 'cc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const pending = [...ccState.messages, { role: 'user', content }];
  if (!ccState.conversationId) ccState.conversationId = 'conv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  ccState.run = { requestId, turn, segments: [], pending, retry: { text, quote } };
  ccUpdateComposer();
  window.zenithAPI.ccChat({ requestId, messages: pending, context: ccContext(), conversationId: ccState.conversationId });
}

function ccCancel() {
  if (ccState.run) window.zenithAPI.ccCancel(ccState.run.requestId);
}

function ccLastSegment(type) {
  const run = ccState.run;
  const last = run.segments[run.segments.length - 1];
  if (last && last.type === type) return last;
  const el = document.createElement('div');
  el.className = type === 'text' ? 'cc-text' : 'cc-tools';
  run.turn.querySelector('.cc-segments').appendChild(el);
  const seg = { type, el, raw: '', tools: new Map() };
  run.segments.push(seg);
  return seg;
}

function ccQueueTextRender() {
  if (ccRenderQueued) return;
  ccRenderQueued = true;
  requestAnimationFrame(() => {
    ccRenderQueued = false;
    const run = ccState.run;
    if (!run) return;
    run.segments.filter(s => s.type === 'text' && s.dirty).forEach(s => {
      s.el.innerHTML = ccMarkdownToHtml(s.raw);
      s.dirty = false;
    });
    ccScrollToBottom();
  });
}

function ccHandleEvent(ev) {
  const run = ccState.run;
  if (!run || ev.requestId !== run.requestId) return;
  const thinking = run.turn.querySelector('.cc-thinking');

  switch (ev.type) {
    case 'step':
      thinking?.classList.add('show');
      break;
    case 'text': {
      thinking?.classList.remove('show');
      const seg = ccLastSegment('text');
      seg.raw += ev.delta;
      seg.dirty = true;
      ccQueueTextRender();
      break;
    }
    case 'tool_start': {
      thinking?.classList.remove('show');
      const seg = ccLastSegment('tools');
      const row = document.createElement('div');
      row.className = 'cc-tool running';
      const label = (CC_TOOL_LABELS[ev.name] || (() => ev.name))(ev.input || {});
      row.innerHTML = `<span class="cc-tool-icon"><span class="cc-spinner"></span></span><span class="cc-tool-label">${ccEsc(label)}</span>`;
      seg.el.appendChild(row);
      seg.tools.set(ev.id, row);
      ccScrollToBottom();
      break;
    }
    case 'tool_end': {
      const row = run.segments.map(s => s.tools?.get(ev.id)).find(Boolean);
      if (row) {
        row.classList.remove('running');
        row.classList.toggle('error', !!ev.isError);
        row.querySelector('.cc-tool-icon').innerHTML = ev.isError ? CC_ICONS.alert : CC_ICONS.check;
        if (ev.summary) row.title = ev.summary;
        if (ev.isError && ev.summary) {
          const d = document.createElement('div');
          d.className = 'cc-tool-detail';
          d.textContent = ev.summary;
          row.appendChild(d);
        }
      }
      thinking?.classList.add('show');
      break;
    }
    case 'done': {
      thinking?.remove();
      run.segments.filter(s => s.type === 'text').forEach(s => { s.el.innerHTML = ccMarkdownToHtml(s.raw); });
      ccState.messages = Array.isArray(ev.messages) ? ev.messages : run.pending;
      const assistant = run.turn.querySelector('.cc-msg.assistant');
      const note = { cancelled: 'Réponse interrompue.', max_tokens: 'Réponse tronquée (longueur maximale atteinte).', max_steps: "Arrêté : trop d'étapes d'affilée." }[ev.stopReason];
      if (note) assistant.insertAdjacentHTML('beforeend', `<div class="cc-note">${note}</div>`);
      const fullText = run.segments.filter(s => s.type === 'text').map(s => s.raw).join('\n\n').trim();
      if (fullText) {
        const actions = document.createElement('div');
        actions.className = 'cc-msg-actions';
        actions.innerHTML = `<button class="cc-icon-btn" title="Copier la réponse">${CC_ICONS.copy}</button>`;
        actions.firstElementChild.addEventListener('click', async (e) => {
          if (await ccCopy(fullText)) { e.currentTarget.innerHTML = CC_ICONS.check; setTimeout(() => { actions.firstElementChild.innerHTML = CC_ICONS.copy; }, 1500); }
        });
        assistant.appendChild(actions);
      } else if (!run.segments.length && !note) {
        assistant.insertAdjacentHTML('beforeend', '<div class="cc-note">(réponse vide)</div>');
      }
      ccState.run = null;
      ccUpdateComposer();
      ccScrollToBottom();
      break;
    }
    case 'error': {
      thinking?.remove();
      const assistant = run.turn.querySelector('.cc-msg.assistant');
      const err = document.createElement('div');
      err.className = 'cc-error';
      err.innerHTML = `<span class="cc-error-icon">${CC_ICONS.alert}</span><span class="cc-error-text"></span>`;
      err.querySelector('.cc-error-text').textContent = ev.message || 'Erreur inconnue.';
      const retry = document.createElement('button');
      retry.className = 'cc-link-btn';
      if (ev.needsKey) {
        retry.textContent = 'Ouvrir les réglages';
        retry.addEventListener('click', () => ccShowView('config'));
      } else {
        retry.innerHTML = `${CC_ICONS.retry} Réessayer`;
        const { text, quote } = run.retry;
        retry.addEventListener('click', () => { run.turn.remove(); if (quote) ccSetQuote(quote); ccSend(text); });
      }
      err.appendChild(retry);
      assistant.appendChild(err);
      ccState.run = null; // l'historique validé reste celui d'avant ce message
      ccUpdateComposer();
      ccScrollToBottom();
      break;
    }
  }
}

// ---------- Réglages ----------
async function ccRenderConfig() {
  const panel = ccPanel();
  if (!panel) return;
  const box = panel.querySelector('.cc-config');
  const s = ccState.settings || {};
  const server = s.server || {};
  const cli = s.cli || {};
  const history = s.history || {};
  const status = !s.mcpEnabled ? '<span class="cc-status off">Désactivé</span>'
    : server.running ? `<span class="cc-status on">Actif sur 127.0.0.1:${s.port}</span>`
      : server.error ? `<span class="cc-status err">${ccEsc(server.error)}</span>`
        : '<span class="cc-status off">Démarrage…</span>';

  box.innerHTML = `
    <div class="cc-config-section">
      <div class="cc-config-title">Assistant</div>
      <div class="cc-row">
        <div><div class="cc-row-label">Claude Code</div><div class="cc-small">${cli.found
          ? `Version ${ccEsc(cli.version)} — connecté à ton abonnement Claude<br><span class="cc-path">${ccEsc(cli.path)}</span>`
          : ccEsc(cli.error || 'Introuvable')}</div></div>
        <div class="cc-row-actions">
          <button class="cc-secondary" data-act="detect-cli">${cli.found ? 'Revérifier' : 'Rechercher'}</button>
        </div>
      </div>
      <div class="cc-key-edit">
        <input type="text" class="cc-field cc-cli-path" placeholder="Chemin de claude (vide = détection automatique)" value="${ccEsc(s.cliPath || '')}" spellcheck="false">
        <button class="cc-secondary" data-act="save-cli-path">Utiliser ce chemin</button>
        <div class="cc-setup-msg"></div>
      </div>
      <div class="cc-row">
        <div><div class="cc-row-label">Historique</div><div class="cc-small">${history.count || 0} conversation${(history.count || 0) > 1 ? 's' : ''} dans <span class="cc-path">${ccEsc(history.file || 'assistant-history.json')}</span></div></div>
        <div class="cc-row-actions">
          ${history.count ? '<button class="cc-secondary danger" data-act="clear-history">Effacer</button>' : ''}
        </div>
      </div>
      <label class="cc-row">
        <div class="cc-row-label">Modèle</div>
        <select class="cc-field cc-model">${(s.models || []).map(m => `<option value="${m.id}" ${m.id === s.model ? 'selected' : ''}>${ccEsc(m.label)}</option>`).join('')}</select>
      </label>
      <div class="cc-usage-note">
        Chaque question (dans le panneau ou dans les notes) est décomptée de ton <b>abonnement Claude</b>, avec les mêmes limites d'utilisation que claude.ai et Claude Code. Opus consomme le plus vite, Haiku le moins. Une demande qui utilise beaucoup d'outils (lire plusieurs pages, cliquer…) consomme davantage.
      </div>
      <label class="cc-row cc-toggle-row">
        <div><div class="cc-row-label">Agir sur les pages</div><div class="cc-small">Clics, saisie et défilement par Claude (assistant et MCP). Les mots de passe ne sont jamais remplis.</div></div>
        <input type="checkbox" class="cc-switch" data-set="allowActions" ${s.allowActions ? 'checked' : ''}>
      </label>
    </div>

    <div class="cc-config-section">
      <div class="cc-config-title">${CC_ICONS.plug} Serveur MCP</div>
      <label class="cc-row cc-toggle-row">
        <div><div class="cc-row-label">Activer Claude Connect (MCP)</div><div class="cc-small">Permet à Claude Desktop ou Claude Code de piloter Zenith : onglets, pages, signets, notes.</div></div>
        <input type="checkbox" class="cc-switch" data-set="mcpEnabled" ${s.mcpEnabled ? 'checked' : ''}>
      </label>
      <div class="cc-row"><div class="cc-row-label">État</div>${status}</div>
      <div class="cc-row">
        <div class="cc-row-label">Port</div>
        <input type="number" class="cc-field cc-port" min="1024" max="65535" value="${s.port || ''}">
      </div>
      <div class="cc-mcp-help">
        <div class="cc-row-label">Claude Desktop</div>
        <div class="cc-small">Paramètres › Développeur › Modifier la configuration : colle ce bloc dans <code>claude_desktop_config.json</code> (fusionne-le avec un éventuel « mcpServers » existant), puis redémarre Claude.</div>
        <button class="cc-secondary" data-act="copy-desktop">${CC_ICONS.copy} Copier la configuration Claude Desktop</button>
        <div class="cc-row-label" style="margin-top:10px">Claude Code</div>
        <div class="cc-small">Dans un terminal :</div>
        <button class="cc-secondary" data-act="copy-code">${CC_ICONS.copy} Copier la commande Claude Code</button>
        <div class="cc-small" style="margin-top:10px">Le jeton protège l'accès : ne le partage pas. Le régénérer déconnecte les clients déjà configurés.</div>
        <button class="cc-secondary danger" data-act="regen">Régénérer le jeton</button>
      </div>
    </div>`;

  const update = async (changes) => {
    ccState.settings = await window.zenithAPI.ccSetSettings(changes);
    ccRefreshPanel();
  };
  box.querySelectorAll('[data-set]').forEach(cb => cb.addEventListener('change', () => update({ [cb.dataset.set]: cb.checked })));
  box.querySelector('.cc-model')?.addEventListener('change', (e) => update({ model: e.target.value }));
  box.querySelector('.cc-port')?.addEventListener('change', (e) => {
    const port = parseInt(e.target.value, 10);
    if (port > 1023 && port < 65536) update({ port });
  });
  const cliEdit = box.querySelector('.cc-key-edit');
  const checkCli = async (cliPath) => {
    const msg = cliEdit.querySelector('.cc-setup-msg');
    msg.className = 'cc-setup-msg'; msg.textContent = 'Recherche de Claude Code…';
    ccState.settings = await window.zenithAPI.ccCheckCli(cliPath);
    ccRefreshPanel();
  };
  box.querySelector('[data-act="detect-cli"]')?.addEventListener('click', () => checkCli());
  const savePath = () => checkCli(cliEdit.querySelector('.cc-cli-path').value);
  box.querySelector('[data-act="save-cli-path"]')?.addEventListener('click', savePath);
  cliEdit.querySelector('.cc-cli-path').addEventListener('keydown', (e) => { if (e.key === 'Enter') savePath(); });
  box.querySelector('[data-act="clear-history"]')?.addEventListener('click', async () => {
    if (!confirm("Effacer tout l'historique de l'assistant ?")) return;
    ccState.settings = await window.zenithAPI.ccClearHistory();
    ccRefreshPanel();
  });

  const copyBtn = (act, getText) => box.querySelector(`[data-act="${act}"]`)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ok = await ccCopy(await getText());
    const old = btn.innerHTML;
    btn.innerHTML = ok ? `${CC_ICONS.check} Copié` : 'Copie impossible';
    setTimeout(() => { btn.innerHTML = old; }, 1600);
  });
  copyBtn('copy-desktop', async () => (await window.zenithAPI.ccGetConnectionInfo()).desktopConfig);
  copyBtn('copy-code', async () => (await window.zenithAPI.ccGetConnectionInfo()).claudeCode);
  box.querySelector('[data-act="regen"]')?.addEventListener('click', async (e) => {
    await update({ regenerateToken: true });
    showNotification('Nouveau jeton Claude Connect : recopie la configuration dans tes clients MCP');
  });
}
