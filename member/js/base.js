document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const logoutBtn = document.querySelector('.logout-btn');
    const name = document.querySelector('.user-name');
    const role = document.querySelector('.user-role');
    const userAvatar = document.querySelector('.user-avatar');

    const userData = JSON.parse(sessionStorage.getItem('authUser'));

    // ========================== USER INFO ==========================
    if (userData) {
        name.textContent = userData.name || 'User';
        role.textContent = userData.role
            ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1)
            : 'Member';

        // Restore avatar from sessionStorage if exists
        if (userData.fileURL) {
            if (userAvatar.tagName === 'IMG') {
                userAvatar.src = `${userData.fileURL}?v=${Date.now()}`;
            } else {
                userAvatar.style.backgroundImage = `url('${userData.fileURL}?v=${Date.now()}')`;
            }
        }
    }

    // ========================== AVATAR UPLOAD HANDLER ==========================
    if (userAvatar && userData) {
        userAvatar.style.cursor = 'pointer';
        userAvatar.title = 'Click to change profile picture';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        userAvatar.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                Swal.fire({
                    icon: 'error',
                    title: 'Invalid File',
                    text: 'Please upload an image file only.',
                    background: '#2c3e50',
                    color: '#fff'
                });
                return;
            }

            Swal.fire({
                title: 'Uploading...',
                text: 'Please wait while we upload your profile picture.',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading(),
                background: '#2c3e50',
                color: '#fff'
            });

            try {
                // --- Use Cloudinary config (from cloudinary-config.js)
                const { cloudName, uploadPreset, uploadFolder } = window.cloudinaryConfig;

                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', uploadPreset);
                formData.append('folder', uploadFolder || 'harmonyhub/users');

                const cloudinaryRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
                    method: 'POST',
                    body: formData
                });

                const cloudinaryData = await cloudinaryRes.json();
                if (!cloudinaryData.secure_url) throw new Error('Upload failed. Please try again.');

                const fileURL = cloudinaryData.secure_url;

                // --- Find user UID by matching email
                const usersRef = firebase.database().ref('users');
                const snapshot = await usersRef.once('value');
                let userUID = null;

                snapshot.forEach((child) => {
                    const user = child.val();
                    if (user.email && user.email === userData.email) {
                        userUID = child.key;
                    }
                });

                if (!userUID) throw new Error('User not found in database.');

                // --- Update Firebase record
                const userRef = firebase.database().ref(`/users/${userUID}`);
                await userRef.update({
                    cloudinaryData,
                    fileURL
                });

                // --- Update local sessionStorage
                userData.fileURL = fileURL;
                sessionStorage.setItem('authUser', JSON.stringify(userData));

                // --- Update UI instantly (handles <img> or <div>)
                if (userAvatar.tagName === 'IMG') {
                    userAvatar.src = `${fileURL}?v=${Date.now()}`;
                } else {
                    userAvatar.style.backgroundImage = `url('${fileURL}?v=${Date.now()}')`;
                }

                Swal.fire({
                    icon: 'success',
                    title: 'Profile Updated!',
                    text: 'Your profile picture has been uploaded successfully.',
                    background: '#2c3e50',
                    color: '#fff',
                    timer: 2000,
                    showConfirmButton: false
                });

            } catch (error) {
                console.error('Upload error:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Upload Failed',
                    text: error.message,
                    background: '#2c3e50',
                    color: '#fff'
                });
            }
        });
    }

    // ========================== SIDEBAR LOGIC ==========================
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebar.classList.toggle('mobile-collapsed');
            updateToggleIcon();
        });
    }

    document.addEventListener('click', function(event) {
        if (
            window.innerWidth <= 1024 &&
            !sidebar.contains(event.target) &&
            !sidebarToggle.contains(event.target) &&
            sidebar.classList.contains('mobile-collapsed')
        ) {
            sidebar.classList.remove('mobile-collapsed');
            updateToggleIcon();
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            Swal.fire({
                title: 'Logout Confirmation',
                text: 'Are you sure you want to logout?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Yes, logout!',
                cancelButtonText: 'Cancel',
                background: '#2c3e50',
                color: '#fff',
                iconColor: '#ffcc00'
            }).then((result) => {
                if (result.isConfirmed) {
                    Swal.fire({
                        title: 'Logging out...',
                        text: 'Please wait while we securely log you out.',
                        icon: 'info',
                        showConfirmButton: false,
                        allowOutsideClick: false,
                        didOpen: () => Swal.showLoading(),
                        background: '#2c3e50',
                        color: '#fff'
                    });

                    localStorage.clear();
                    sessionStorage.clear();

                    if (typeof auth !== 'undefined' && auth) {
                        auth.setPersistence(firebase.auth.Auth.Persistence.NONE)
                            .then(() => auth.signOut())
                            .then(() => redirectLogout())
                            .catch(() => redirectLogout());
                    } else {
                        redirectLogout();
                    }
                }
            });
        });
    }

    function redirectLogout() {
        Swal.close();
        Swal.fire({
            title: 'Logged Out!',
            text: 'Redirecting in 2 seconds...',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false,
            background: '#2c3e50',
            color: '#fff'
        });
        setTimeout(() => {
            window.location.href = '../index.html?logout=' + Date.now();
        }, 2000);
    }

    function checkScreenSize() {
        if (window.innerWidth <= 1024) {
            sidebar.classList.remove('mobile-collapsed');
            if (sidebarToggle) sidebarToggle.style.display = 'flex';
            updateToggleIcon();
        } else {
            sidebar.classList.remove('mobile-collapsed');
            if (sidebarToggle) sidebarToggle.style.display = 'none';
        }
    }

    function updateToggleIcon() {
        if (window.innerWidth <= 1024) {
            sidebarToggle.innerHTML = sidebar.classList.contains('mobile-collapsed')
                ? '<i class="fas fa-times"></i>'
                : '<i class="fas fa-bars"></i>';
        }
    }
});
