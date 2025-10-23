// Use auth and database from firebase-config.js via window

auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const userRef = database.ref('users/' + user.uid);

  // Watch for approval changes
  userRef.on('value', (snapshot) => {
    const userData = snapshot.val();
    if (!userData) return;

    // Always update sessionStorage so dashboards have fresh info
    sessionStorage.setItem('authUser', JSON.stringify(userData));

    if (userData.isVerified) {
      // Redirect based on role
      if (userData.role === 'admin') {
        window.location.href = '../admin/dashboard.html';
      } else if (userData.role === 'staff') {
        window.location.href = '../staff/dashboard.html';
      } else {
        window.location.href = '../member/dashboard.html';
      }
    }
  });
});

// Logout button
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    auth.signOut().then(() => {
      sessionStorage.removeItem('authUser');
      window.location.href = 'index.html';
    });
  });
}
