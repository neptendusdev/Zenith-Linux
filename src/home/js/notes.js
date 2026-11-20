class NotesModule {
    constructor() {
        this.dbName = 'ZenithNotesDB';
        this.dbVersion = 1;
        this.db = null;
        this.currentFolderId = 'root';
        this.currentFileId = null;
        this.container = null;
        this.homepage = null;
        this.editor = null;
        this.fileTree = null;
        this.isOpen = false;
        this.undoStack = [];
    }

    async init() {
        this.container = document.getElementById('notesContainer');
        this.homepage = document.querySelector('.homepage-container');
        this.editor = document.getElementById('noteEditor');
        this.fileTree = document.getElementById('fileTree');
        this.emptyState = document.getElementById('emptyState');
        this.modal = document.getElementById('customModal');
        this.toastContainer = document.getElementById('toastContainer');
        this.undoBtn = document.getElementById('undoBtn');
        
        if (!this.container) return;

        await this.openDB();
        this.setupEventListeners();
        this.renderFileTree();
        this.updateEmptyState();
        this.updateUndoButton();
    }

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("Database error: " + event.target.errorCode);
                reject(event.target.errorCode);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store for folders
                if (!db.objectStoreNames.contains('folders')) {
                    const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
                    folderStore.createIndex('parentId', 'parentId', { unique: false });
                }

                // Create object store for files
                if (!db.objectStoreNames.contains('files')) {
                    const fileStore = db.createObjectStore('files', { keyPath: 'id' });
                    fileStore.createIndex('parentId', 'parentId', { unique: false });
                }

                // Add root folder if not exists
                const transaction = event.target.transaction;
                const folderStore = transaction.objectStore('folders');
                folderStore.add({ id: 'root', parentId: null, name: 'Root' });
            };
        });
    }

    setupEventListeners() {
        // Toggle Notes View
        const notesBtn = document.getElementById('notesBtn');
        if (notesBtn) {
            notesBtn.addEventListener('click', () => this.openNotes());
        }

        const closeNotesBtn = document.getElementById('closeNotesBtn');
        if (closeNotesBtn) {
            closeNotesBtn.addEventListener('click', () => this.closeNotes());
        }

        // Editor Formatting
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent focus loss
                const command = btn.dataset.command;
                const value = btn.dataset.value || null;
                document.execCommand(command, false, value);
                this.editor.focus();
                this.updateToolbarState();
            });
        });

            // Auto-save on input
        if (this.editor) {
            this.editor.addEventListener('input', (e) => {
                this.handleInput(e);
                this.saveCurrentFile();
                this.updateLogoOpacity();
            });            this.editor.addEventListener('keydown', (e) => {
                this.handleKeyDown(e);
                // Scroll on arrow keys
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    this.scrollToCursor();
                }
            });

            this.editor.addEventListener('keyup', (e) => {
                this.handleKeyUp(e);
                // Scroll on arrow keys (keyup for final position)
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    this.scrollToCursor();
                }
            });

            // Handle Ctrl+S to save as Markdown
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    if (this.isOpen) {
                        e.preventDefault();
                        if (this.currentFileId) {
                            this.downloadCurrentNoteAsMarkdown();
                        } else {
                            this.showToast("Aucune note sélectionnée", null, null, 'warning');
                        }
                    }
                }
            });

            // Logo Opacity on Scroll
            this.editor.addEventListener('scroll', () => this.updateLogoOpacity());
            
            // Selection change for button highlighting
            document.addEventListener('selectionchange', () => {
                this.updateToolbarState();
            });
        }

        // File/Folder Creation
        document.getElementById('newFolderBtn')?.addEventListener('click', () => this.createNewFolder());
        document.getElementById('newFileBtn')?.addEventListener('click', () => this.createNewFile());
        document.getElementById('createNoteEmptyBtn')?.addEventListener('click', () => this.createNewFile());
        
        // Collapse Tree
        const collapseBtn = document.getElementById('collapseTreeBtn');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                const expandedItems = document.querySelectorAll('.tree-item.expanded');
                const allFolders = document.querySelectorAll('.tree-item.folder');
                
                if (expandedItems.length > 0) {
                    // Collapse all
                    expandedItems.forEach(el => el.classList.remove('expanded'));
                } else {
                    // Expand all
                    allFolders.forEach(el => el.classList.add('expanded'));
                }
                this.updateCollapseButtonState();
            });
        }

        // Undo Button
        document.getElementById('undoBtn')?.addEventListener('click', () => this.undoLastAction());

        // Modal Events
        document.getElementById('modalCancelBtn')?.addEventListener('click', () => this.closeModal());
        document.getElementById('modalInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('modalConfirmBtn').click();
            if (e.key === 'Escape') this.closeModal();
        });

        // Rename current note from header
        document.getElementById('renameNoteBtn')?.addEventListener('click', () => {
            if (this.currentFileId) {
                const nameEl = document.getElementById('currentNoteName');
                if (nameEl) {
                    this.renameItem(this.currentFileId, 'file', nameEl);
                }
            }
        });

        // Drop on file tree background to move to root
        this.fileTree.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        this.fileTree.addEventListener('drop', async (e) => {
            e.preventDefault();
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            // Only move if not already in root (though moving to same parent is harmless but redundant)
            // We rely on folder drop handlers stopping propagation. 
            // If we reach here, it means we dropped on the "background" of the tree.
            if (data.id) {
                 await this.moveItem(data.id, data.type, 'root');
                 this.renderFileTree();
            }
        });
    }

    openNotes() {
        this.homepage.style.display = 'none';
        this.container.style.display = 'flex';
        this.isOpen = true;
        
        // Hide other UI elements
        document.querySelector('.widgets-container').style.display = 'none';
        document.querySelector('.menu-container').style.display = 'none';
        document.querySelector('.zenith-branding').style.display = 'none';
    }

    closeNotes() {
        this.container.style.display = 'none';
        this.homepage.style.display = 'flex'; // Restore flex display
        this.isOpen = false;
        
        // Show other UI elements
        document.querySelector('.widgets-container').style.display = 'flex';
        document.querySelector('.menu-container').style.display = 'block';
        document.querySelector('.zenith-branding').style.display = 'flex';
        
        // Reset note name
        const noteNameEl = document.getElementById('currentNoteName');
        if (noteNameEl) {
            noteNameEl.textContent = 'Nouvelle note';
        }
    }

    async getFolders(parentId) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['folders'], 'readonly');
            const store = transaction.objectStore('folders');
            const index = store.index('parentId');
            const request = index.getAll(parentId);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getFiles(parentId) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['files'], 'readonly');
            const store = transaction.objectStore('files');
            const index = store.index('parentId');
            const request = index.getAll(parentId);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async renderFileTree() {
        if (!this.fileTree) return;
        this.fileTree.innerHTML = '';
        await this.renderFolderContent('root', this.fileTree);
    }

    async renderFolderContent(folderId, container) {
        const folders = await this.getFolders(folderId);
        const files = await this.getFiles(folderId);

        // Render Folders
        folders.forEach(folder => {
            if (folder.id === 'root') return; // Skip root self-reference if any

            const folderEl = document.createElement('div');
            folderEl.className = 'tree-item folder';
            folderEl.dataset.id = folder.id;
            folderEl.draggable = true;
            
            const header = document.createElement('div');
            header.className = 'tree-item-header';
            header.innerHTML = `
                <div class="item-content">
                    <i class="fas fa-folder"></i> 
                    <span class="item-name" contenteditable="false">${folder.name}</span>
                </div>
                <div class="item-actions">
                    <button class="rename-item-btn" title="Renommer"><i class="fas fa-pen"></i></button>
                    <button class="delete-item-btn" title="Supprimer"><i class="fas fa-times"></i></button>
                </div>
            `;
            
            // Folder click to toggle
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                // Don't toggle if clicking buttons
                if (e.target.closest('.delete-item-btn') || e.target.closest('.rename-item-btn') || e.target.closest('.item-name[contenteditable="true"]')) return;
                folderEl.classList.toggle('expanded');
                this.updateCollapseButtonState();
            });

            // Rename button
            header.querySelector('.rename-item-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.renameItem(folder.id, 'folder', header.querySelector('.item-name'));
            });

            // Delete button
            header.querySelector('.delete-item-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showConfirmModal(
                    'Supprimer le dossier ?',
                    'Voulez-vous vraiment supprimer ce dossier et tout son contenu ?',
                    () => this.deleteItem(folder.id, 'folder')
                );
            });

            // Drag events
            this.setupDragEvents(folderEl, 'folder');

            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            
            folderEl.appendChild(header);
            folderEl.appendChild(childrenContainer);
            container.appendChild(folderEl);

            // Recursively render children
            this.renderFolderContent(folder.id, childrenContainer);
        });

        // Render Files
        files.forEach(file => {
            const fileEl = document.createElement('div');
            fileEl.className = 'tree-item file';
            fileEl.dataset.id = file.id;
            fileEl.draggable = true;
            
            const header = document.createElement('div');
            header.className = 'tree-item-header';
            header.innerHTML = `
                <div class="item-content">
                    <i class="fas fa-file-alt"></i> 
                    <span class="item-name" contenteditable="false">${file.name}</span>
                </div>
                <div class="item-actions">
                    <button class="rename-item-btn" title="Renommer"><i class="fas fa-pen"></i></button>
                    <button class="delete-item-btn" title="Supprimer"><i class="fas fa-times"></i></button>
                </div>
            `;
            
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target.closest('.delete-item-btn') || e.target.closest('.rename-item-btn') || e.target.closest('.item-name[contenteditable="true"]')) return;
                this.loadFile(file.id);
            });

            // Rename button
            header.querySelector('.rename-item-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.renameItem(file.id, 'file', header.querySelector('.item-name'));
            });

            // Delete button
            header.querySelector('.delete-item-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showConfirmModal(
                    'Supprimer le fichier ?',
                    'Voulez-vous vraiment supprimer ce fichier ?',
                    () => this.deleteItem(file.id, 'file')
                );
            });

            // Drag events
            this.setupDragEvents(fileEl, 'file');

            fileEl.appendChild(header);
            container.appendChild(fileEl);
        });
    }

    setupDragEvents(element, type) {
        element.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                id: element.dataset.id,
                type: type
            }));
            e.stopPropagation();
        });

        if (type === 'folder') {
            element.addEventListener('dragover', (e) => {
                e.preventDefault();
                element.classList.add('drag-over');
                e.stopPropagation();
            });

            element.addEventListener('dragleave', (e) => {
                element.classList.remove('drag-over');
                e.stopPropagation();
            });

            element.addEventListener('drop', async (e) => {
                e.preventDefault();
                element.classList.remove('drag-over');
                e.stopPropagation();
                
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                const targetFolderId = element.dataset.id;

                if (data.id === targetFolderId) return; // Can't drop into self

                await this.moveItem(data.id, data.type, targetFolderId);
                this.renderFileTree();
            });
        }
    }

    async moveItem(itemId, type, newParentId) {
        const storeName = type === 'folder' ? 'folders' : 'files';
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        return new Promise((resolve, reject) => {
            const getRequest = store.get(itemId);
            getRequest.onsuccess = () => {
                const item = getRequest.result;
                item.parentId = newParentId;
                store.put(item);
                resolve();
            };
            getRequest.onerror = reject;
        });
    }

    renameItem(id, type, nameElement) {
        const currentName = nameElement.textContent;
        nameElement.contentEditable = true;
        nameElement.focus();
        
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(nameElement);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const save = async () => {
            nameElement.contentEditable = false;
            const newName = nameElement.textContent.trim();
            
            if (newName && newName !== currentName) {
                const storeName = type === 'folder' ? 'folders' : 'files';
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                const getRequest = store.get(id);
                getRequest.onsuccess = () => {
                    const item = getRequest.result;
                    item.name = newName;
                    store.put(item);
                    
                    // If it's the current file, update header too
                    if (type === 'file') {
                        if (this.currentFileId === id) {
                            const noteNameEl = document.getElementById('currentNoteName');
                            if (noteNameEl && noteNameEl !== nameElement) noteNameEl.textContent = newName;
                        }
                        
                        // Also update sidebar item if we renamed from header
                        const sidebarItem = document.querySelector(`.tree-item.file[data-id="${id}"] .item-name`);
                        if (sidebarItem && sidebarItem !== nameElement) sidebarItem.textContent = newName;
                    }
                };
            } else {
                nameElement.textContent = currentName;
            }
        };

        nameElement.addEventListener('blur', save, { once: true });
        nameElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameElement.blur();
            }
        });
    }

    async createNewFolder() {
        this.showInputModal("Nouveau dossier", "Nom du dossier", async (name) => {
            if (!name) return;
            const id = 'folder_' + Date.now();
            const folder = { id, parentId: 'root', name };

            const transaction = this.db.transaction(['folders'], 'readwrite');
            const store = transaction.objectStore('folders');
            store.add(folder);

            transaction.oncomplete = () => this.renderFileTree();
        });
    }

    async createNewFile() {
        this.showInputModal("Nouvelle note", "Nom de la note", async (name) => {
            if (!name) return;
            const id = 'file_' + Date.now();
            const file = { 
                id, 
                parentId: 'root', 
                name, 
                content: '', 
                lastModified: Date.now() 
            };

            const transaction = this.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            store.add(file);

            transaction.oncomplete = () => {
                this.renderFileTree();
                this.loadFile(id);
            };
        });
    }

    async loadFile(fileId) {
        const transaction = this.db.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const request = store.get(fileId);

        request.onsuccess = () => {
            const file = request.result;
            this.currentFileId = file.id;
            this.editor.innerHTML = file.content;
            
            // Update note name display
            const noteNameEl = document.getElementById('currentNoteName');
            if (noteNameEl) {
                noteNameEl.textContent = file.name;
            }
            
            // Update active state in tree
            document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
            const activeEl = document.querySelector(`.tree-item.file[data-id="${file.id}"]`);
            if (activeEl) activeEl.classList.add('active');
            
            this.updateEmptyState();
            // Wait for render then update opacity
            setTimeout(() => this.updateLogoOpacity(), 0);
        };
    }

    updateEmptyState() {
        if (this.currentFileId) {
            this.editor.style.display = 'block';
            if (this.emptyState) this.emptyState.style.display = 'none';
            document.querySelector('.editor-toolbar').style.display = 'flex';
        } else {
            this.editor.style.display = 'none';
            if (this.emptyState) this.emptyState.style.display = 'flex';
            document.querySelector('.editor-toolbar').style.display = 'none';
        }
    }

    showInputModal(title, placeholder, callback) {
        if (!this.modal) return;
        
        const titleEl = document.getElementById('modalTitle');
        const messageEl = document.getElementById('modalMessage');
        const inputEl = document.getElementById('modalInput');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        
        titleEl.textContent = title;
        messageEl.style.display = 'none';
        inputEl.style.display = 'block';
        inputEl.value = '';
        inputEl.placeholder = placeholder;
        
        this.modal.style.display = 'flex';
        inputEl.focus();
        
        const handleConfirm = () => {
            const value = inputEl.value.trim();
            if (value) {
                callback(value);
                this.closeModal();
            }
        };
        
        // Remove old listeners
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.addEventListener('click', handleConfirm);
    }

    showConfirmModal(title, message, callback) {
        if (!this.modal) return;
        
        const titleEl = document.getElementById('modalTitle');
        const messageEl = document.getElementById('modalMessage');
        const inputEl = document.getElementById('modalInput');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        
        titleEl.textContent = title;
        messageEl.textContent = message;
        messageEl.style.display = 'block';
        inputEl.style.display = 'none';
        
        this.modal.style.display = 'flex';
        
        const handleConfirm = () => {
            callback();
            this.closeModal();
        };
        
        // Remove old listeners
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.addEventListener('click', handleConfirm);
    }

    closeModal() {
        if (this.modal) this.modal.style.display = 'none';
    }

    showToast(message, actionText = null, actionCallback = null, type = 'info') {
        if (!this.toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span>${message}</span>`;
        
        if (actionText && actionCallback) {
            const btn = document.createElement('button');
            btn.className = 'toast-action';
            btn.textContent = actionText;
            btn.addEventListener('click', () => {
                actionCallback();
                toast.remove();
            });
            toast.appendChild(btn);
        }
        
        this.toastContainer.appendChild(toast);
        
        // Auto remove after 5s
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideUp 0.3s ease reverse forwards';
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    updateLogoOpacity() {
        const branding = document.querySelector('.notes-branding');
        if (!branding) return;

        const scrollBottom = this.editor.scrollTop + this.editor.clientHeight;
        const scrollHeight = this.editor.scrollHeight;
        
        // If content is shorter than view, no overlap
        if (scrollHeight <= this.editor.clientHeight) {
            branding.classList.remove('dimmed');
            return;
        }

        // If we are not at the bottom (with buffer for padding), text is likely under logo
        // We assume padding-bottom is around 100px
        if (scrollHeight - scrollBottom > 80) {
            branding.classList.add('dimmed');
        } else {
            // We are at the bottom (in the padding area)
            branding.classList.remove('dimmed');
        }
    }

    async saveCurrentFile() {
        if (!this.currentFileId) return;

        // Check if editor is empty and restore placeholder
        const isEmpty = !this.editor.textContent.trim();
        const content = isEmpty ? '' : this.editor.innerHTML;
        
        const transaction = this.db.transaction(['files'], 'readwrite');
        const store = transaction.objectStore('files');
        
        const getRequest = store.get(this.currentFileId);
        getRequest.onsuccess = () => {
            const file = getRequest.result;
            file.content = content;
            file.lastModified = Date.now();
            store.put(file);
        };
    }

    async deleteItem(itemId, type) {
        // Fetch item data first for Undo
        const storeName = type === 'folder' ? 'folders' : 'files';
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(itemId);

        request.onsuccess = async () => {
            const item = request.result;
            let children = [];
            
            if (type === 'folder') {
                // Get all children recursively for undo
                children = await this.getFolderContentsRecursive(itemId);
            }

            // Perform delete
            const delTransaction = this.db.transaction(['folders', 'files'], 'readwrite');
            
            if (type === 'folder') {
                delTransaction.objectStore('folders').delete(itemId);
                // Delete children
                children.folders.forEach(f => delTransaction.objectStore('folders').delete(f.id));
                children.files.forEach(f => delTransaction.objectStore('files').delete(f.id));
            } else {
                delTransaction.objectStore('files').delete(itemId);
            }

            delTransaction.oncomplete = () => {
                if (this.currentFileId === itemId) {
                    this.currentFileId = null;
                    this.editor.innerHTML = '';
                    this.updateEmptyState();
                }
                this.renderFileTree();
                
                // Add to undo stack
                this.undoStack.push({
                    action: 'delete',
                    type: type,
                    item: item,
                    children: children
                });
                this.updateUndoButton();
                
                // Show Toast
                this.showToast(
                    `${type === 'folder' ? 'Dossier' : 'Fichier'} supprimé`, 
                    "Annuler", 
                    () => this.undoLastAction()
                );
            };
        };
    }

    async undoLastAction() {
        const action = this.undoStack.pop();
        this.updateUndoButton();
        
        if (!action) return;

        if (action.action === 'delete') {
            await this.undoDelete(action.item, action.type, action.children);
        }
    }

    updateUndoButton() {
        if (this.undoBtn) {
            if (this.undoStack.length > 0) {
                this.undoBtn.style.display = 'block';
            } else {
                this.undoBtn.style.display = 'none';
            }
        }
    }

    async getFolderContentsRecursive(folderId) {
        const folders = await this.getFolders(folderId);
        const files = await this.getFiles(folderId);
        
        let allFolders = [...folders];
        let allFiles = [...files];

        for (const folder of folders) {
            const childContents = await this.getFolderContentsRecursive(folder.id);
            allFolders = allFolders.concat(childContents.folders);
            allFiles = allFiles.concat(childContents.files);
        }

        return { folders: allFolders, files: allFiles };
    }

    async undoDelete(item, type, children) {
        const transaction = this.db.transaction(['folders', 'files'], 'readwrite');
        
        if (type === 'folder') {
            transaction.objectStore('folders').add(item);
            children.folders.forEach(f => transaction.objectStore('folders').add(f));
            children.files.forEach(f => transaction.objectStore('files').add(f));
        } else {
            transaction.objectStore('files').add(item);
        }

        transaction.oncomplete = () => {
            this.renderFileTree();
            this.showToast("Restauration effectuée");
        };
    }

    updateToolbarState() {
        if (!this.isOpen || document.activeElement !== this.editor) return;

        const commands = ['bold', 'italic', 'strikeThrough'];
        commands.forEach(cmd => {
            const isActive = document.queryCommandState(cmd);
            const btn = document.querySelector(`.format-btn[data-command="${cmd}"]`);
            if (btn) {
                if (isActive) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
    }

    handleKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            
            const range = selection.getRangeAt(0);
            let block = this.getParentBlock(range.startContainer);
            
            // If no block found, create one
            if (!block || block === this.editor) {
                // Wrap current content in a div
                const div = document.createElement('div');
                const node = range.startContainer;
                
                if (node === this.editor) {
                    // Move all content to the div
                    while (this.editor.firstChild) {
                        div.appendChild(this.editor.firstChild);
                    }
                    this.editor.appendChild(div);
                } else if (node.nodeType === Node.TEXT_NODE) {
                    const parent = node.parentNode;
                    if (parent === this.editor) {
                        parent.insertBefore(div, node);
                        div.appendChild(node);
                    }
                }
                
                block = div;
            }
            
            const text = block.textContent.trim();
            
            // Check for # Title
            if (text.startsWith('# ') && text.length > 2) {
                const content = text.substring(2).trim();
                this.cleanMarkersFromBlock(block);
                block.textContent = content;
                
                const r = document.createRange();
                r.selectNodeContents(block);
                selection.removeAllRanges();
                selection.addRange(r);
                document.execCommand('formatBlock', false, 'h1');
                
                this.insertParagraphAfter();
                return;
            }
            
            // Check for ## Title
            if (text.startsWith('## ') && text.length > 3) {
                const content = text.substring(3).trim();
                this.cleanMarkersFromBlock(block);
                block.textContent = content;
                
                const r = document.createRange();
                r.selectNodeContents(block);
                selection.removeAllRanges();
                selection.addRange(r);
                document.execCommand('formatBlock', false, 'h2');
                
                this.insertParagraphAfter();
                return;
            }
            
            // For normal blocks, clean markers first
            this.cleanMarkersFromBlock(block);
            
            // Create new paragraph
            const newP = document.createElement('div');
            newP.innerHTML = '<br>';
            
            if (block.nextSibling) {
                this.editor.insertBefore(newP, block.nextSibling);
            } else {
                this.editor.appendChild(newP);
            }
            
            // Move cursor to new paragraph
            const newRange = document.createRange();
            newRange.setStart(newP, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            
            this.scrollToCursor();
        }
    }
    
    cleanMarkersFromNode(textNode) {
        if (textNode.nodeType !== Node.TEXT_NODE) return;
        
        let text = textNode.textContent;
        
        // Process bold **text**
        const boldRegex = /\*\*(.+?)\*\*/g;
        if (boldRegex.test(text)) {
            const parent = textNode.parentNode;
            const fragment = document.createDocumentFragment();
            
            let lastIndex = 0;
            text = textNode.textContent; // Reset
            boldRegex.lastIndex = 0;
            let match;
            
            while ((match = boldRegex.exec(text)) !== null) {
                // Add text before match
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                }
                // Add bold element
                const b = document.createElement('b');
                b.textContent = match[1];
                fragment.appendChild(b);
                lastIndex = match.index + match[0].length;
            }
            
            // Add remaining text
            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }
            
            parent.replaceChild(fragment, textNode);
            return;
        }
        
        // Process italic __text__
        const italicRegex = /__(.+?)__/g;
        if (italicRegex.test(text)) {
            const parent = textNode.parentNode;
            const fragment = document.createDocumentFragment();
            
            let lastIndex = 0;
            text = textNode.textContent;
            italicRegex.lastIndex = 0;
            let match;
            
            while ((match = italicRegex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                }
                const i = document.createElement('i');
                i.textContent = match[1];
                fragment.appendChild(i);
                lastIndex = match.index + match[0].length;
            }
            
            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }
            
            parent.replaceChild(fragment, textNode);
            return;
        }
        
        // Process strikethrough ~~text~~
        const strikeRegex = /~~(.+?)~~/g;
        if (strikeRegex.test(text)) {
            const parent = textNode.parentNode;
            const fragment = document.createDocumentFragment();
            
            let lastIndex = 0;
            text = textNode.textContent;
            strikeRegex.lastIndex = 0;
            let match;
            
            while ((match = strikeRegex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                }
                const s = document.createElement('s');
                s.textContent = match[1];
                fragment.appendChild(s);
                lastIndex = match.index + match[0].length;
            }
            
            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }
            
            parent.replaceChild(fragment, textNode);
        }
    }
    
    cleanMarkersFromBlock(block) {
        // Process each type of marker
        const markers = [
            { pattern: /\*\*(.+?)\*\*/g, style: 'bold' },
            { pattern: /__(.+?)__/g, style: 'italic' },
            { pattern: /~~(.+?)~~/g, style: 'strikeThrough' }
        ];

        // Get HTML content
        let html = block.innerHTML;
        
        markers.forEach(({ pattern, style }) => {
            // Find all matches
            const matches = [];
            let match;
            const regex = new RegExp(pattern);
            
            // Reset lastIndex for global regex
            pattern.lastIndex = 0;
            
            while ((match = pattern.exec(html)) !== null) {
                matches.push({
                    full: match[0],
                    content: match[1],
                    index: match.index
                });
            }
            
            // Replace from end to start to preserve indices
            for (let i = matches.length - 1; i >= 0; i--) {
                const m = matches[i];
                const tag = style === 'bold' ? 'b' : (style === 'italic' ? 'i' : 's');
                const replacement = `<${tag}>${m.content}</${tag}>`;
                html = html.substring(0, m.index) + replacement + html.substring(m.index + m.full.length);
            }
        });
        
        block.innerHTML = html;
    }

    insertParagraphAfter() {
        // Insert a new paragraph after current block and move cursor there
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const block = this.getParentBlock(range.startContainer);
        
        const p = document.createElement('div');
        p.innerHTML = '<br>';
        
        if (block.nextSibling) {
            block.parentNode.insertBefore(p, block.nextSibling);
        } else {
            block.parentNode.appendChild(p);
        }
        
        const newRange = document.createRange();
        newRange.setStart(p, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
    }

    handleKeyUp(e) {
        // Handle empty line --- replacement
        if (e.key === '-') {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            const range = selection.getRangeAt(0);
            const anchor = selection.anchorNode;
            
            // Check if text content is '---'
            if (anchor && anchor.textContent && anchor.textContent.trim() === '---') {
                const block = this.getParentBlock(anchor);
                
                // If no block (first line), handle differently
                if (!block || block === this.editor) {
                    // We're at editor level
                    const textNode = anchor.nodeType === Node.TEXT_NODE ? anchor : anchor.childNodes[0];
                    if (textNode && textNode.textContent.trim() === '---') {
                        const hr = document.createElement('hr');
                        const p = document.createElement('div');
                        p.innerHTML = '<br>';
                        
                        if (textNode.parentNode === this.editor) {
                            this.editor.replaceChild(hr, textNode);
                            this.editor.appendChild(p);
                        } else {
                            textNode.parentNode.replaceWith(hr);
                            hr.parentNode.insertBefore(p, hr.nextSibling);
                        }
                        
                        const newRange = document.createRange();
                        newRange.setStart(p, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    }
                } else {
                    // Replace block with HR
                    const hr = document.createElement('hr');
                    block.parentNode.replaceChild(hr, block);
                    // Insert a new paragraph after
                    const p = document.createElement('div');
                    p.innerHTML = '<br>';
                    hr.parentNode.insertBefore(p, hr.nextSibling);
                    // Move cursor to p
                    const newRange = document.createRange();
                    newRange.setStart(p, 0);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                }
            }
        }
    }

    handleInput(e) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        let node = range.startContainer;
        let cursor = range.startOffset;

        // Ensure we are working with a text node
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.childNodes.length > 0 && cursor > 0) {
                const child = node.childNodes[cursor - 1];
                if (child.nodeType === Node.TEXT_NODE) {
                    node = child;
                    cursor = child.textContent.length;
                }
            }
        }
        
        if (node.nodeType !== Node.TEXT_NODE) return;

        const text = node.textContent;
        const char = e.data;

        // Arrow replacements
        if (char === '>') {
            if (cursor >= 3 && text.substring(cursor - 3, cursor) === '-->') {
                this.replaceText(node, cursor - 3, cursor, '⟶');
                return;
            }
        }
        if (char === '-' || char === '>') {
            if (cursor >= 2 && text.substring(cursor - 2, cursor) === '->') {
                if (!(cursor < text.length && text[cursor] === '>')) {
                    this.replaceText(node, cursor - 2, cursor, '→');
                    return;
                }
            }
        }

        // Blockquote: detect "> " at line start
        if (char === ' ') {
            // Check if we just typed space after >
            if (cursor >= 2 && text.substring(0, cursor).trim() === '>') {
                // Get the block containing this text
                let block = this.getParentBlock(node);
                
                if (!block || block === this.editor) {
                    // Wrap in a div first
                    const div = document.createElement('div');
                    const parent = node.parentNode;
                    if (parent === this.editor) {
                        parent.insertBefore(div, node);
                        div.appendChild(node);
                        block = div;
                    }
                }
                
                if (block) {
                    // Create blockquote manually to avoid execCommand issues
                    const blockquote = document.createElement('blockquote');
                    
                    // Remove the "> " from text
                    node.textContent = text.substring(2);
                    
                    // Move all content from block to blockquote
                    while (block.firstChild) {
                        blockquote.appendChild(block.firstChild);
                    }
                    
                    // Replace block with blockquote
                    block.parentNode.replaceChild(blockquote, block);
                    
                    // Place cursor at start
                    const newRange = document.createRange();
                    newRange.setStart(node, 0);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                }
                return;
            }
        }

        // Inline Formatting: just auto-close markers
        if (char === '*' || char === '_' || char === '~') {
            const marker = char + char;
            
            // Check if we just typed the second char of the marker
            if (cursor >= 2 && text.substring(cursor - 2, cursor) === marker) {
                // Look backwards for opening marker
                const textBefore = text.substring(0, cursor - 2);
                
                // Count occurrences of marker before cursor
                // If even (0, 2, 4...), we are starting a new pair -> Auto-close
                // If odd (1, 3...), we are closing an existing pair -> Do nothing
                const matches = textBefore.split(marker).length - 1;
                
                if (matches % 2 === 0) {
                    // Even number of markers before - auto-close
                    this.insertTextAtCursor(marker);
                    
                    // Move cursor back between markers
                    setTimeout(() => {
                        const sel = window.getSelection();
                        if (sel.rangeCount) {
                            const r = sel.getRangeAt(0);
                            if (r.startContainer.nodeType === Node.TEXT_NODE) {
                                const newRange = document.createRange();
                                newRange.setStart(r.startContainer, r.startOffset - 2);
                                newRange.collapse(true);
                                sel.removeAllRanges();
                                sel.addRange(newRange);
                            }
                        }
                    }, 10);
                }
                // If odd, do nothing (let user finish typing the closing marker)
            }
        }

        this.scrollToCursor();
    }

    scrollToCursor() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        // Use a small timeout to allow layout to update
        setTimeout(() => {
            try {
                const rect = range.getBoundingClientRect();
                const editorRect = this.editor.getBoundingClientRect();
                
                // Check if cursor is below the visible area or close to bottom
                // We add a buffer of 40px
                if (rect.bottom > editorRect.bottom - 40) {
                    const scrollAmount = rect.bottom - editorRect.bottom + 60;
                    this.editor.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                }
                // Also check if cursor is above visible area
                else if (rect.top < editorRect.top + 40) {
                    const scrollAmount = rect.top - editorRect.top - 60;
                    this.editor.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                }
            } catch (e) {
                // Ignore errors if range is invalid
            }
        }, 0);
    }

    replaceText(textNode, start, end, replacement) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('insertText', false, replacement);
    }

    applyBlockFormat(format, textNode, charsToRemove) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, charsToRemove);
        selection.removeAllRanges();
        selection.addRange(range);
        
        document.execCommand('delete');
        document.execCommand('formatBlock', false, format);
    }

    insertTextAtCursor(text) {
        document.execCommand('insertText', false, text);
    }

    getParentBlock(node) {
        while (node && node !== this.editor) {
            if (['DIV', 'P', 'H1', 'H2', 'BLOCKQUOTE', 'LI'].includes(node.tagName)) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    downloadCurrentNoteAsMarkdown() {
        if (!this.currentFileId) return;

        const transaction = this.db.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const request = store.get(this.currentFileId);

        request.onsuccess = () => {
            const file = request.result;
            const markdown = this.convertHtmlToMarkdown(this.editor.innerHTML);
            
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${file.name}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
    }

    convertHtmlToMarkdown(html) {
        // Create a temporary element to parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;

        let markdown = '';

        // Helper to process nodes recursively
        const processNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return '';

            let content = '';
            node.childNodes.forEach(child => {
                content += processNode(child);
            });

            switch (node.tagName) {
                case 'H1':
                    return `# ${content}\n\n`;
                case 'H2':
                    return `## ${content}\n\n`;
                case 'B':
                case 'STRONG':
                    return `**${content}**`;
                case 'I':
                case 'EM':
                    return `__${content}__`;
                case 'S':
                case 'STRIKE':
                    return `~~${content}~~`;
                case 'BLOCKQUOTE':
                    return `> ${content}\n\n`;
                case 'DIV':
                case 'P':
                    // Handle empty lines
                    if (content.trim() === '' && node.querySelector('br')) {
                        return '\n';
                    }
                    return `${content}\n`;
                case 'BR':
                    return '\n';
                case 'HR':
                    return '---\n\n';
                default:
                    return content;
            }
        };

        // Process all top-level nodes
        temp.childNodes.forEach(child => {
            markdown += processNode(child);
        });

        // Clean up multiple newlines
        return markdown.replace(/\n{3,}/g, '\n\n').trim();
    }

    updateCollapseButtonState() {
        const collapseBtn = document.getElementById('collapseTreeBtn');
        if (!collapseBtn) return;
        
        const expandedItems = document.querySelectorAll('.tree-item.expanded');
        const icon = collapseBtn.querySelector('i');
        
        if (expandedItems.length > 0) {
            icon.className = 'fas fa-minus';
            collapseBtn.title = "Tout réduire";
        } else {
            icon.className = 'fas fa-plus';
            collapseBtn.title = "Tout déployer";
        }
    }
}

// Export globally
window.NotesModule = new NotesModule();

// ============================================================
// ============ CLAUDE CONNECT DANS LES NOTES =================
// ============================================================
// Panneau « Claude » dans l'éditeur de notes : résumer, améliorer, corriger, continuer,
// structurer, traduire... sur la sélection ou toute la note, puis insérer le résultat.
// Les appels passent par le process principal, qui lance Claude Code avec l'abonnement Claude.

const NAI_ACTIONS = [
    { id: 'summarize', icon: 'fa-align-left', label: 'Résumer', prompt: "Résume ce texte de façon claire et concise : les idées principales sous forme de liste." },
    { id: 'improve', icon: 'fa-feather', label: 'Améliorer', prompt: "Améliore l'écriture de ce texte (clarté, fluidité, style) sans changer le sens ni la langue. Renvoie uniquement le texte réécrit." },
    { id: 'fix', icon: 'fa-spell-check', label: 'Corriger', prompt: "Corrige l'orthographe, la grammaire et la ponctuation de ce texte sans changer le style. Renvoie uniquement le texte corrigé." },
    { id: 'continue', icon: 'fa-forward', label: 'Continuer', prompt: "Continue ce texte dans le même style et la même langue (un ou deux paragraphes). Renvoie uniquement la suite." },
    { id: 'structure', icon: 'fa-list-ul', label: 'Structurer', prompt: "Réorganise ce texte en une note bien structurée (titres, sous-titres, listes) en gardant tout son contenu." },
    { id: 'revise', icon: 'fa-graduation-cap', label: 'Fiche de révision', prompt: "Transforme ce texte en fiche de révision : notions clés, définitions, puis 5 questions de révision avec leurs réponses." },
    { id: 'explain', icon: 'fa-lightbulb', label: 'Expliquer', prompt: "Explique simplement les notions de ce texte, comme à un étudiant, avec un exemple si utile." },
    { id: 'translate', icon: 'fa-language', label: 'Traduire', prompt: "Traduis ce texte en anglais (ou en français s'il est déjà en anglais). Renvoie uniquement la traduction." }
];

function naiEscape(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Markdown -> HTML au format de l'éditeur de notes (tout est échappé avant mise en forme). */
function naiMarkdownToHtml(md, forEditor = true) {
    const inline = (t) => {
        let s = naiEscape(t);
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>');
        s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<i>$2</i>');
        s = s.replace(/~~([^~]+)~~/g, '<strike>$1</strike>');
        return s;
    };
    const out = [];
    let list = null;
    const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${i}</li>`).join('')}</${list.tag}>`); list = null; } };
    String(md || '').replace(/\r\n?/g, '\n').split('\n').forEach(line => {
        let m;
        if (/^\s*```/.test(line)) return;
        if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flush(); const tag = m[1].length === 1 ? 'h1' : 'h2'; out.push(`<${tag}>${inline(m[2])}</${tag}>`); }
        else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { if (!list || list.tag !== 'ul') { flush(); list = { tag: 'ul', items: [] }; } list.items.push(inline(m[1])); }
        else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (!list || list.tag !== 'ol') { flush(); list = { tag: 'ol', items: [] }; } list.items.push(inline(m[1])); }
        else if ((m = line.match(/^\s*>\s?(.*)$/))) { flush(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
        else if (!line.trim()) { flush(); if (forEditor && out.length) out.push('<div><br></div>'); }
        else { flush(); out.push(`<div>${inline(line)}</div>`); }
    });
    flush();
    while (out.length && out[out.length - 1] === '<div><br></div>') out.pop();
    return out.join('');
}

/** HTML de l'éditeur -> Markdown (listes comprises). */
function naiHtmlToMarkdown(html) {
    const root = document.createElement('div');
    root.innerHTML = html || '';
    const inl = (node) => {
        let s = '';
        node.childNodes.forEach(n => {
            if (n.nodeType === 3) { s += n.textContent; return; }
            if (n.nodeType !== 1) return;
            const t = n.tagName, inner = inl(n);
            if (t === 'B' || t === 'STRONG') s += inner.trim() ? `**${inner}**` : inner;
            else if (t === 'I' || t === 'EM') s += inner.trim() ? `*${inner}*` : inner;
            else if (t === 'S' || t === 'STRIKE') s += `~~${inner}~~`;
            else if (t === 'BR') s += '\n';
            else s += inner;
        });
        return s;
    };
    const lines = [];
    const BLOCK = /^(DIV|P|H\d|UL|OL|LI|BLOCKQUOTE|PRE|HR)$/;
    const walk = (node) => {
        // Les nœuds "en ligne" consécutifs (texte, gras, italique...) forment une seule ligne
        let buf = null;
        const flush = () => { if (buf !== null) { if (buf.trim()) lines.push(buf); buf = null; } };
        node.childNodes.forEach(n => {
            if (n.nodeType === 3 || (n.nodeType === 1 && !BLOCK.test(n.tagName) && n.tagName !== 'BR')) {
                if (n.nodeType === 3) { buf = (buf || '') + n.textContent; return; }
                const wrap = document.createElement('span'); wrap.appendChild(n.cloneNode(true));
                buf = (buf || '') + inl(wrap);
                return;
            }
            if (n.nodeType !== 1) return;
            const t = n.tagName;
            if (t === 'BR') { flush(); return; }
            flush();
            if (t === 'H1') lines.push('# ' + inl(n).trim());
            else if (/^H[2-6]$/.test(t)) lines.push('## ' + inl(n).trim());
            else if (t === 'BLOCKQUOTE') lines.push('> ' + inl(n).trim());
            else if (t === 'UL' || t === 'OL') [...n.children].forEach((li, i) => lines.push((t === 'OL' ? `${i + 1}. ` : '- ') + inl(li).trim()));
            else if (t === 'HR') lines.push('---');
            else if ([...n.children].some(c => BLOCK.test(c.tagName))) walk(n);
            else { const s = inl(n); lines.push(s.trim() ? s : ''); }
        });
        flush();
    };
    walk(root);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

class NotesAssistant {
    constructor(notes) {
        this.notes = notes;
        this.api = (window.zenithHome && window.zenithHome.ai) || null;
        this.messages = [];
        this.run = null;
        this.result = '';
        this.savedRange = null;
        this.scope = 'note';
        this.lastAction = null;
        this.isOpen = false;
    }

    init() {
        const toolbarRight = document.querySelector('.notes-main .toolbar-right');
        if (!toolbarRight || !this.api) return; // hors de Zenith : pas d'assistant

        this.button = document.createElement('button');
        this.button.className = 'nai-toggle';
        this.button.id = 'aiNoteBtn';
        this.button.title = 'Claude : assistant de notes';
        this.button.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i><span>Claude</span>';
        toolbarRight.insertBefore(this.button, toolbarRight.firstChild);
        this.button.addEventListener('mousedown', (e) => e.preventDefault()); // garder la sélection
        this.button.addEventListener('click', () => this.toggle());

        this.panel = document.createElement('aside');
        this.panel.className = 'notes-ai-panel';
        this.panel.innerHTML = `
            <div class="nai-header">
                <span class="nai-title"><i class="fas fa-wand-magic-sparkles"></i> Claude</span>
                <select class="nai-model" title="Modèle (décompté de ton abonnement Claude)" hidden></select>
                <button class="nai-icon-btn nai-close" title="Fermer"><i class="fas fa-times"></i></button>
            </div>
            <div class="nai-nokey" hidden>
                <p>Installe Claude Code et connecte-toi à ton compte Claude pour utiliser l'assistant dans tes notes. Chaque demande consomme une partie de ton abonnement.</p>
                <button class="nai-btn primary nai-open-settings">Ouvrir les réglages</button>
            </div>
            <div class="nai-main">
                <div class="nai-scope"></div>
                <div class="nai-actions">
                    ${NAI_ACTIONS.map(a => `<button class="nai-action" data-action="${a.id}"><i class="fas ${a.icon}"></i>${a.label}</button>`).join('')}
                </div>
                <div class="nai-result-wrap">
                    <div class="nai-placeholder">Choisis une action ou pose une question sur ta note.</div>
                    <div class="nai-result"></div>
                    <div class="nai-status"></div>
                </div>
                <div class="nai-apply" hidden>
                    <button class="nai-btn primary" data-apply="insert"><i class="fas fa-plus"></i> Insérer</button>
                    <button class="nai-btn" data-apply="replace-selection"><i class="fas fa-i-cursor"></i> Remplacer la sélection</button>
                    <button class="nai-btn" data-apply="replace-note"><i class="fas fa-file-pen"></i> Remplacer la note</button>
                    <button class="nai-btn" data-apply="new-note"><i class="fas fa-file-circle-plus"></i> Nouvelle note</button>
                    <button class="nai-btn" data-apply="copy"><i class="fas fa-copy"></i> Copier</button>
                </div>
                <div class="nai-ask">
                    <textarea rows="2" placeholder="Demande à Claude… (ex. « fais-en une liste de révision »)"></textarea>
                    <button class="nai-send" title="Envoyer (Entrée)"><i class="fas fa-arrow-up"></i></button>
                </div>
            </div>`;
        this.notes.container.appendChild(this.panel);

        this.resultEl = this.panel.querySelector('.nai-result');
        this.statusEl = this.panel.querySelector('.nai-status');
        this.input = this.panel.querySelector('.nai-ask textarea');
        this.sendBtn = this.panel.querySelector('.nai-send');

        this.panel.querySelector('.nai-close').addEventListener('click', () => this.toggle(false));
        this.modelSelect = this.panel.querySelector('.nai-model');
        this.modelSelect.addEventListener('change', async () => {
            try { this.renderModels(await this.api.setModel(this.modelSelect.value)); } catch {}
        });
        this.panel.querySelector('.nai-open-settings').addEventListener('click', () => this.api.openSettings());
        this.panel.querySelectorAll('.nai-action').forEach(b => {
            b.addEventListener('mousedown', (e) => e.preventDefault());
            b.addEventListener('click', () => this.runAction(b.dataset.action));
        });
        this.panel.querySelectorAll('[data-apply]').forEach(b => {
            b.addEventListener('mousedown', (e) => e.preventDefault());
            b.addEventListener('click', () => this.apply(b.dataset.apply));
        });
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.ask(); }
            if (e.key === 'Escape') { e.preventDefault(); this.run ? this.cancel() : this.toggle(false); }
        });
        this.sendBtn.addEventListener('click', () => (this.run ? this.cancel() : this.ask()));

        // Mémoriser la sélection faite dans l'éditeur
        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection();
            if (!sel.rangeCount || !this.notes.editor) return;
            const range = sel.getRangeAt(0);
            if (this.notes.editor.contains(range.commonAncestorContainer)) {
                this.savedRange = range.cloneRange();
                this.updateScope();
            }
        });

        this.api.onEvent((ev) => this.onEvent(ev));
    }

    async toggle(force) {
        const open = typeof force === 'boolean' ? force : !this.isOpen;
        this.isOpen = open;
        this.notes.container.classList.toggle('ai-open', open);
        this.button.classList.toggle('active', open);
        if (!open) return;
        this.updateScope();
        let status = { hasKey: false };
        try { status = await this.api.status(); } catch {}
        this.panel.querySelector('.nai-nokey').hidden = !!status.hasKey;
        this.panel.querySelector('.nai-main').hidden = !status.hasKey;
        this.renderModels(status);
        if (status.hasKey) setTimeout(() => this.input.focus({ preventScroll: true }), 50);
    }

    /** Sélecteur de modèle (réglage partagé avec le panneau Claude Connect du navigateur). */
    renderModels(status) {
        if (!this.modelSelect || !status) return;
        const models = Array.isArray(status.models) ? status.models : [];
        this.modelSelect.hidden = !status.hasKey || !models.length;
        this.modelSelect.innerHTML = models.map(m => {
            const short = m.id === 'default' ? 'Par défaut' : String(m.label).split(' — ')[0];
            return `<option value="${naiEscape(m.id)}" ${m.id === status.model ? 'selected' : ''} title="${naiEscape(m.label)}">${naiEscape(short)}</option>`;
        }).join('');
    }

    hasSelection() {
        const r = this.savedRange;
        return !!(r && !r.collapsed && this.notes.editor.contains(r.commonAncestorContainer) && r.toString().trim());
    }

    updateScope() {
        if (!this.panel) return;
        const el = this.panel.querySelector('.nai-scope');
        if (!this.notes.currentFileId) {
            el.innerHTML = '<i class="fas fa-circle-info"></i> Ouvre ou crée une note pour utiliser les actions.';
            return;
        }
        if (this.hasSelection()) {
            const t = this.savedRange.toString().trim();
            el.innerHTML = `<i class="fas fa-i-cursor"></i> Sur la sélection : « ${naiEscape(t.length > 60 ? t.slice(0, 59) + '…' : t)} »`;
        } else {
            el.innerHTML = '<i class="fas fa-file-lines"></i> Sur toute la note';
        }
    }

    getSourceMarkdown() {
        if (this.hasSelection()) {
            const div = document.createElement('div');
            div.appendChild(this.savedRange.cloneContents());
            this.scope = 'selection';
            return naiHtmlToMarkdown(div.innerHTML) || this.savedRange.toString();
        }
        this.scope = 'note';
        return naiHtmlToMarkdown(this.notes.editor.innerHTML);
    }

    noteTitle() {
        return document.getElementById('currentNoteName')?.textContent || '';
    }

    runAction(id) {
        const action = NAI_ACTIONS.find(a => a.id === id);
        if (!action || this.run) return;
        if (!this.notes.currentFileId) { this.notes.showToast('Ouvre ou crée une note d\'abord', null, null, 'warning'); return; }
        const source = this.getSourceMarkdown();
        if (!source.trim()) { this.notes.showToast('La note est vide', null, null, 'warning'); return; }
        this.lastAction = action;
        this.messages = [{
            role: 'user',
            content: `${action.prompt}\n\nTexte (${this.scope === 'selection' ? 'extrait sélectionné' : 'note entière'}) :\n"""\n${source}\n"""`
        }];
        this.start();
    }

    ask() {
        const text = this.input.value.trim();
        if (!text || this.run) return;
        this.input.value = '';
        if (this.messages.length && this.result) {
            // Suite de la conversation : affiner le dernier résultat
            this.messages = this.messages.concat({ role: 'user', content: text });
        } else {
            const source = this.notes.currentFileId ? this.getSourceMarkdown() : '';
            this.lastAction = null;
            this.messages = [{
                role: 'user',
                content: source.trim()
                    ? `${text}\n\nTexte (${this.scope === 'selection' ? 'extrait sélectionné' : 'note entière'}) :\n"""\n${source}\n"""`
                    : text
            }];
        }
        this.start();
    }

    start() {
        this.result = '';
        this.resultEl.innerHTML = '';
        this.panel.querySelector('.nai-placeholder').hidden = true;
        this.panel.querySelector('.nai-apply').hidden = true;
        this.statusEl.className = 'nai-status working';
        this.statusEl.innerHTML = '<span class="nai-dots"><span></span><span></span><span></span></span>';
        this.run = { requestId: 'nai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) };
        this.setRunning(true);
        this.api.ask({ requestId: this.run.requestId, messages: this.messages, noteTitle: this.noteTitle() });
    }

    cancel() {
        if (this.run) this.api.cancel(this.run.requestId);
    }

    setRunning(on) {
        this.sendBtn.innerHTML = on ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-arrow-up"></i>';
        this.sendBtn.title = on ? 'Arrêter (Échap)' : 'Envoyer (Entrée)';
        this.panel.querySelectorAll('.nai-action').forEach(b => { b.disabled = on; });
    }

    onEvent(ev) {
        if (!this.run || ev.requestId !== this.run.requestId) return;
        if (ev.type === 'text') {
            this.result += ev.delta;
            this.resultEl.innerHTML = naiMarkdownToHtml(this.result, false);
            this.resultEl.scrollTop = this.resultEl.scrollHeight;
        } else if (ev.type === 'done') {
            this.run = null;
            this.setRunning(false);
            if (Array.isArray(ev.messages)) this.messages = ev.messages;
            this.statusEl.className = 'nai-status';
            this.statusEl.textContent = ev.stopReason === 'cancelled' ? 'Interrompu.' : ev.stopReason === 'max_tokens' ? 'Réponse tronquée.' : '';
            const hasResult = !!this.result.trim();
            this.panel.querySelector('.nai-apply').hidden = !hasResult;
            this.panel.querySelector('[data-apply="replace-selection"]').hidden = !this.hasSelection();
            if (hasResult) this.input.placeholder = 'Affiner le résultat… (ex. « plus court », « en liste »)';
        } else if (ev.type === 'error') {
            this.run = null;
            this.setRunning(false);
            this.statusEl.className = 'nai-status error';
            this.statusEl.textContent = ev.message || 'Erreur inconnue.';
            if (ev.needsKey) this.toggle(true);
        }
    }

    async apply(kind) {
        const md = this.result.trim();
        if (!md) return;
        if (kind === 'copy') {
            try { await navigator.clipboard.writeText(md); this.notes.showToast('Résultat copié'); }
            catch { this.notes.showToast('Copie impossible', null, null, 'warning'); }
            return;
        }
        if (kind === 'new-note') return this.createNote(md);
        if (!this.notes.currentFileId) { this.notes.showToast('Aucune note ouverte', null, null, 'warning'); return; }

        const editor = this.notes.editor;
        const html = naiMarkdownToHtml(md, true);
        const sel = window.getSelection();
        editor.focus({ preventScroll: true });
        const range = document.createRange();
        if (kind === 'replace-note') {
            range.selectNodeContents(editor);
        } else if (kind === 'replace-selection' && this.hasSelection()) {
            range.setStart(this.savedRange.startContainer, this.savedRange.startOffset);
            range.setEnd(this.savedRange.endContainer, this.savedRange.endOffset);
        } else {
            // Insérer après la sélection (ou le curseur), sinon à la fin de la note
            if (this.savedRange && editor.contains(this.savedRange.commonAncestorContainer)) {
                range.setStart(this.savedRange.endContainer, this.savedRange.endOffset);
            } else {
                range.selectNodeContents(editor);
                range.collapse(false);
            }
            range.collapse(true);
        }
        sel.removeAllRanges();
        sel.addRange(range);
        // insertHTML garde l'historique d'annulation de l'éditeur (Ctrl+Z)
        const block = kind === 'insert' && editor.textContent.trim() ? '<div><br></div>' + html : html;
        if (!document.execCommand('insertHTML', false, block)) {
            const frag = range.createContextualFragment(block);
            range.deleteContents();
            range.insertNode(frag);
        }
        await this.notes.saveCurrentFile();
        this.notes.updateEmptyState?.();
        this.notes.showToast(kind === 'replace-note' ? 'Note remplacée' : kind === 'replace-selection' ? 'Sélection remplacée' : 'Texte inséré');
    }

    createNote(md) {
        const name = (this.lastAction ? this.lastAction.label : 'Claude') + ' — ' + (this.noteTitle() || 'note');
        const file = { id: 'file_' + Date.now(), parentId: 'root', name, content: naiMarkdownToHtml(md, true), lastModified: Date.now() };
        const tx = this.notes.db.transaction(['files'], 'readwrite');
        tx.objectStore('files').add(file);
        tx.oncomplete = () => {
            this.notes.renderFileTree();
            this.notes.loadFile(file.id);
            this.notes.showToast(`Note « ${name} » créée`);
        };
    }
}

// Synchronisation : une note créée ou modifiée par Claude (assistant du navigateur ou MCP)
// apparaît tout de suite dans la page d'accueil.
function setupNotesSync(notes) {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('zenith-notes');
    channel.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.type !== 'changed' || !notes.db) return;
        notes.renderFileTree();
        if (msg.id && msg.id === notes.currentFileId) {
            if (document.activeElement === notes.editor) {
                notes.showToast('Cette note a été modifiée par Claude', 'Recharger', () => notes.loadFile(msg.id));
            } else {
                notes.loadFile(msg.id);
            }
        }
    };
}

(function initNotesAssistant() {
    const notes = window.NotesModule;
    const originalInit = notes.init.bind(notes);
    notes.init = async function () {
        // init() renseigne container/editor avant son premier await : l'assistant peut être créé
        // tout de suite, sans attendre la base IndexedDB (qui peut tarder ou échouer si le
        // profil est verrouillé par une autre instance de Zenith).
        const pending = originalInit();
        if (notes.container) {
            notes.assistant = new NotesAssistant(notes);
            notes.assistant.init();
        }
        try { await pending; } catch (e) {
            console.error('Notes : base de données indisponible', e);
            return;
        }
        if (!notes.container) return;
        setupNotesSync(notes);
        // Mettre à jour la portée quand on change de note
        const originalLoad = notes.loadFile.bind(notes);
        notes.loadFile = async (id) => { await originalLoad(id); setTimeout(() => notes.assistant?.updateScope(), 50); };
    };
})();
