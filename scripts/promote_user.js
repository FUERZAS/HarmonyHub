import fetch from 'node-fetch';

async function promote() {
  const uid = 'nsvQ7xT61KZJnFzyZ97VlJbNjzG3';
  const url = `https://virtualchoir-28f87-default-rtdb.asia-southeast1.firebasedatabase.app/users/${uid}.json`;
  const body = { role: 'admin', isApproved: true, isVerified: true };
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log('Status:', res.status);
    const data = await res.text();
    console.log('Response:', data);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
}

promote();
