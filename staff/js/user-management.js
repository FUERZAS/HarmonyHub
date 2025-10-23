// user-management.js (staff)
document.addEventListener('DOMContentLoaded', function() {
    const usersGrid = document.getElementById('users-grid');
    const loadingIndicator = document.getElementById('loading-indicator');
    const noUsersMessage = document.getElementById('no-users-message');

    const totalUsersEl = document.getElementById('total-users');
    const verifiedUsersEl = document.getElementById('verified-users');
    const pendingUsersEl = document.getElementById('pending-users');
    const staffUsersEl = document.getElementById('staff-users');

    let users = [];
    let currentEditingUser = null;

    const availablePermissions = [
        'canPromoteUsers',
        'canVerifyUsers',
        'canInitializeMeetings',
        'canUploadResources',
        'canAnnounce',
        'canAppointSchedules'
    ];

    let usersRef;
    let usersListener;

    initUserManagement();

    async function initUserManagement() {
        auth.onAuthStateChanged(async user => {
            if (!user) {
                showAlert("error", "Unauthorized", "You must be logged in.");
                setTimeout(() => window.location.href = '/index.html', 2000);
                return;
            }

            try {
                const snapshot = await database.ref(`users/${user.uid}`).once('value');
                const currentUser = snapshot.val();
                if (!currentUser) throw new Error("User not found");

                const canVerify = currentUser.permissions?.canVerifyUsers || false;
                const canPromote = currentUser.permissions?.canPromoteUsers || false;

                if (!canVerify && !canPromote) {
                    usersGrid.innerHTML = '';
                    noUsersMessage.style.display = 'block';
                    noUsersMessage.textContent = "You don't have permissions to access this page.";
                    return;
                }

                usersRef = database.ref('users');
                setupRealtimeUsersListener(canVerify, canPromote);

            } catch (err) {
                console.error(err);
                showAlert("error", "Error", "Failed to verify permissions.");
            }
        });
    }

    function setupRealtimeUsersListener(canVerify, canPromote) {
        loadingIndicator.style.display = 'flex';
        usersGrid.innerHTML = '';

        if (usersListener) usersRef.off('value', usersListener);

        usersListener = usersRef.on('value', snapshot => {
            users = [];
            let staffCount = 0;

            snapshot.forEach(userSnapshot => {
                const userData = userSnapshot.val();
                if (userData.role !== 'admin') {
                    users.push({ id: userSnapshot.key, ...userData });
                    if (userData.role === 'staff') staffCount++;
                }
            });

            renderUsers(users, canVerify, canPromote);
            updateStatistics(users, staffCount);
            loadingIndicator.style.display = 'none';
        }, error => {
            console.error(error);
            showAlert('error', 'Error', 'Failed to load users.');
            loadingIndicator.style.display = 'none';
        });
    }

    function renderUsers(usersToRender, canVerify, canPromote) {
        usersGrid.innerHTML = '';
        const members = usersToRender.filter(u => u.role === 'member');
        if (members.length === 0) {
            noUsersMessage.style.display = 'block';
            return;
        }
        noUsersMessage.style.display = 'none';

        members.forEach(user => {
            usersGrid.appendChild(createUserCard(user, canVerify, canPromote));
        });
    }

    function createUserCard(user, canVerify, canPromote) {
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
                ${canVerify && !isVerified ? `<button class="user-action-btn btn-verify" data-userid="${user.id}" data-action="verify">Verify User</button>` : ''}
                ${canPromote && isVerified ? `<button class="user-action-btn btn-promote" data-userid="${user.id}" data-action="promote">Promote User</button>` : ''}
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
            case 'verify': verifyUser(user); break;
            case 'promote': showPromotionModal(user); break;
        }
    }

    function verifyUser(user) {
        Swal.fire({
            title: 'Verify User',
            text: `Are you sure you want to verify ${user.name}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, verify!'
        }).then(result => {
            if (result.isConfirmed) {
                database.ref(`users/${user.id}/isVerified`).set(true)
                    .then(() => showAlert('success','Success!','User verified.'))
                    .catch(err => showAlert('error','Error','Failed to verify user.'));
            }
        });
    }

    function showPromotionModal(user) {
        currentEditingUser = user;

        const permissionCheckboxes = availablePermissions.map(perm => `
            <div class="permission-item">
                <label class="switch">
                    <input type="checkbox" id="${perm}" checked>
                    <span class="slider round"></span>
                </label>
                <span class="permission-label">${perm.replace(/can/g, '').replace(/([A-Z])/g, ' $1').trim()}</span>
            </div>
        `).join('');

        const modalHTML = `
            <div class="modal" id="promotion-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Promote ${user.name || user.email}</h2>
                        <span class="close-modal">&times;</span>
                    </div>
                    <div class="modal-body">
                        <p>Set permissions for this staff member:</p>
                        <div class="permissions-list">${permissionCheckboxes}</div>
                        <div class="modal-actions">
                            <button class="btn-secondary" id="cancel-promotion">Cancel</button>
                            <button class="btn-primary" id="confirm-promotion">Promote User</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const promotionModal = document.getElementById('promotion-modal');

        const closeModal = () => {
            promotionModal.style.display = 'none';
            setTimeout(() => promotionModal.remove(), 300);
        };

        promotionModal.style.display = 'block';
        promotionModal.querySelector('.close-modal').addEventListener('click', closeModal);
        promotionModal.querySelector('#cancel-promotion').addEventListener('click', closeModal);

        promotionModal.querySelector('#confirm-promotion').addEventListener('click', () => {
            const permissions = {};
            availablePermissions.forEach(perm => {
                permissions[perm] = document.getElementById(perm).checked;
            });

            database.ref(`users/${user.id}`).update({ role: 'staff', permissions })
                .then(() => {
                    showAlert('success', 'Success!', `${user.name} promoted to Staff`);
                    closeModal();
                })
                .catch(err => {
                    console.error(err);
                    showAlert('error','Error','Failed to promote user.');
                    closeModal();
                });
        });

        window.addEventListener('click', e => { if(e.target === promotionModal) closeModal(); });
    }

    function updateStatistics(usersList, staffCount) {
        totalUsersEl.textContent = usersList.length;
        verifiedUsersEl.textContent = usersList.filter(u=>u.isVerified).length;
        pendingUsersEl.textContent = usersList.filter(u=>!u.isVerified).length;
        staffUsersEl.textContent = staffCount;
    }

    window.addEventListener('beforeunload', () => { if(usersListener) usersRef.off('value', usersListener); });

    function showAlert(icon,title,text) {
        return Swal.fire({
            icon,
            title,
            text,
            background:'#2c3e50',
            color:'#fff',
            iconColor: icon==='error'? '#f44336':'#4caf50',
            confirmButtonText:'OK',
            confirmButtonColor:'#6e8efb'
        });
    }
});
