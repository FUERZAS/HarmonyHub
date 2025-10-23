// User Management JavaScript with Real-Time Updates
document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const usersGrid = document.getElementById('users-grid');
    const loadingIndicator = document.getElementById('loading-indicator');
    const noUsersMessage = document.getElementById('no-users-message');
    const searchInput = document.getElementById('user-search');
    const roleFilter = document.getElementById('role-filter');
    const statusFilter = document.getElementById('status-filter');
    
    // Statistics elements
    const totalUsersEl = document.getElementById('total-users');
    const verifiedUsersEl = document.getElementById('verified-users');
    const pendingUsersEl = document.getElementById('pending-users');
    const staffUsersEl = document.getElementById('staff-users');
    
    // Modals
    const userDetailModal = document.getElementById('user-detail-modal');
    const permissionsModal = document.getElementById('permissions-modal');
    const closeModalBtns = document.querySelectorAll('.close-modal');
    
    // User data
    let users = [];
    let currentEditingUser = null;
    
    // Firebase references
    let usersRef;
    let usersListener;
    
    // Initialize
    initUserManagement();
    
    function initUserManagement() {
        setupEventListeners();

        // Wait until Firebase Auth confirms the logged-in user
        auth.onAuthStateChanged(user => {
            if (!user) {
                console.error("No authenticated user. Access denied.");
                showAlert("error", "Unauthorized", "You must be logged in as an admin.");
                setTimeout(() => {
                window.location.href = '/index.html'; // Redirect to login
                }, 2000);
                return;
            }

            // Check user role in DB
            database.ref(`users/${user.uid}`).once("value")
                .then(snapshot => {
                    const currentUser = snapshot.val();
                    console.log("Authenticated user:", user);
                    console.log("Current user data:", currentUser);
                    if (!currentUser || currentUser.role !== "admin") {
                        console.error("User is not admin:", currentUser);
                        showAlert("error", "Access Denied", "You do not have admin privileges.");
                        return;
                    }

                    // Admin confirmed -> setup listener
                    usersRef = database.ref("users");
                    setupRealtimeUsersListener();
                })
                .catch(err => {
                    console.error("Error checking current user role:", err);
                    showAlert("error", "Error", "Failed to verify admin access.");
                });
        });
    }
    
    function setupEventListeners() {
        searchInput.addEventListener('input', filterUsers);
        roleFilter.addEventListener('change', filterUsers);
        statusFilter.addEventListener('change', filterUsers);

        closeModalBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                userDetailModal.style.display = 'none';
                permissionsModal.style.display = 'none';
            });
        });

        window.addEventListener('click', (e) => {
            if (e.target === userDetailModal) {
                userDetailModal.style.display = 'none';
            }
            if (e.target === permissionsModal) {
                permissionsModal.style.display = 'none';
            }
        });
    }
    
    function setupRealtimeUsersListener() {
        loadingIndicator.style.display = 'flex';
        usersGrid.innerHTML = '';

        if (usersListener) {
            usersRef.off('value', usersListener);
        }

        usersListener = usersRef.on('value', snapshot => {
            users = [];
            let staffCount = 0;

            snapshot.forEach(userSnapshot => {
                const userData = userSnapshot.val();
                if (userData.role !== 'admin') {
                    users.push({
                        id: userSnapshot.key,
                        ...userData
                    });

                    if (userData.role === 'staff') staffCount++;
                }
            });

            renderUsers(users);
            updateStatistics(users, staffCount);
            loadingIndicator.style.display = 'none';
        }, error => {
            console.error('Error loading users:', error);
            showAlert('error', 'Error', 'Failed to load users. Check database rules.');
            loadingIndicator.style.display = 'none';
        });
    }
    
    function renderUsers(usersToRender) {
        usersGrid.innerHTML = '';
        if (usersToRender.length === 0) {
            noUsersMessage.style.display = 'block';
            return;
        }
        noUsersMessage.style.display = 'none';
        usersToRender.forEach(user => {
            usersGrid.appendChild(createUserCard(user));
        });
    }
    
    function createUserCard(user) {
        const card = document.createElement('div');
        card.className = 'user-card';
        card.dataset.userId = user.id;

        const initials = user.name
            ? user.name.split(' ').length > 1
                ? (user.name.split(' ')[0][0] + user.name.split(' ').slice(-1)[0][0]).toUpperCase()
                : user.name.substring(0, 2).toUpperCase()
            : 'UU';

        const isVerified = user.isVerified || false;
        const statusText = isVerified ? 'Verified' : 'Pending';
        const statusClass = isVerified ? 'status-verified' : 'status-pending';

        card.innerHTML = `
            <div class="user-card-header">
                <div class="user-avatar-large">${initials}</div>
                <div class="user-card-info">
                    <h3>${user.name || 'Unknown'}</h3>
                    <p>${user.role || 'No role'} • <span class="status-badge ${statusClass}">${statusText}</span></p>
                </div>
            </div>
            <div class="user-card-details">
                <div class="user-detail-item">
                    <span class="user-detail-label">Email:</span>
                    <span class="user-detail-value">${user.email || 'Unknown'}</span>
                </div>
                <div class="user-detail-item">
                    <span class="user-detail-label">Joined:</span>
                    <span class="user-detail-value">${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}</span>
                </div>
            </div>
            <div class="user-card-actions">
                ${!isVerified ? `
                    <button class="user-action-btn btn-verify" data-userid="${user.id}" data-action="verify">
                        <i class="fas fa-check-circle"></i> Verify User
                    </button>` : ''}
                ${user.role === 'member' && isVerified ? `
                    <button class="user-action-btn btn-promote" data-userid="${user.id}" data-action="promote">
                        <i class="fas fa-level-up-alt"></i> Promote User
                    </button>` : user.role === 'staff' && isVerified ? `
                    <button class="user-action-btn btn-permissions" data-userid="${user.id}" data-action="permissions">
                        <i class="fas fa-key"></i> Manage Permissions
                    </button>
                    <button class="user-action-btn btn-demote" data-userid="${user.id}" data-action="demote">
                        <i class="fas fa-level-down-alt"></i> Demote User
                    </button>` : ''}
                <button class="user-action-btn btn-delete" data-userid="${user.id}" data-action="delete">
                    <i class="fas fa-trash"></i> Delete User
                </button>
            </div>
        `;

        setTimeout(() => {
            card.querySelectorAll('.user-action-btn').forEach(button => {
                button.addEventListener('click', handleUserAction);
            });
        }, 0);

        return card;
    }
    
    function handleUserAction(e) {
        const userId = e.currentTarget.dataset.userid;
        const action = e.currentTarget.dataset.action;
        const user = users.find(u => u.id === userId);
        
        if (!user) return;
        
        switch(action) {
            case 'verify':
                verifyUser(user);
                break;
            case 'promote':
                promoteUser(user);
                break;
            case 'demote':
                demoteUser(user);
                break;
            case 'permissions':
                showPermissions(user);
                break;
            case 'delete':
                deleteUser(user);
                break;
        }
    }
    
    function verifyUser(user) {
        Swal.fire({
            title: 'Verify User',
            text: `Are you sure you want to verify ${user.name}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, verify!'
        }).then((result) => {
            if (result.isConfirmed) {
                // Update user verification status in Firebase
                database.ref(`users/${user.id}/isVerified`).set(true)
                    .then(() => {
                        showAlert('success', 'Success!', 'User has been verified.');
                        // No need to reload users - real-time listener will update automatically
                    })
                    .catch(error => {
                        console.error('Error verifying user:', error);
                        showAlert('error', 'Error', 'Failed to verify user. Please try again.');
                    });
            }
        });
    }
    
    function promoteUser(user) {
        // Show promotion modal with permission toggles
        showPromotionModal(user);
    }
    
    function showPromotionModal(user) {
        // Create modal HTML with permission switches
        const modalHTML = `
            <div class="modal promotion-modal" id="promotion-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Promote ${user.name || user.email}</h2>
                        <span class="close-modal">&times;</span>
                    </div>
                    <div class="modal-body">
                        <p>Set permissions for this staff member:</p>
                        
                        <div class="permissions-list">
                            <div class="permission-item">
                                <label class="switch">
                                    <input type="checkbox" id="canVerifyUsers" checked>
                                    <span class="slider round"></span>
                                </label>
                                <span class="permission-label">Verify Users</span>
                            </div>
                            
                            <div class="permission-item">
                                <label class="switch">
                                    <input type="checkbox" id="canPromoteUsers" checked>
                                    <span class="slider round"></span>
                                </label>
                                <span class="permission-label">Promote Users</span>
                            </div>
                            
                            <div class="permission-item">
                                <label class="switch">
                                    <input type="checkbox" id="canInitializeMeetings" checked>
                                    <span class="slider round"></span>
                                </label>
                                <span class="permission-label">Initialize Meetings</span>
                            </div>
                            
                            <div class="permission-item">
                                <label class="switch">
                                    <input type="checkbox" id="canAnnounce" checked>
                                    <span class="slider round"></span>
                                </label>
                                <span class="permission-label">Make Announcements</span>
                            </div>
                            
                            <div class="permission-item">
                                <label class="switch">
                                    <input type="checkbox" id="canUploadResources" checked>
                                    <span class="slider round"></span>
                                </label>
                                <span class="permission-label">Upload Resources</span>
                            </div>
                            
                            <div class="permission-item">
                                <label class="switch">
                                    <input type="checkbox" id="canAppointSchedules" checked>
                                    <span class="slider round"></span>
                                </label>
                                <span class="permission-label">Appoint Schedules</span>
                            </div>
                        </div>
                        
                        <div class="modal-actions">
                            <button class="btn-secondary" id="cancel-promotion">Cancel</button>
                            <button class="btn-primary" id="confirm-promotion">Promote User</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to the document
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Get the modal element
        const promotionModal = document.getElementById('promotion-modal');
        
        // Show the modal
        promotionModal.style.display = 'block';
        
        // Set up event listeners
        const closeModalBtn = promotionModal.querySelector('.close-modal');
        const cancelBtn = promotionModal.querySelector('#cancel-promotion');
        const confirmBtn = promotionModal.querySelector('#confirm-promotion');
        
        // Close modal function
        const closeModal = () => {
            promotionModal.style.display = 'none';
            // Remove modal from DOM after animation completes
            setTimeout(() => {
                promotionModal.remove();
            }, 300);
        };
        
        // Event listeners
        closeModalBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        confirmBtn.addEventListener('click', () => {
            // Get all selected permissions
            const permissions = {
                canVerifyUsers: document.getElementById('canVerifyUsers').checked,
                canPromoteUsers: document.getElementById('canPromoteUsers').checked,
                canInitializeMeetings: document.getElementById('canInitializeMeetings').checked,
                canAnnounce: document.getElementById('canAnnounce').checked,
                canUploadResources: document.getElementById('canUploadResources').checked,
                canAppointSchedules: document.getElementById('canAppointSchedules').checked
            };
            
            // Update user role and permissions in Firebase
            const updates = {};
            updates[`users/${user.id}/role`] = 'staff';
            updates[`users/${user.id}/permissions`] = permissions;
            
            database.ref().update(updates)
                .then(() => {
                    showAlert('success', 'Success!', `${user.name || user.email} has been promoted to Staff.`);
                    // No need to reload users - real-time listener will update automatically
                    closeModal();
                })
                .catch(error => {
                    console.error('Error promoting user:', error);
                    showAlert('error', 'Error', 'Failed to promote user. Please try again.');
                    closeModal();
                });
        });
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === promotionModal) {
                closeModal();
            }
        });
    }
    
    function demoteUser(user) {
        Swal.fire({
            title: 'Demote User',
            text: `Are you sure you want to demote ${user.name} to Member role?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, demote!'
        }).then((result) => {
            if (result.isConfirmed) {
                const updates = {};
                updates[`users/${user.id}/role`] = 'member';
                updates[`users/${user.id}/permissions`] = {
                    canAnnounce: false,
                    canAppointSchedules: false,
                    canInitializeMeetings: false,
                    canPromoteUsers: false,
                    canUploadResources: false,
                    canVerifyUsers: false
                };

                database.ref().update(updates)
                    .then(() => {
                        showAlert('success', 'Success!', 'User has been demoted to Member.');
                        // No need to reload users - real-time listener will update automatically
                    })
                    .catch(error => {
                        console.error('Error demoting user:', error);
                        showAlert('error', 'Error', 'Failed to demote user. Please try again.');
                    });
            }
        });
    }
    
    function showPermissions(user) {
        currentEditingUser = user;
        
        // Fetch permissions from Firebase
        database.ref(`users/${user.id}/permissions`).once('value')
            .then(snapshot => {
                const permissions = snapshot.val() || {};
                
                // Create permissions content with toggle switches
                let permissionsHTML = `
                    <h3>Permissions for ${user.name || user.email}</h3>
                    <p class="permissions-subtitle">Toggle permissions for this staff member:</p>
                    <div class="permissions-list">
                `;
                
                // List all permissions with toggle switches
                for (const [key, value] of Object.entries(permissions)) {
                    const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    const isChecked = value === true;
                    
                    permissionsHTML += `
                        <div class="permission-item">
                            <label class="switch">
                                <input type="checkbox" id="perm-${key}" ${isChecked ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                            <span class="permission-label">${formattedKey}</span>
                        </div>
                    `;
                }
                
                permissionsHTML += `</div>
                    <div class="modal-actions">
                        <button class="btn-secondary" id="cancel-permissions">Cancel</button>
                        <button class="btn-primary" id="save-permissions">Save Changes</button>
                    </div>
                `;
                
                // Show modal
                document.getElementById('permissions-content').innerHTML = permissionsHTML;
                permissionsModal.style.display = 'block';
                
                // Add event listeners for save button
                document.getElementById('save-permissions').addEventListener('click', savePermissions);
                document.getElementById('cancel-permissions').addEventListener('click', () => {
                    permissionsModal.style.display = 'none';
                });
            })
            .catch(error => {
                console.error('Error fetching permissions:', error);
                showAlert('error', 'Error', 'Failed to load permissions. Please try again.');
            });
    }
    
    function savePermissions() {
        if (!currentEditingUser) return;
        
        // Get all permission toggles
        const permissionCheckboxes = document.querySelectorAll('#permissions-content input[type="checkbox"]');
        const updatedPermissions = {};
        
        permissionCheckboxes.forEach(checkbox => {
            const permissionId = checkbox.id.replace('perm-', '');
            updatedPermissions[permissionId] = checkbox.checked;
        });
        
        // Update permissions in Firebase
        database.ref(`users/${currentEditingUser.id}/permissions`).set(updatedPermissions)
            .then(() => {
                showAlert('success', 'Success!', 'Permissions updated successfully.');
                permissionsModal.style.display = 'none';
                // No need to reload users - real-time listener will update automatically
            })
            .catch(error => {
                console.error('Error updating permissions:', error);
                showAlert('error', 'Error', 'Failed to update permissions. Please try again.');
            });
    }
    
    function deleteUser(user) {
        Swal.fire({
            title: 'Delete User',
            text: `Are you sure you want to delete ${user.name || user.email}? This action cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete!'
        }).then((result) => {
            if (result.isConfirmed) {
                // Delete user from Firebase
                database.ref(`users/${user.id}`).remove()
                    .then(() => {
                        showAlert('success', 'Deleted!', 'User has been deleted successfully.');
                        // No need to reload users - real-time listener will update automatically
                    })
                    .catch(error => {
                        console.error('Error deleting user:', error);
                        showAlert('error', 'Error', 'Failed to delete user. Please try again.');
                    });
            }
        });
    }
    
    function filterUsers() {
        const searchTerm = searchInput.value.toLowerCase();
        const roleFilterValue = roleFilter.value;
        const statusFilterValue = statusFilter.value;

        const filteredUsers = users.filter(user => {
            const matchesSearch = user.email.toLowerCase().includes(searchTerm) || 
                                (user.name && user.name.toLowerCase().includes(searchTerm));
            const matchesRole = roleFilterValue === 'all' || user.role === roleFilterValue;
            let matchesStatus = true;
            if (statusFilterValue === 'verified') {
                matchesStatus = user.isVerified === true;
            } else if (statusFilterValue === 'pending') {
                matchesStatus = user.isVerified !== true;
            }
            return matchesSearch && matchesRole && matchesStatus;
        });
        renderUsers(filteredUsers);
    }
    
    function updateStatistics(usersList, staffCount) {
        const total = usersList.length;
        const verified = usersList.filter(user => user.isVerified).length;
        const pending = total - verified;

        totalUsersEl.textContent = total;
        verifiedUsersEl.textContent = verified;
        pendingUsersEl.textContent = pending;
        staffUsersEl.textContent = staffCount;
    }
    
    // Clean up Firebase listeners when leaving the page
    window.addEventListener('beforeunload', () => {
        if (usersListener) usersRef.off('value', usersListener);
    });

    function showAlert(icon, title, text, confirmButtonText = 'OK') {
        return Swal.fire({
            icon,
            title,
            text,
            background: '#2c3e50',
            color: '#fff',
            iconColor: icon === 'error' ? '#f44336' : (icon === 'success' ? '#4caf50' : (icon === 'warning' ? '#ff9800' : '#2196f3')),
            confirmButtonText,
            confirmButtonColor: '#6e8efb'
        });
    }
});