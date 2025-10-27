import fetch from 'node-fetch';

async function setName() {
  const uid = 'nsvQ7xT61KZJnFzyZ97VlJbNjzG3';
  const url = `https://virtualchoir-28f87-default-rtdb.asia-southeast1.firebasedatabase.app/users/${uid}.json`;
  const body = { displayName: 'Virtual Choir', name: 'Virtual Choir' };
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

setName();
