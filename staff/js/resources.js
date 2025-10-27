document.addEventListener('DOMContentLoaded', function() {
    // Ensure Cloudinary config exists
    if (typeof cloudinaryConfig === 'undefined') {
        console.error('Cloudinary configuration not found. Make sure cloudinary-config.js is loaded before resources.js');
        window.cloudinaryConfig = {
            cloudName: 'dwp3zume8',
            uploadPreset: 'user-uploads',
            sources: ['local', 'url'],
            multiple: false,
            clientAllowedFormats: ['image', 'video', 'pdf', 'raw'],
            maxFileSize: 100000000
        };
    }

    // Permission flag available globally for functions to check
    window.currentUserCanModifyResources = false;
    window.currentUserRole = null;

    // Firebase Authentication + permission check
    firebase.auth().onAuthStateChanged(function(user) {
        if (!user) {
            window.location.href = '../index.html';
            return;
        }

        const db = firebase.database();
        db.ref('users/' + user.uid).once('value').then(snapshot => {
            const userData = snapshot.val() || {};
            const role = userData.role || '';
            const canUpload = !!(userData.permissions && userData.permissions.canUploadResources === true);

            const isAdmin = role === 'admin';
            const isStaff = role === 'staff';

            // Save for later use
            window.currentUserRole = role;
            window.currentUserCanModifyResources = isAdmin || (isStaff && canUpload);

            const addBtn = document.getElementById("add-resource-btn");
            const uploadBtn = document.getElementById("cloudinary-upload-btn");

            // Hide global buttons if user cannot upload resources
            if (!window.currentUserCanModifyResources) {
                if (addBtn) addBtn.style.display = "none";
                if (uploadBtn) uploadBtn.style.display = "none";
            }

            if (!window.currentUserCanModifyResources) {
                const addBtn = document.getElementById('add-resource-btn');
                const uploadBtn = document.getElementById('cloudinary-upload-btn');
                const fileGroup = document.getElementById('file-upload-group');

                // Hide Add buttons
                if (addBtn) addBtn.style.display = 'none';
                if (uploadBtn) uploadBtn.style.display = 'none';
                if (fileGroup) fileGroup.style.display = 'none';
            }

            if (!isAdmin && !isStaff) {
                // Only staff and admin may view this page
                Swal.fire('Access Denied', 'You do not have permission to access this page.', 'error');
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 1800);
                return;
            }

            // Initialize the app: load resources, UI state & listeners
            loadResources();
            setupEventListeners();

            // Initialize Cloudinary only if user can modify (upload)
            if (window.currentUserCanModifyResources) {
                initializeCloudinaryWidget();
            } else {
                // Hide upload controls and disable add button for read-only staff
                const addBtn = document.getElementById('add-resource-btn');
                if (addBtn) {
                    addBtn.disabled = true;
                    addBtn.classList.add('disabled');
                    addBtn.title = 'You do not have permission to add resources';
                }
                const uploadBtn = document.getElementById('cloudinary-upload-btn');
                if (uploadBtn) uploadBtn.style.display = 'none';
            }
        }).catch(error => {
            console.error('Error fetching user data:', error);
            Swal.fire('Error', 'Unable to verify your account.', 'error');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1800);
        });
    });
});

// ===================== GLOBAL VARIABLES =====================
let resources = [];
let currentEditId = null;
let currentDeleteId = null;
let cloudinaryWidget = null;
let uploadedFileData = null;

// ===================== CLOUDINARY =====================
function initializeCloudinaryWidget() {
    if (typeof cloudinary === 'undefined') {
        console.error('Cloudinary SDK not loaded');
        const uploadGroup = document.getElementById('file-upload-group');
        if (uploadGroup) uploadGroup.innerHTML = '<p class="error-message">File upload functionality is currently unavailable.</p>';
        return;
    }

    if (typeof cloudinaryConfig === 'undefined') {
        console.error('Cloudinary config not loaded');
        const uploadGroup = document.getElementById('file-upload-group');
        if (uploadGroup) uploadGroup.innerHTML = '<p class="error-message">File upload configuration error.</p>';
        return;
    }

    try {
        cloudinaryWidget = cloudinary.createUploadWidget(
            cloudinaryConfig,
            (error, result) => {
                if (!error && result && result.event === 'success') {
                    handleCloudinaryUpload(result.info);
                } else if (error) {
                    console.error('Cloudinary upload error:', error);
                    Swal.fire('Error', 'File upload failed. Please try again.', 'error');
                }
            }
        );

        const cloudBtn = document.getElementById('cloudinary-upload-btn');
        if (cloudBtn) {
            cloudBtn.addEventListener('click', () => {
                // Additional safeguard: only allow open if user can modify
                if (!window.currentUserCanModifyResources) {
                    Swal.fire('Permission Denied', 'You do not have permission to upload files.', 'warning');
                    return;
                }
                cloudinaryWidget.open();
            });
        }
    } catch (err) {
        console.error('Error initializing Cloudinary widget:', err);
        const uploadGroup = document.getElementById('file-upload-group');
        if (uploadGroup) uploadGroup.innerHTML = '<p class="error-message">Failed to initialize file upload.</p>';
    }
}

function handleCloudinaryUpload(fileInfo) {
    uploadedFileData = fileInfo;

    const fileInfoDiv = document.getElementById('uploaded-file-info');
    const filePreview = document.getElementById('file-preview');
    const fileNameEl = document.getElementById('file-name');

    if (fileInfoDiv) fileInfoDiv.style.display = 'block';

    let fileExtension = fileInfo.format;
    if (!fileExtension && fileInfo.original_filename) {
        const parts = fileInfo.original_filename.split('.');
        if (parts.length > 1) fileExtension = parts.pop();
    }

    if (fileNameEl) fileNameEl.textContent = fileInfo.original_filename + (fileExtension ? '.' + fileExtension : '');

    if (filePreview) {
        if (fileInfo.resource_type === 'image') {
            filePreview.innerHTML = `<img src="${fileInfo.secure_url}" alt="${fileInfo.original_filename}">`;
        } else if (fileInfo.resource_type === 'video') {
            filePreview.innerHTML = `<video controls><source src="${fileInfo.secure_url}" type="video/${fileInfo.format}"></video>`;
        } else {
            const iconClass = getFileIconClass(fileExtension || fileInfo.resource_type);
            filePreview.innerHTML = `<div class="file-preview-icon"><i class="fas ${iconClass}"></i></div>`;
        }
    }

    const progress = document.getElementById('file-upload-progress');
    if (progress) progress.style.display = 'none';
}

function getFileIconClass(extension) {
    extension = (extension || '').toLowerCase();
    switch (extension) {
        case 'doc':
        case 'docx':
            return 'fa-file-word';
        case 'pdf':
            return 'fa-file-pdf';
        case 'xls':
        case 'xlsx':
            return 'fa-file-excel';
        case 'ppt':
        case 'pptx':
            return 'fa-file-powerpoint';
        case 'zip':
        case 'rar':
        case '7z':
            return 'fa-file-archive';
        case 'txt':
            return 'fa-file-alt';
        case 'mp3':
        case 'wav':
        case 'ogg':
            return 'fa-file-audio';
        default:
            return 'fa-file';
    }
}

// ===================== EVENT LISTENERS =====================
function setupEventListeners() {
    // Utility to attach safely
    function safeAdd(selectorOrId, event, handler, queryAll = false) {
        try {
            if (queryAll) {
                const nodes = document.querySelectorAll(selectorOrId);
                nodes.forEach(n => n && n.addEventListener(event, handler));
            } else {
                const el = document.getElementById(selectorOrId);
                if (el) el.addEventListener(event, handler);
            }
        } catch (err) {
            // ignore
        }
    }

    // Search & filters
    safeAdd('resource-search', 'input', filterResources);
    safeAdd('category-filter', 'change', filterResources);
    safeAdd('access-filter', 'change', filterResources);

    // Add resource - only allow if user can modify
    const addBtn = document.getElementById('add-resource-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            if (!window.currentUserCanModifyResources) {
                Swal.fire('Permission Denied', 'You do not have permission to add resources.', 'warning');
                return;
            }
            openAddResourceModal();
        });
    }

    // Toggle between file/link input
    safeAdd('resource-category', 'change', toggleResourceInput);

    // Submit resource form
    safeAdd('resource-form', 'submit', (e) => {
        e.preventDefault();
        if (!window.currentUserCanModifyResources) {
            Swal.fire('Permission Denied', 'You do not have permission to save resources.', 'warning');
            return;
        }
        handleResourceSubmit(e);
    });

    // Modal close
    document.querySelectorAll('.close-modal').forEach(el => el.addEventListener('click', closeModals));
    safeAdd('cancel-resource-btn', 'click', closeModals);

    // Click outside to close
    window.addEventListener('click', function(event) {
        if (event.target.classList && event.target.classList.contains('modal')) {
            closeModals();
        }
    });
}

// ===================== LOAD RESOURCES =====================
function loadResources() {
    showLoading(true);
    const db = firebase.database();
    db.ref('resources').once('value').then(snapshot => {
        resources = [];
        snapshot.forEach(childSnapshot => {
            const resource = childSnapshot.val();
            resource.id = childSnapshot.key;
            resources.push(resource);
        });

        updateResourceStats();
        displayResources(resources);
        showLoading(false);
    }).catch(err => {
        console.error('Error loading resources:', err);
        showLoading(false);
        showNoResourcesMessage(true);
        Swal.fire('Error', 'Failed to load resources. Please try again.', 'error');
    });
}

// ===================== STATS =====================
function updateResourceStats() {
    document.getElementById('total-resources').textContent = resources.length;
    document.getElementById('document-resources').textContent = resources.filter(r => r.category === 'documents').length;
    document.getElementById('video-resources').textContent = resources.filter(r => r.category === 'videos').length;
    document.getElementById('link-resources').textContent = resources.filter(r => r.category === 'links').length;
}

// ===================== DISPLAY =====================
function displayResources(resourcesToDisplay) {
    const resourcesGrid = document.getElementById('resources-grid');
    resourcesGrid.innerHTML = '';

    if (!resourcesToDisplay || resourcesToDisplay.length === 0) {
        showNoResourcesMessage(true);
        return;
    }
    showNoResourcesMessage(false);

    // Apply accessLevel restriction for staff without upload permission
    const filteredResources = resourcesToDisplay.filter(r => {
        if (!window.currentUserCanModifyResources && window.currentUserRole === 'staff') {
            return r.accessLevel === 'public' || r.accessLevel === 'staff';
        }
        return true; // admins and staff with upload permission see everything
    });

    filteredResources.forEach(resource => {
        // formatted date
        let formattedDate = '';
        try {
            formattedDate = new Date(resource.uploadDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (err) {
            formattedDate = '';
        }

        const icons = { documents: '📄', videos: '🎬', images: '🖼️', links: '🔗' };
        const accessMap = { public: 'Public', members: 'Members Only', staff: 'Staff Only' };

        let actionsHtml = '';
        if (resource.category === 'links') {
            actionsHtml += `<button class="action-btn view-btn" data-id="${resource.id}" title="Open Link"><i class="fas fa-external-link-alt"></i></button>`;
        } else {
            actionsHtml += `<button class="action-btn preview-btn" data-id="${resource.id}" title="Preview"><i class="fas fa-eye"></i></button>`;
        }

        if (window.currentUserCanModifyResources) {
            actionsHtml += `<button class="action-btn edit-btn" data-id="${resource.id}" title="Edit"><i class="fas fa-edit"></i></button>`;
            actionsHtml += `<button class="action-btn delete-btn" data-id="${resource.id}" title="Delete"><i class="fas fa-trash"></i></button>`;
        }

        const card = document.createElement('div');
        card.className = 'resource-card';
        card.innerHTML = `
            <div class="resource-card-header">
                <div class="resource-type">${icons[resource.category] || ''} ${capitalize(resource.category || '')}</div>
                <div class="resource-access">${accessMap[resource.accessLevel] || ''}</div>
            </div>
            <div class="resource-card-body">
                <h3 class="resource-name">${escapeHtml(resource.name)}</h3>
                <p class="resource-description">${escapeHtml(resource.description || 'No description provided')}</p>
                <div class="resource-meta"><span class="resource-date">${formattedDate}</span></div>
            </div>
            <div class="resource-card-actions">
                ${actionsHtml}
            </div>
        `;
        resourcesGrid.appendChild(card);
    });

    // Attach listeners for action buttons (same as before)
    document.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        viewResource(id);
    }));
    document.querySelectorAll('.preview-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        previewResource(id);
    }));
    document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (!window.currentUserCanModifyResources) {
            Swal.fire('Permission Denied', 'You do not have permission to edit resources.', 'warning');
            return;
        }
        editResource(id);
    }));
    document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (!window.currentUserCanModifyResources) {
            Swal.fire('Permission Denied', 'You do not have permission to delete resources.', 'warning');
            return;
        }
        showDeleteConfirmation(id);
    }));
}

// ===================== FILTERS =====================
function filterResources() {
    const searchTerm = (document.getElementById('resource-search')?.value || '').toLowerCase();
    const categoryFilter = document.getElementById('category-filter')?.value || 'all';
    const accessFilter = document.getElementById('access-filter')?.value || 'all';

    let filtered = [...resources];

    if (searchTerm) {
        filtered = filtered.filter(r =>
            (r.name && r.name.toLowerCase().includes(searchTerm)) ||
            (r.description && r.description.toLowerCase().includes(searchTerm))
        );
    }

    if (categoryFilter !== 'all') filtered = filtered.filter(r => r.category === categoryFilter);
    if (accessFilter !== 'all') filtered = filtered.filter(r => r.accessLevel === accessFilter);

    displayResources(filtered);
}

// ===================== FORM & MODAL HELPERS =====================
function openAddResourceModal() {
    if (!window.currentUserCanModifyResources) {
        Swal.fire('Permission Denied', 'You do not have permission to add resources.', 'warning');
        return;
    }
    currentEditId = null;
    uploadedFileData = null;
    document.getElementById('resource-modal-title').textContent = 'Add New Resource';
    document.getElementById('resource-form').reset();
    document.getElementById('uploaded-file-info').style.display = 'none';
    document.getElementById('file-upload-group').style.display = 'block';
    document.getElementById('external-link-group').style.display = 'none';
    document.getElementById('resource-modal').style.display = 'flex';
}

function toggleResourceInput() {
    const category = document.getElementById('resource-category')?.value;
    if (category === 'links') {
        document.getElementById('file-upload-group').style.display = 'none';
        document.getElementById('external-link-group').style.display = 'block';
    } else {
        document.getElementById('file-upload-group').style.display = 'block';
        document.getElementById('external-link-group').style.display = 'none';
    }
}

function handleResourceSubmit(e) {
    e.preventDefault();

    if (!window.currentUserCanModifyResources) {
        Swal.fire('Permission Denied', 'You do not have permission to save resources.', 'warning');
        return;
    }

    const name = document.getElementById('resource-name')?.value?.trim();
    const description = document.getElementById('resource-description')?.value?.trim();
    const category = document.getElementById('resource-category')?.value;
    const accessLevel = document.getElementById('resource-access')?.value;
    const externalLink = document.getElementById('resource-link')?.value?.trim();

    if (!name) {
        Swal.fire('Error', 'Resource name is required.', 'error');
        return;
    }

    if (category !== 'links' && !uploadedFileData && !currentEditId) {
        Swal.fire('Error', 'Please upload a file.', 'error');
        return;
    }

    if (category === 'links' && !externalLink) {
        Swal.fire('Error', 'Please enter a valid URL.', 'error');
        return;
    }

    const submitBtn = document.getElementById('submit-resource-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }

    // Map audio uploads to 'audio' category unless the user already selected 'audio'
    let finalCategory = category;
    const uploadedFormat = (uploadedFileData && (uploadedFileData.format || uploadedFileData.resource_type)) ? (uploadedFileData.format || '').toLowerCase() : null;
    if (uploadedFormat && ['mp3','wav','ogg','m4a'].includes(uploadedFormat) && finalCategory !== 'audio') {
        finalCategory = 'audio';
    }

    if (currentEditId) {
        updateResource(currentEditId, name, description, finalCategory, accessLevel, externalLink);
    } else {
        if (category === 'links') {
            saveResourceToDatabase(name, description, finalCategory, accessLevel, externalLink);
        } else {
            saveResourceToDatabase(name, description, finalCategory, accessLevel, uploadedFileData.secure_url, uploadedFileData);
        }
    }
}

// ===================== CRUD: SAVE / UPDATE / DELETE =====================
function saveResourceToDatabase(name, description, category, accessLevel, fileUrl, cloudinaryData = null) {
    if (!window.currentUserCanModifyResources) {
        Swal.fire('Permission Denied', 'You do not have permission to add resources.', 'warning');
        return;
    }

    const db = firebase.database();
    const currentUser = firebase.auth().currentUser;

    const resourceData = {
        name,
        description,
        category,
        accessLevel,
        fileUrl: fileUrl || '',
        uploadDate: Date.now(),
        uploadedBy: currentUser ? currentUser.uid : 'unknown'
    };

    if (cloudinaryData) resourceData.cloudinaryData = cloudinaryData;

    const ref = currentEditId ? db.ref('resources/' + currentEditId) : db.ref('resources').push();

    ref.set(resourceData).then(() => {
        Swal.fire('Success', `Resource ${currentEditId ? 'updated' : 'added'} successfully!`, 'success');
        closeModals();
        loadResources();

        const submitBtn = document.getElementById('submit-resource-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Resource';
        }

        // 🔹 Log to activity table only if user can announce
        if (!currentEditId && window.currentUserCanAnnounce) {
            logResourceActivity(resourceData, ref.key, resourceData.uploadedBy);
        }
    }).catch(err => {
        console.error('Error saving resource:', err);
        Swal.fire('Error', 'Failed to save resource. Please try again.', 'error');
        const submitBtn = document.getElementById('submit-resource-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Resource';
        }
    });
}

function updateResource(resourceId, name, description, category, accessLevel, externalLink) {
    if (!window.currentUserCanModifyResources) {
        Swal.fire('Permission Denied', 'You do not have permission to update resources.', 'warning');
        return;
    }

    const db = firebase.database();
    const resourceRef = db.ref('resources/' + resourceId);

    resourceRef.once('value').then(snapshot => {
        const resourceData = snapshot.val() || {};

        const updatedData = {
            name,
            description,
            category,
            accessLevel,
            fileUrl: category === 'links' ? externalLink : (resourceData.fileUrl || ''),
            uploadDate: resourceData.uploadDate || Date.now(),
            uploadedBy: resourceData.uploadedBy || (firebase.auth().currentUser?.uid || 'unknown')
        };

        if (resourceData.cloudinaryData) updatedData.cloudinaryData = resourceData.cloudinaryData;

        if (category !== 'links' && uploadedFileData) {
            let finalUrl = uploadedFileData.secure_url;
            try {
                if ((uploadedFileData.format || '').toLowerCase() === 'pdf') {
                    const cloudName = window.cloudinaryConfig?.cloudName || null;
                    const publicId = uploadedFileData.public_id;
                    const version = uploadedFileData.version;
                    if (cloudName && publicId) {
                        finalUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${version ? 'v' + version + '/' : ''}${publicId}.${uploadedFileData.format}`;
                    }
                }
            } catch (e) {
                finalUrl = uploadedFileData.secure_url;
            }
            updatedData.fileUrl = finalUrl;
            updatedData.cloudinaryData = uploadedFileData;
        }

        resourceRef.set(updatedData).then(() => {
            // Update activity_table entries related to this resource (if any)
            db.ref('activity_table').orderByChild('resourceId').equalTo(resourceId).once('value', (snap) => {
                snap.forEach(child => {
                    const key = child.key;
                    db.ref('activity_table/' + key).update({
                        resourceName: updatedData.name,
                        category: updatedData.category,
                        accessLevel: updatedData.accessLevel
                    });
                });
            });

            Swal.fire('Success', 'Resource updated successfully!', 'success');
            closeModals();
            loadResources();

            const submitBtn = document.getElementById('submit-resource-btn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Resource';
            }
        }).catch(err => {
            console.error('Error updating resource:', err);
            Swal.fire('Error', 'Failed to update resource. Please try again.', 'error');

            const submitBtn = document.getElementById('submit-resource-btn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Resource';
            }
        });
    });
}

function showDeleteConfirmation(resourceId) {
    if (!window.currentUserCanModifyResources) {
        Swal.fire('Permission Denied', 'You do not have permission to delete resources.', 'warning');
        return;
    }
    currentDeleteId = resourceId;
    // Using SweetAlert confirm instead of a dedicated modal for simplicity
    Swal.fire({
        title: 'Are you sure?',
        text: 'This will permanently delete the resource.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, delete it!'
    }).then(result => {
        if (result.isConfirmed) confirmDeleteResource();
    });
}

function confirmDeleteResource() {
    if (!currentDeleteId) return;
    if (!window.currentUserCanModifyResources) {
        Swal.fire('Permission Denied', 'You do not have permission to delete resources.', 'warning');
        return;
    }

    const db = firebase.database();
    db.ref('resources/' + currentDeleteId).remove().then(() => {
        Swal.fire('Deleted!', 'Resource deleted successfully.', 'success');
        closeModals();
        loadResources();
    }).catch(err => {
        console.error('Error deleting resource:', err);
        Swal.fire('Error', 'Failed to delete resource. Please try again.', 'error');
    });
}

// ===================== PREVIEW / VIEW / DOWNLOAD =====================
function viewResource(resourceId) {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;
    if (!resource.fileUrl) {
        Swal.fire('No link', 'This resource does not have a link to open.', 'info');
        return;
    }
    window.open(resource.fileUrl, '_blank');
}

function previewResource(resourceId) {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    const previewModal = document.getElementById('preview-modal');
    const previewContent = document.getElementById('preview-content');
    const previewTitle = document.getElementById('preview-modal-title');

    previewTitle.textContent = resource.name || 'Resource Preview';

    if (resource.category === 'images') {
        previewContent.innerHTML = `
            <img src="${resource.fileUrl}" alt="${escapeHtml(resource.name)}">
            <div style="margin-top:20px;">
                <a href="${resource.fileUrl}" download="${escapeHtml(resource.name)}" class="download-btn"><i class="fas fa-download"></i> Download Image</a>
            </div>
        `;
    } else if (resource.category === 'videos') {
        previewContent.innerHTML = `
            <video controls style="max-width:100%;">
                <source src="${resource.fileUrl}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
            <div style="margin-top:20px;">
                <a href="${resource.fileUrl}" download="${escapeHtml(resource.name)}" class="download-btn"><i class="fas fa-download"></i> Download Video</a>
            </div>
        `;
    } else if (resource.category === 'audio' || (resource.fileUrl || '').split('.').pop().toLowerCase().match(/^(mp3|wav|ogg|m4a)$/)) {
        previewContent.innerHTML = `
            <audio controls style="width:100%;">
                <source src="${resource.fileUrl}" type="audio/${(resource.cloudinaryData?.format || '').toLowerCase() || 'mpeg'}">
                Your browser does not support the audio element.
            </audio>
            <div style="margin-top:12px;">
                <a href="${resource.fileUrl}" download="${escapeHtml(resource.name)}" class="download-btn"><i class="fas fa-download"></i> Download Audio</a>
            </div>
        `;
    } else if (resource.category === 'documents') {
        const fileUrl = resource.fileUrl || '';
        const extFromCloud = resource.cloudinaryData?.format || '';
        let ext = '';
        if (extFromCloud) ext = extFromCloud.toLowerCase();
        else if (fileUrl) {
            const parts = fileUrl.split('.');
            ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
        }

        let iframeSrc = null;
        if (ext === 'pdf') {
            iframeSrc = fileUrl;
        } else if (['doc','docx','ppt','pptx','xls','xlsx'].includes(ext)) {
            iframeSrc = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fileUrl)}`;
        }

        if (iframeSrc) {
            previewContent.innerHTML = `
                <div style="width:100%;height:80vh;">
                    <iframe src="${iframeSrc}" frameborder="0" style="width:100%;height:100%;"></iframe>
                </div>
                <div style="margin-top:12px;">
                    <a href="${fileUrl}" download="${escapeHtml(resource.name)}" class="download-btn"><i class="fas fa-download"></i> Download Document</a>
                </div>
            `;
        } else {
            let fileExtension = ext || 'file';
            const iconClass = getFileIconClass(fileExtension);
            previewContent.innerHTML = `
                <div class="file-preview-icon">
                    <i class="fas ${iconClass}" style="font-size:64px;"></i>
                </div>
                <p>This document cannot be previewed in the browser.</p>
                <div style="margin-top:20px;">
                    <a href="${resource.fileUrl}" download="${escapeHtml(resource.name)}" class="download-btn"><i class="fas fa-download"></i> Download Document</a>
                </div>
            `;
        }
    } else if (resource.category === 'links') {
        previewContent.innerHTML = `<p><a href="${resource.fileUrl}" target="_blank">${resource.fileUrl}</a></p>`;
    } else {
        previewContent.innerHTML = `<p>No preview available.</p>`;
    }

    previewModal.style.display = 'flex';
}

// ===================== ACTIVITY LOG =====================
function logResourceActivity(resourceData, resourceId, userId) {
    const db = firebase.database();
    const activity = {
        type: 'resource_upload',
        resourceId,
        resourceName: resourceData.name,
        category: resourceData.category,
        accessLevel: resourceData.accessLevel,
        uploadedBy: userId,
        timestamp: Date.now(),
        readBy: {}
    };
    db.ref('activity_table').push(activity);
}

// ===================== MODALS & UTIL =====================
function editResource(resourceId) {
    if (!window.currentUserCanModifyResources) {
        Swal.fire('Permission Denied', 'You do not have permission to edit resources.', 'warning');
        return;
    }

    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    currentEditId = resourceId;
    document.getElementById('resource-modal-title').textContent = 'Edit Resource';
    document.getElementById('resource-name').value = resource.name || '';
    document.getElementById('resource-description').value = resource.description || '';
    document.getElementById('resource-category').value = resource.category || 'documents';
    document.getElementById('resource-access').value = resource.accessLevel || 'public';

    if (resource.category === 'links') {
        document.getElementById('resource-link').value = resource.fileUrl || '';
        document.getElementById('file-upload-group').style.display = 'none';
        document.getElementById('external-link-group').style.display = 'block';
    } else {
        document.getElementById('file-upload-group').style.display = 'block';
        document.getElementById('external-link-group').style.display = 'none';

        if (resource.cloudinaryData) {
            uploadedFileData = resource.cloudinaryData;
            const fileInfoDiv = document.getElementById('uploaded-file-info');
            const filePreview = document.getElementById('file-preview');
            const fileName = document.getElementById('file-name');

            if (fileInfoDiv) fileInfoDiv.style.display = 'block';

            let fileExtension = uploadedFileData.format || '';
            if (!fileExtension && uploadedFileData.original_filename) {
                const parts = uploadedFileData.original_filename.split('.');
                if (parts.length > 1) fileExtension = parts.pop();
            }

            if (fileName) fileName.textContent = uploadedFileData.original_filename + (fileExtension ? '.' + fileExtension : '');

            if (filePreview) {
                if (uploadedFileData.resource_type === 'image') {
                    filePreview.innerHTML = `<img src="${uploadedFileData.secure_url}" alt="${uploadedFileData.original_filename}">`;
                } else if (uploadedFileData.resource_type === 'video') {
                    filePreview.innerHTML = `<video controls><source src="${uploadedFileData.secure_url}" type="video/${uploadedFileData.format}"></video>`;
                } else {
                    const iconClass = getFileIconClass(fileExtension || uploadedFileData.resource_type);
                    filePreview.innerHTML = `<div class="file-preview-icon"><i class="fas ${iconClass}"></i></div>`;
                }
            }
        }
    }

    document.getElementById('resource-modal').style.display = 'flex';
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
    currentEditId = null;
    currentDeleteId = null;
    uploadedFileData = null;
    const submitBtn = document.getElementById('submit-resource-btn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Resource';
    }
}

function showLoading(show) {
    const el = document.getElementById('loading-indicator');
    if (el) el.style.display = show ? 'block' : 'none';
}

function showNoResourcesMessage(show) {
    const el = document.getElementById('no-resources-message');
    const grid = document.getElementById('resources-grid');
    if (el) el.style.display = show ? 'block' : 'none';
    if (grid) grid.style.display = show ? 'none' : 'grid';
}

// ===================== SMALL HELPERS =====================
function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function escapeHtml(text) {
    if (!text && text !== '') return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
