// Use auth and database from firebase-config.js via window

// DOM Elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// SweetAlert helper function
function showAlert(icon, title, text, confirmButtonText = 'OK') {
    return Swal.fire({
        icon: icon,
        title: title,
        text: text,
        background: '#2c3e50',
        color: '#fff',
        iconColor: icon === 'error' ? '#f44336' : (icon === 'success' ? '#4caf50' : (icon === 'warning' ? '#ff9800' : '#2196f3')),
        confirmButtonText: confirmButtonText,
        confirmButtonColor: '#6e8efb'
    });
}

// ================== REGISTER ==================
if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!name) {
            showAlert('error', 'Error', 'Name is required.');
            return;
        }

        if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
            showAlert('error', 'Error', 'A valid email address is required.');
            return;
        }

        if (password !== confirmPassword) {
            showAlert('error', 'Error', 'Passwords do not match.');
            return;
        }

        const registerBtn = document.getElementById('register-btn');
        registerBtn.classList.add('loading');

        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                const user = userCredential.user;

                const userPath = 'users/' + user.uid;
                const userData = {
                    name: name,
                    email: email,
                    role: 'member',           // Default role
                    isVerified: false,        // Needs admin approval
                    createdAt: new Date().toISOString(),
                    permissions: {
                        canAnnounce: false,
                        canVerifyUsers: false,
                        canAppointSchedules: false,
                        canInitializeMeetings: false,
                        canUploadResources: false,
                        canPromoteUsers: false
                    }
                };

                // Save user data in RTDB
                return database.ref(userPath).set(userData)
                    .then(() => {
                        console.log("✅ User data saved to RTDB:", userData);

                        // Store in session
                        const fullUserData = { uid: user.uid, ...userData };
                        sessionStorage.setItem('authUser', JSON.stringify(fullUserData));

                        // ALSO log into /activity_table
                        const activityData = {
                            type: 'registration',
                            userId: user.uid,
                            isVerified: userData.isVerified,
                            name: userData.name,
                            email: userData.email,
                            role: userData.role,
                            createdAt: userData.createdAt,
                            solved: false,
                            timestamp: Date.now() // ✅ Added for consistent sorting
                        };
                        return database.ref('activity_table').push(activityData);
                    });
            })
            .then(() => {
                showAlert('success', 'Success!', 'Account created! Please wait for admin approval.');
                // 👉 stays on index.html
            })
            .catch((error) => {
                console.error('Register error:', error);
                showAlert('error', 'Registration Failed', error.message || 'Registration failed.');
            })
            .finally(() => {
                registerBtn.classList.remove('loading');
            });
    });
}

// ================== LOGIN ==================
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('remember-me')?.checked || false;

        const loginBtn = document.getElementById('login-btn');
        loginBtn.classList.add('loading');

        const persistence = rememberMe ? 
            firebase.auth.Auth.Persistence.LOCAL : 
            firebase.auth.Auth.Persistence.SESSION;

        auth.setPersistence(persistence)
            .then(() => auth.signInWithEmailAndPassword(email, password))
            .then((userCredential) => {
                const user = userCredential.user;
                return database.ref('users/' + user.uid).once('value').then((snapshot) => {
                    const userData = snapshot.val();
                    if (!userData) throw new Error("User data not found.");

                    const fullUserData = { uid: user.uid, ...userData };
                    sessionStorage.setItem('authUser', JSON.stringify(fullUserData));
                    return fullUserData;
                });
            })
            .then((userData) => {
                if (!userData.isApproved && userData.role !== 'admin') {
                    window.location.href = 'pending.html';
                    return null;
                }

                showAlert('success', 'Welcome!', 'Login successful! Redirecting...');

                setTimeout(() => {
                    if (userData.role === 'admin') {
                        window.location.href = '../admin/dashboard.html';
                    } else if (userData.role === 'staff') {
                        window.location.href = '../staff/dashboard.html';
                    } else {
                        window.location.href = '../member/dashboard.html';
                    }
                }, 1500);
            })
            .catch((error) => {
                console.error('Login error:', error);
                let errorMessage = 'An error occurred during login.';
                switch(error.code) {
                    case 'auth/user-not-found':
                        errorMessage = 'No account found with this email.'; break;
                    case 'auth/wrong-password':
                        errorMessage = 'Incorrect password.'; break;
                    case 'auth/invalid-email':
                        errorMessage = 'Invalid email address.'; break;
                    case 'auth/too-many-requests':
                        errorMessage = 'Too many failed attempts. Please try again later.'; break;
                }
                showAlert('error', 'Login Failed', errorMessage);
            })
            .finally(() => {
                loginBtn.classList.remove('loading');
            });
    });
}

// ================== PASSWORD RESET ==================
const forgotPassword = document.getElementById('forgot-password');
if (forgotPassword) {
    forgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value.trim();
        
        if (!email) {
            showAlert('warning', 'Email Required', 'Please enter your email address first.');
            return;
        }
        
        auth.sendPasswordResetEmail(email)
            .then(() => {
                showAlert('success', 'Email Sent', 'Password reset email sent. Check your inbox.');
            })
            .catch((error) => {
                console.error('Password reset error:', error);
                showAlert('error', 'Error', 'Error sending reset email. Please try again.');
            });
    });
}

// ================== AUTH STATE LISTENER ==================
if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged((user) => {
        if (user) {
            database.ref('users/' + user.uid).once('value')
                .then((snapshot) => {
                    const userData = snapshot.val();
                    if (!userData) throw new Error("User data not found.");

                    const fullUserData = { uid: user.uid, ...userData };
                    sessionStorage.setItem('authUser', JSON.stringify(fullUserData));

                    // ✅ Do not redirect if not approved — just show a message
                    if (!userData.isApproved && userData.role !== 'admin') {
                        showAlert('info', 'Pending Approval', 'Your account has been created. Please wait for admin approval.');
                        return null;
                    }

                    return fullUserData;
                })
                .then((userData) => {
                    if (!userData) return; // already showed pending message

                    // Optional: auto-redirect only if they’re logged in AND approved
                    if (window.location.pathname.includes('index.html')) {
                        showAlert('success', 'Welcome!', 'Login successful! Redirecting...');
                        setTimeout(() => {
                            if (userData.role === 'admin') {
                                window.location.href = '../admin/dashboard.html';
                            } else if (userData.role === 'staff') {
                                window.location.href = '../staff/dashboard.html';
                            } else {
                                window.location.href = '../member/dashboard.html';
                            }
                        }, 1500);
                    }
                })
                .catch((error) => {
                    console.error('Auth state error:', error);
                    showAlert('error', 'Error', 'Error retrieving user data.');
                });
        }
    });
}
