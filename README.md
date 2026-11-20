# Zenith

Navigateur web minimaliste construit avec Electron.

![Zenith Browser](assets/logo.png)

## Fonctionnalités

- Interface sombre et épurée
- Gestion des onglets (drag & drop, clic molette pour fermer)
- Page d'accueil personnalisable avec horloge, météo, calendrier et raccourcis
- Animations de fond (Galaxy, Medusa, fonds Unsplash)
- Gestionnaire de téléchargements avec progression et vitesse
- Historique de navigation avec recherche
- Piles d'onglets façon Opera (couleur, nom, logo, enregistrement en signets)
- Widgets météo et calendrier déplaçables et redimensionnables
- Suggestions de recherche tirées de l'historique sur la page d'accueil
- Signets façon Opera : barre de signets avec dossiers, gestionnaire `zenith://bookmarks` (vues vignettes/liste, recherche, glisser-déposer, corbeille), import/export HTML compatible Opera/Chrome/Firefox
- **Claude Connect** : assistant IA façon Comet dans un panneau latéral (lit la page, cherche, agit dans les onglets, écrit dans les notes), assistant d'écriture dans les notes et serveur MCP pour Claude Desktop / Claude Code
- Bloqueur de publicités intégré
- Blocage des cookies tiers
- DevTools intégrés
- Thème clair/sombre synchronisé

## Installation

```bash
# Cloner le repo
git clone https://github.com/SkyNigh1/Zenith.git
cd Zenith

# Installer les dépendances
npm install

# Lancer l'application
npm start
```

## Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## Claude Connect

Claude Connect intègre Claude à Zenith de trois façons.

**Assistant du navigateur** (bouton ✦ ou Ctrl+Shift+A) : un panneau latéral où Claude peut lire la page affichée, ouvrir des onglets et faire des recherches, cliquer et remplir des champs, gérer les signets et créer ou modifier des notes. Clic droit sur un texte sélectionné › « Demander à Claude ». Il demande confirmation avant les actions engageantes et ne remplit jamais les mots de passe.

**Assistant des notes** (bouton « Claude » dans l'éditeur de notes) : résumer, améliorer, corriger, continuer, structurer, fiche de révision, expliquer, traduire, sur la sélection ou toute la note, puis insérer, remplacer ou créer une nouvelle note.

Ces deux assistants passent par la CLI [Claude Code](https://claude.com/claude-code) avec ton abonnement Claude (Pro ou Max) : chaque question est décomptée de cet abonnement, avec les mêmes limites d'utilisation que claude.ai (Opus consomme le plus vite, Haiku le moins). Le modèle se choisit sous la zone de saisie du panneau, dans le panneau des notes ou dans les réglages. Installe Claude Code, lance `claude` dans un terminal et connecte-toi avec `/login`. Zenith le détecte tout seul, ou tu peux indiquer son chemin dans Claude Connect › Réglages. Pour chaque question, Zenith lance `claude -p` en arrière-plan, relaie la réponse puis ferme le process. Les outils du navigateur lui sont fournis par le serveur MCP local, avec un jeton temporaire valable pour cette seule requête. Les conversations sont enregistrées dans `assistant-history.json`, dans le dossier de données de Zenith (200 conversations au maximum, effaçables dans les réglages).

**Serveur MCP** : Claude Desktop ou Claude Code peuvent piloter Zenith avec les mêmes outils (onglets, pages, historique, signets, notes). Le serveur écoute uniquement sur `127.0.0.1` (port 47821 par défaut) et exige un jeton. Dans Zenith : panneau Claude Connect › Réglages › « Copier la configuration Claude Desktop » ou « Copier la commande Claude Code ».

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| Ctrl+T | Nouvel onglet |
| Ctrl+W | Fermer l'onglet |
| Ctrl+Shift+T | Rouvrir le dernier onglet |
| Ctrl+Tab | Onglet suivant |
| Ctrl+Shift+Tab | Onglet le plus récent (appuis répétés : remonte l'ordre d'utilisation) |
| Ctrl+Clic sur un lien | Nouvel onglet dans la pile |
| Ctrl+Clic droit sur un lien | Nouvel onglet hors pile |
| Ctrl+L | Focus barre d'URL |
| Ctrl+R | Rafraîchir |
| Ctrl+Shift+R | Rafraîchir (cache ignoré) |
| Ctrl+J | Téléchargements |
| Ctrl+H | Historique |
| Ctrl+D | Ajouter / modifier le signet de la page |
| Ctrl+Shift+B | Afficher / masquer la barre de signets |
| Ctrl+Shift+O | Gestionnaire de signets |
| Ctrl+Shift+A | Assistant Claude Connect |
| F12 | DevTools |

## Structure

```
Zenith/
├── src/
│   ├── main.js          # Process principal Electron
│   ├── preload.js       # Bridge API
│   ├── renderer.js      # Interface navigateur + signets + piles
│   ├── index.html       # Structure HTML
│   ├── styles.css       # Styles (dont signets et piles)
│   ├── mcp.js           # Outils Claude Connect + pont MCP pour Claude Desktop
│   └── home/            # Page d'accueil
├── assets/
│   ├── logo.png
│   └── logo.ico
└── package.json
```

## Technologies

- Electron
- HTML/CSS/JavaScript vanilla

## Licence

MIT
