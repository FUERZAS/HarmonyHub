// resources.js - JavaScript for the Resources page

// Global variables
let allResources = [];
let filteredResources = [];
let favorites = [];

document.addEventListener('DOMContentLoaded', function() {
    // Initialize resources functionality
    initResources();
    
    // Set up event listeners
    setupEventListeners();
});

function initResources() {
    // Check if user is logged in
    checkAuthState();
    
    // Load user data
    loadUserData();
    
    // Fetch resources from Firebase
    fetchResources();
}

function setupEventListeners() {
    // Category filter
    const categoryCards = document.querySelectorAll('.category-card');
    categoryCards.forEach(card => {
        card.addEventListener('click', function() {
            const category = this.getAttribute('data-category');
            filterResourcesByCategory(category);
            
            // Update active category
            categoryCards.forEach(c => c.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Search functionality
    const searchInput = document.getElementById('resource-search');
    searchInput.addEventListener('input', function() {
        filterResourcesBySearch(this.value);
    });
    
    // Category dropdown filter
    const categoryFilter = document.getElementById('category-filter');
    categoryFilter.addEventListener('change', function() {
        filterResourcesByCategory(this.value);
    });
    
    // Sort functionality
    const sortBy = document.getElementById('sort-by');
    sortBy.addEventListener('change', function() {
        sortResources(this.value);
    });
    
    // View toggle
    const viewButtons = document.querySelectorAll('.view-btn');
    viewButtons.forEach(button => {
        button.addEventListener('click', function() {
            const view = this.getAttribute('data-view');
            toggleView(view);
            
            // Update active view button
            viewButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Favorite / action buttons (including play)
    document.addEventListener('click', function(e) {
        if (e.target.closest('.favorite-btn')) {
            toggleFavorite(e.target.closest('.favorite-btn'));
        }

        if (e.target.closest('.download-btn')) {
            downloadResource(e.target.closest('.download-btn'));
        }

        // Play button for audio/video
        if (e.target.closest('.play-btn')) {
            // open modal in play mode
            const card = e.target.closest('.resource-card');
            if (card) openResourceModal(card, true);
            return;
        }

        if (e.target.closest('.resource-card')) {
            if (!e.target.closest('.action-btn')) {
                openResourceModal(e.target.closest('.resource-card'));
            }
        }
    });
    
    // Modal close button
    const closeModal = document.querySelector('.close-modal');
    if (closeModal) {
        closeModal.addEventListener('click', closeResourceModal);
    }
    
    // Load more button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreResources);
    }
    
    // Click outside modal to close
    const modal = document.getElementById('resource-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeResourceModal();
            }
        });
    }
}

function checkAuthState() {
    // Check if user is authenticated
    firebase.auth().onAuthStateChanged(function(user) {
        if (!user) {
            // Redirect to login if not authenticated
            window.location.href = '../index.html';
        }
    });
}

function loadUserData() {
    // Load user data from Firebase
    const user = firebase.auth().currentUser;
    if (user) {
        // Update user name if available
        const memberName = document.getElementById('member-name');
        if (memberName) {
            memberName.textContent = user.displayName || 'Member';
        }
        
        // Update user section in sidebar
        const userName = document.querySelector('.user-name');
        if (userName) {
            userName.textContent = user.displayName || 'Member User';
        }
        
        // Load user favorites
        loadUserFavorites(user.uid);
    }
}

function fetchResources() {
    const resourcesContainer = document.getElementById('resources-container');
    resourcesContainer.innerHTML = '<div class="loading-state">Loading resources...</div>';

    const resourcesRef = firebase.database().ref('resources');

    resourcesRef
        .once('value')
        .then((snapshot) => {
            allResources = [];
            snapshot.forEach((childSnapshot) => {
                const resource = childSnapshot.val();
                resource.id = childSnapshot.key;

                const bytes = resource.cloudinaryData?.bytes || 0;

                // ✅ Convert bytes to readable size (only for Documents & Media)
                if (['documents', 'images', 'videos'].includes(resource.category?.toLowerCase())) {
                    resource.fileSize = formatFileSize(bytes);
                } else {
                    resource.fileSize = ''; // no size for “Other”
                }

                // ✅ Only add allowed resources
                if (resource.accessLevel === 'public' || resource.accessLevel === 'members') {
                    allResources.push(resource);
                }
            });

            // If no resources found in Firebase, try loading demo resources for local testing
            if (allResources.length === 0) {
                console.warn('No resources found in Firebase — loading demo resources.');
                fetch('/member/demo-resources.json')
                    .then(r => r.json())
                    .then(data => {
                        allResources = data;
                        filteredResources = [...allResources];
                        displayResources();
                        setTimeout(() => {
                            updateResourceCounts();
                            updateFavoritesDisplay();
                        }, 100);
                    })
                    .catch(demoErr => {
                        console.error('Error loading demo resources:', demoErr);
                        // Fallback to empty UI
                        filteredResources = [...allResources];
                        displayResources();
                        setTimeout(() => {
                            updateResourceCounts();
                            updateFavoritesDisplay();
                        }, 100);
                    });
            } else {
                // ✅ Once data is ready, update the display
                filteredResources = [...allResources];
                displayResources();

                // ✅ Small delay to ensure DOM finished rendering before updating counts
                setTimeout(() => {
                    updateResourceCounts();
                    updateFavoritesDisplay();
                }, 100);
            }
        })
        .catch((error) => {
            console.error('Error fetching resources:', error);
            console.warn('Loading demo resources for local testing...');
            // Try loading demo resources JSON for local testing
            fetch('/member/demo-resources.json')
                .then(r => r.json())
                .then(data => {
                    allResources = data;
                    filteredResources = [...allResources];
                    displayResources();
                    setTimeout(() => {
                        updateResourceCounts();
                        updateFavoritesDisplay();
                    }, 100);
                })
                .catch(demoErr => {
                    console.error('Error loading demo resources:', demoErr);
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: `Failed to load resources: ${error.message}`,
                    });
                });
        });
}

function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, exponent);
    return `${size.toFixed(2)} ${units[exponent]}`;
}


function displayResources() {
    const resourcesContainer = document.getElementById('resources-container');
    
    if (filteredResources.length === 0) {
        resourcesContainer.innerHTML = '<div class="empty-state">No resources found matching your criteria.</div>';
        return;
    }
    
    resourcesContainer.innerHTML = '';
    
    filteredResources.forEach(resource => {
        const resourceCard = createResourceCard(resource);
        resourcesContainer.appendChild(resourceCard);
    });

    // 👇 ensure favorites are updated after rendering
    updateFavoritesDisplay();
}

function createResourceCard(resource) {
    const card = document.createElement('div');
    card.className = 'resource-card';
    card.setAttribute('data-category', resource.category);
    card.setAttribute('data-id', resource.id);
    
    // Determine icon based on file type or category
    const icon = getResourceIcon(resource);
    
    // Format file size — hide if it's a link
    const isLink = resource.category?.toLowerCase().trim() === 'links';
    const fileSize = isLink ? '' : (resource.fileSize || '');
    
    // Format upload date
    const uploadDate = new Date(resource.uploadDate).toLocaleDateString();
    
    // Check if resource is in favorites
    const isFavorite = favorites.includes(resource.id);
    const favoriteIcon = isFavorite ? 'fas fa-heart' : 'far fa-heart';
    const favoriteTitle = isFavorite ? 'Remove from favorites' : 'Add to favorites';
    
    // Add play button for audio/video resources
    let playBtn = '';
    const ext = (resource.fileUrl || '').split('.').pop().toLowerCase();
    if (["mp4","avi","mov","mp3","wav"].includes(ext)) {
        playBtn = `<button class="action-btn play-btn" title="Play">
            <i class="fas fa-play"></i>
        </button>`;
    }

    // Thumbnail support: generate a thumbnail HTML for images, videos (cloudinary heuristic) or docs (icon)
    let thumbHtml = '';
    try {
        if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
            thumbHtml = `<button class="thumb-button" data-id="${resource.id}"><img class="thumb" src="${resource.fileUrl}" alt="${resource.name} thumbnail"></button>`;
        } else if (['mp4','avi','mov'].includes(ext)) {
            const cloudName = window.cloudinaryConfig?.cloudName;
            if (cloudName && resource.fileUrl.includes(cloudName)) {
                const parts = resource.fileUrl.split('/');
                const uploadIndex = parts.findIndex(p => p === 'upload');
                const publicId = parts.slice(uploadIndex + 2).join('/').replace(/\.mp4|\.mov|\.avi/, '');
                const thumbUrl = `https://res.cloudinary.com/${cloudName}/video/upload/w_800,h_450,c_fill/${publicId}.jpg`;
                thumbHtml = `<button class="thumb-button" data-id="${resource.id}"><img class="thumb" src="${thumbUrl}" alt="${resource.name} thumbnail"></button>`;
            } else {
                // fallback: show a generic video poster (use same domain placeholder)
                thumbHtml = `<button class="thumb-button" data-id="${resource.id}"><div class="thumb-placeholder"><i class="fas fa-file-video"></i></div></button>`;
            }
        } else if (['pdf','doc','docx','ppt','pptx'].includes(ext)) {
            thumbHtml = `<button class="thumb-button" data-id="${resource.id}"><div class="thumb-placeholder doc"><i class="fas fa-file-pdf"></i></div></button>`;
        } else {
            thumbHtml = `<button class="thumb-button" data-id="${resource.id}"><div class="thumb-placeholder"><i class="fas fa-file"></i></div></button>`;
        }
    } catch (e) {
        thumbHtml = '';
    }

    card.innerHTML = `
        ${thumbHtml}
        <div class="resource-header">
            <div class="resource-icon">
                <i class="${icon}"></i>
            </div>
            <div class="resource-actions">
                <button class="action-btn favorite-btn" title="${favoriteTitle}">
                    <i class="${favoriteIcon}"></i>
                </button>
                ${playBtn}
                ${resource.category?.toLowerCase().trim() === 'links'
                    ? `<a href="${resource.fileUrl}" target="_blank" class="action-btn link-btn" title="Open Link">
                        <i class="fas fa-external-link-alt"></i>
                    </a>`
                    : `<button class="action-btn download-btn" title="Download">
                        <i class="fas fa-download"></i>
                    </button>`}
            </div>
        </div>
        <div class="resource-content">
            <h4>${resource.name}</h4>
            <p>${resource.description}</p>
            <div class="resource-meta">
                ${fileSize ? `<span class="resource-size">${fileSize}</span>` : ''}
                <span class="resource-date">Added: ${uploadDate}</span>
            </div>
        </div>
        <div class="resource-footer">
            <span class="resource-category">${resource.category}</span>
            <span class="access-level">${resource.accessLevel}</span>
        </div>
    `;
    // mark card as having thumbnail for styling
    if (thumbHtml) card.classList.add('has-thumb');

    // delegate click on thumbnail to open only that resource
    const thumbButton = card.querySelector('.thumb-button');
    if (thumbButton) {
        thumbButton.addEventListener('click', (e) => {
            e.stopPropagation();
            // open modal for this resource (without toggling playMode by default)
            openResourceModal(card, false);
        });
    }

    return card;
}

function getResourceIcon(resource) {
    // Determine icon based on file extension or category
    const fileUrl = resource.fileUrl || '';
    const extension = fileUrl.split('.').pop().toLowerCase();
    
    switch(extension) {
        case 'pdf':
            return 'fas fa-file-pdf';
        case 'doc':
        case 'docx':
            return 'fas fa-file-word';
        case 'xls':
        case 'xlsx':
            return 'fas fa-file-excel';
        case 'ppt':
        case 'pptx':
            return 'fas fa-file-powerpoint';
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
            return 'fas fa-file-image';
        case 'mp4':
        case 'avi':
        case 'mov':
            return 'fas fa-file-video';
        case 'mp3':
        case 'wav':
            return 'fas fa-file-audio';
        case 'zip':
        case 'rar':
            return 'fas fa-file-archive';
        default:
            // Fallback to category-based icons
            switch(resource.category) {
                case 'guides':
                    return 'fas fa-book-open';
                case 'templates':
                    return 'fas fa-clipboard';
                case 'media':
                    return 'fas fa-photo-video';
                default:
                    return 'fas fa-file';
            }
    }
}

function loadUserFavorites(userId) {
    // Real-time listener for favorites
    const favoritesRef = firebase.database().ref(`userFavorites/${userId}`);
    
    favoritesRef.on('value', (snapshot) => {
        favorites = [];
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                favorites.push(childSnapshot.key);
            });
        }
        updateFavoritesDisplay(); // update UI whenever data changes
    }, (error) => {
        console.error('Error loading favorites:', error);
    });
}

function updateFavoritesDisplay() {
    const favoritesContainer = document.getElementById('favorites-container');
    if (!favoritesContainer) return;

    // If resources aren't loaded yet, wait until they are
    if (allResources.length === 0) return;

    // If no favorites
    if (favorites.length === 0) {
        favoritesContainer.innerHTML = `
            <div class="empty-state">
                <i class="far fa-star"></i>
                <p>You haven't added any resources to favorites yet.</p>
            </div>
        `;
        return;
    }

    // Clear and re-render favorites
    favoritesContainer.innerHTML = '';
    favorites.forEach(favoriteId => {
        const resource = allResources.find(r => r.id === favoriteId);
        if (resource) {
            favoritesContainer.appendChild(createFavoriteItem(resource));
        }
    });
}

function displayFavorites() {
    const favoritesContainer = document.getElementById('favorites-container');
    if (!favoritesContainer) return; // safeguard

    if (favorites.length === 0) {
        favoritesContainer.innerHTML = `
            <div class="empty-state">
                <i class="far fa-star"></i>
                <p>You haven't added any resources to favorites yet.</p>
                <p>Click the heart icon on any resource to add it here.</p>
            </div>
        `;
        return;
    }

    favoritesContainer.innerHTML = '';

    favorites.forEach(favoriteId => {
        const resource = allResources.find(r => r.id === favoriteId);
        if (resource) {
            const favoriteItem = createFavoriteItem(resource);
            favoritesContainer.appendChild(favoriteItem);
        }
    });
}

function createFavoriteItem(resource) {
    const item = document.createElement('div');
    item.className = 'favorite-item';
    item.setAttribute('data-id', resource.id);
    
    const icon = getResourceIcon(resource);
    const uploadDate = new Date(resource.uploadDate).toLocaleDateString();
    
    item.innerHTML = `
        <div class="favorite-icon">
            <i class="${icon}"></i>
        </div>
        <div class="favorite-content">
            <h5>${resource.name}</h5>
            <p>${resource.description}</p>
            <span class="favorite-meta">Added: ${uploadDate}</span>
        </div>
        <div class="favorite-actions">
            <button class="action-btn download-btn" title="Download">
                <i class="fas fa-download"></i>
            </button>
            <button class="action-btn remove-favorite-btn" title="Remove from favorites">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    return item;
}

function toggleFavorite(button) {
    const resourceCard = button.closest('.resource-card');
    const resourceId = resourceCard.getAttribute('data-id');
    const user = firebase.auth().currentUser;
    
    if (!user) return;
    
    const favoritesRef = firebase.database().ref(`userFavorites/${user.uid}/${resourceId}`);
    
    if (favorites.includes(resourceId)) {
        // Remove from favorites
        favoritesRef.remove()
            .then(() => {
                favorites = favorites.filter(id => id !== resourceId);
                updateFavoritesDisplay();
                
                Swal.fire({
                    icon: 'success',
                    title: 'Removed from Favorites',
                    text: 'Resource has been removed from your favorites.',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000
                });
            })
            .catch((error) => {
                console.error('Error removing favorite:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to remove from favorites. Please try again.',
                });
            });
    } else {
        // Add to favorites
        favoritesRef.set(true)
            .then(() => {
                favorites.push(resourceId);
                updateFavoritesDisplay();
                
                Swal.fire({
                    icon: 'success',
                    title: 'Added to Favorites',
                    text: 'Resource has been added to your favorites.',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000
                });
            })
            .catch((error) => {
                console.error('Error adding favorite:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to add to favorites. Please try again.',
                });
            });
    }
}

function downloadResource(button) {
    const resourceCard = button.closest('.resource-card');
    const resourceId = resourceCard.getAttribute('data-id');
    const resource = allResources.find(r => r.id === resourceId);
    
    if (resource && resource.fileUrl) {
        // Create a temporary link to trigger download
        const link = document.createElement('a');
        link.href = resource.fileUrl;
        link.download = resource.name || 'download';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        Swal.fire({
            icon: 'success',
            title: 'Download Started',
            text: 'Your download should begin shortly.',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000
        });
    } else {
        Swal.fire({
            icon: 'error',
            title: 'Download Error',
            text: 'Unable to download this resource.',
        });
    }
}

function filterResourcesByCategory(category) {
    if (category === 'all') {
        filteredResources = [...allResources];
    } 
    else if (category === 'documents') {
        filteredResources = allResources.filter(resource =>
            resource.category &&
            resource.category.toLowerCase().trim() === 'documents'
        );
    } 
    else if (category === 'media') {
        filteredResources = allResources.filter(resource =>
            resource.category &&
            ['images', 'videos'].includes(resource.category.toLowerCase().trim())
        );
    } 
    else if (category === 'other') {
        filteredResources = allResources.filter(resource =>
            resource.category &&
            resource.category.toLowerCase().trim() === 'links'
        );
    }

    displayResources();
    updateResourceCounts();
    updateURLParams('category', category);
}

function updateResourceCounts() {
    const counts = {
        all: allResources.length,
        documents: 0,
        media: 0,
        other: 0
    };

    allResources.forEach(resource => {
        const cat = (resource.category || '').toLowerCase().trim();

        if (cat === 'documents') {
            counts.documents++;
        } else if (cat === 'images' || cat === 'videos') {
            counts.media++;
        } else if (cat === 'links') {
            counts.other++;
        }
    });

    // Update the badges in HTML
    document.querySelectorAll('.category-card').forEach(card => {
        const cat = card.getAttribute('data-category').toLowerCase().trim();
        const badge = card.querySelector('.resource-count');
        if (badge) badge.textContent = counts[cat] || 0;
    });
}

function filterResourcesBySearch(query) {
    const lowerQuery = query.toLowerCase();
    
    if (!query.trim()) {
        // If search is empty, show all filtered resources
        const currentCategory = document.querySelector('.category-card.active')?.getAttribute('data-category') || 'all';
        filterResourcesByCategory(currentCategory);
        return;
    }
    
    filteredResources = allResources.filter(resource => 
        resource.name.toLowerCase().includes(lowerQuery) || 
        resource.description.toLowerCase().includes(lowerQuery)
    );
    
    displayResources();
    
    // Update URL parameter for search
    updateURLParams('search', query);
}

function sortResources(sortBy) {
    switch(sortBy) {
        case 'newest':
            filteredResources.sort((a, b) => b.uploadDate - a.uploadDate);
            break;
        case 'oldest':
            filteredResources.sort((a, b) => a.uploadDate - b.uploadDate);
            break;
        case 'name':
            filteredResources.sort((a, b) => a.name.localeCompare(b.name));
            break;
        default:
            // Default sorting (by upload date, newest first)
            filteredResources.sort((a, b) => b.uploadDate - a.uploadDate);
    }
    
    displayResources();
    
    // Update URL parameter for sort
    updateURLParams('sort', sortBy);
}

function toggleView(view) {
    const resourcesContainer = document.getElementById('resources-container');
    
    if (view === 'list') {
        resourcesContainer.classList.add('list-view');
    } else {
        resourcesContainer.classList.remove('list-view');
    }
    
    // Update URL parameter for view
    updateURLParams('view', view);
}

function loadMoreResources() {
    // In a real implementation, this would load more resources from Firebase
    // For now, we'll just show a message
    Swal.fire({
        icon: 'info',
        title: 'Feature Coming Soon',
        text: 'Load more functionality will be implemented in the next update.',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
    });
}

function openResourceModal(resourceCard, playMode = false) {
    const resourceId = resourceCard.getAttribute('data-id');
    const resource = allResources.find(r => r.id === resourceId);
    if (!resource) return;

    const modal = document.getElementById('resource-modal');
    const icon = getResourceIcon(resource);
    const uploadDate = new Date(resource.uploadDate).toLocaleDateString();
    const isFavorite = favorites.includes(resourceId);

    // Update modal content
    document.getElementById('modal-title').textContent = resource.name;
    document.getElementById('preview-title').textContent = resource.name;
    document.getElementById('preview-description').textContent = resource.description;
    document.getElementById('preview-size').textContent = `Size: ${resource.fileSize || 'Unknown'}`;
    document.getElementById('preview-date').textContent = `Added: ${uploadDate}`;
    document.getElementById('preview-category').textContent = `Category: ${resource.category}`;

    // Update modal icon
    const previewIcon = document.querySelector('.preview-icon i');
    previewIcon.className = icon;

    // Remove any previous media player
    // Ensure any previous dynamic preview content is removed so we only show the selected file
    const previewArea = document.querySelector('.resource-preview');
    // Create a dedicated dynamic container for injected previews (if not exists)
    let dynamicContainer = previewArea.querySelector('.preview-dynamic');
    if (!dynamicContainer) {
        dynamicContainer = document.createElement('div');
        dynamicContainer.className = 'preview-dynamic';
        // insert before player controls if present, otherwise append
        const playerControls = previewArea.querySelector('.modal-player-controls') || previewArea.querySelector('#modal-player-controls');
        if (playerControls) previewArea.insertBefore(dynamicContainer, playerControls);
        else previewArea.appendChild(dynamicContainer);
    }

    // Clear previous preview content and remove any lingering media player
    dynamicContainer.innerHTML = '';
    const existingPlayer = document.getElementById('modal-media-player');
    if (existingPlayer) existingPlayer.remove();

    // If resource has a file URL, inject an appropriate preview/player into the dynamic container
    if (resource.fileUrl) {
        const ext = (resource.fileUrl || '').split('.').pop().toLowerCase();
        // support media and document previews
        if (['mp4','avi','mov'].includes(ext)) {
            const video = document.createElement('video');
            video.id = 'modal-media-player';
            video.src = resource.fileUrl;
            video.setAttribute('playsinline', ''); // better mobile behavior (iOS)
            video.playsInline = true;
            video.controls = true;
            video.preload = 'metadata';
            video.style.width = '100%';
            dynamicContainer.appendChild(video);
            // autoplay only when explicitly requested
            if (playMode) video.play().catch(() => {});
        } else if (['mp3','wav'].includes(ext)) {
            const audio = document.createElement('audio');
            audio.id = 'modal-media-player';
            audio.src = resource.fileUrl;
            audio.setAttribute('playsinline', '');
            audio.controls = true;
            audio.preload = 'metadata';
            audio.style.width = '100%';
            dynamicContainer.appendChild(audio);
            if (playMode) audio.play().catch(() => {});
        } else if (['pdf','doc','docx','ppt','pptx'].includes(ext)) {
            // Use Google Docs viewer for office files (works for public URLs)
            const iframe = document.createElement('iframe');
            iframe.className = 'resource-iframe-preview';
            // for PDFs, modern browsers often handle inline display; still use iframe for consistency
            iframe.src = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(resource.fileUrl)}`;
            iframe.setAttribute('aria-label', 'Document preview');
            dynamicContainer.appendChild(iframe);
        } else if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
            const img = document.createElement('img');
            img.className = 'resource-image-preview';
            img.src = resource.fileUrl;
            img.alt = resource.name || 'Image preview';
            dynamicContainer.appendChild(img);
        } else if (['txt','md','csv','json'].includes(ext)) {
            // fetch text content and display in a <pre>
            const pre = document.createElement('pre');
            pre.className = 'resource-text-preview';
            pre.textContent = 'Loading...';
            dynamicContainer.appendChild(pre);
            fetch(resource.fileUrl).then(r => r.text()).then(text => {
                // limit size to protect the UI
                pre.textContent = text.length > 20000 ? text.slice(0,20000) + '\n\n[Truncated]' : text;
            }).catch(() => {
                pre.textContent = 'Unable to load preview.';
            });
        } else {
            // fallback: show a download button if preview not supported
            const info = document.createElement('div');
            info.textContent = 'Preview not available. Use the download button to open this resource.';
            dynamicContainer.appendChild(info);
        }
    }

    // Update favorite button
    const favoriteBtn = document.getElementById('modal-favorite');
    const favoriteIcon = favoriteBtn.querySelector('i');
    if (isFavorite) {
        favoriteIcon.className = 'fas fa-heart';
        favoriteBtn.innerHTML = '<i class="fas fa-heart"></i> Remove from Favorites';
    } else {
        favoriteIcon.className = 'far fa-heart';
        favoriteBtn.innerHTML = '<i class="far fa-heart"></i> Add to Favorites';
    }

    // Set up modal button events
    favoriteBtn.onclick = () => {
        const favoriteButton = resourceCard.querySelector('.favorite-btn');
        toggleFavorite(favoriteButton);
        closeResourceModal();
    };

    document.getElementById('modal-download').onclick = () => {
        const downloadButton = resourceCard.querySelector('.download-btn');
        downloadResource(downloadButton);
    };

    // Show modal
    modal.classList.add('active');
        // prevent background from scrolling when modal is open
        document.body.classList.add('modal-open');
    // close when clicking outside modal-content (backdrop)
    function backdropHandler(e) {
        const content = modal.querySelector('.modal-content');
        if (!content.contains(e.target)) {
            closeResourceModal();
        }
    }
    modal.addEventListener('click', backdropHandler);

    // Setup playback controls if media player injected
    const player = document.getElementById('modal-media-player');
    const controls = document.getElementById('modal-player-controls');
    const playPauseBtn = document.getElementById('modal-play-pause');
    const progressBar = document.getElementById('modal-progress-bar');
    const currentTimeEl = document.getElementById('modal-current-time');
    const totalTimeEl = document.getElementById('modal-total-time');

    function formatTime(sec) {
        if (isNaN(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    let timeUpdateHandler;
    let endedHandler;

    if (player) {
        controls.style.display = 'flex';
        // When metadata loaded, set total time
        player.addEventListener('loadedmetadata', () => {
            totalTimeEl.textContent = formatTime(player.duration);
        });

        timeUpdateHandler = () => {
            if (!isNaN(player.duration) && player.duration > 0) {
                const pct = (player.currentTime / player.duration) * 100;
                progressBar.style.width = `${pct}%`;
                currentTimeEl.textContent = formatTime(player.currentTime);
            }
        };
        player.addEventListener('timeupdate', timeUpdateHandler);

        endedHandler = () => {
            playPauseBtn.querySelector('i').className = 'fas fa-play';
        };
        player.addEventListener('ended', endedHandler);

        // Play if requested
        if (playMode) {
            player.play().catch(() => {});
            playPauseBtn.querySelector('i').className = 'fas fa-pause';
        }

        // Play/Pause control
        playPauseBtn.onclick = () => {
            if (player.paused) {
                player.play().catch(() => {});
                playPauseBtn.querySelector('i').className = 'fas fa-pause';
            } else {
                player.pause();
                playPauseBtn.querySelector('i').className = 'fas fa-play';
            }
        };

        // Seek support: click progress bar container to seek
        const progressContainer = controls.querySelector('.modal-progress');
        progressContainer.addEventListener('click', (e) => {
            const rect = progressContainer.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (!isNaN(player.duration)) {
                player.currentTime = pct * player.duration;
            }
        });

        // Keyboard controls: space to play/pause, Esc to close
        function keyHandler(evt) {
            if (evt.code === 'Space') {
                evt.preventDefault();
                playPauseBtn.click();
            }
            if (evt.key === 'Escape') {
                closeResourceModal();
            }
        }
        document.addEventListener('keydown', keyHandler);

        // Cleanup when modal is closed: wrap original close function
        const originalClose = closeResourceModal;
        closeResourceModal = () => {
            // call original behavior
            try { originalClose(); } catch (e) { modal.classList.remove('active'); }
            if (player) {
                player.pause();
                player.removeEventListener('timeupdate', timeUpdateHandler);
                player.removeEventListener('ended', endedHandler);
                player.remove();
            }
            controls.style.display = 'none';
            document.removeEventListener('keydown', keyHandler);
            // restore original close function
            closeResourceModal = originalClose;
            // remove backdrop handler
            modal.removeEventListener('click', backdropHandler);
        };
    } else {
        if (controls) controls.style.display = 'none';
    }
}

function closeResourceModal() {
    const modal = document.getElementById('resource-modal');
    modal.classList.remove('active');
        // restore page scroll
        document.body.classList.remove('modal-open');
    // remove any injected dynamic preview content and stop media playback
    const previewArea = document.querySelector('.resource-preview');
    if (previewArea) {
        const dynamicContainer = previewArea.querySelector('.preview-dynamic');
        if (dynamicContainer) dynamicContainer.innerHTML = '';
    }
    const existingPlayer = document.getElementById('modal-media-player');
    if (existingPlayer) {
        try { existingPlayer.pause(); } catch (e) {}
        existingPlayer.remove();
    }
}

function updateURLParams(key, value) {
    // Update URL parameters without reloading the page
    const url = new URL(window.location);
    if (value) {
        url.searchParams.set(key, value);
    } else {
        url.searchParams.delete(key);
    }
    window.history.replaceState({}, '', url);
}

// Add some CSS for the new elements
const style = document.createElement('style');
style.textContent = `
    .loading-state {
        text-align: center;
        padding: 2rem;
        color: #6c757d;
        font-style: italic;
    }
    
    .access-level {
        display: inline-block;
        background: #e9ecef;
        color: #495057;
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        font-size: 0.7rem;
        margin-left: 0.5rem;
    }
    
    .favorite-item {
        display: flex;
        align-items: center;
        padding: 1rem;
        border-bottom: 1px solid #e9ecef;
        gap: 1rem;
    }
    
    .favorite-item:last-child {
        border-bottom: none;
    }
    
    .favorite-icon {
        font-size: 1.5rem;
        color: #6a89cc;
    }
    
    .favorite-content {
        flex: 1;
    }
    
    .favorite-content h5 {
        margin: 0 0 0.25rem 0;
        color: #333;
    }
    
    .favorite-content p {
        margin: 0 0 0.5rem 0;
        color: #6c757d;
        font-size: 0.9rem;
    }
    
    .favorite-meta {
        font-size: 0.8rem;
        color: #adb5bd;
    }
    
    .favorite-actions {
        display: flex;
        gap: 0.5rem;
    }
`;
document.head.appendChild(style);