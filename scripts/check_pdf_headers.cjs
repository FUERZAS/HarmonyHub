// Check headers for PDF resources in Realtime Database
// Usage: node scripts/check_pdf_headers.cjs

const fs = require('fs');
const path = require('path');

async function run() {
  const repoRoot = path.resolve(__dirname, '..');
  const firebaseConfigPath = path.join(repoRoot, 'firebase-config.js');

  if (!fs.existsSync(firebaseConfigPath)) {
    console.error('firebase-config.js not found. Run from repository root.');
    process.exit(1);
  }

  const fbText = fs.readFileSync(firebaseConfigPath, 'utf8');
  let databaseURL = null;
  const dbKeyIndex = fbText.indexOf('databaseURL');
  if (dbKeyIndex !== -1) {
    const after = fbText.slice(dbKeyIndex);
    const quoteMatch = after.match(/['\"]([^'\"]+)['\"]/);
    if (quoteMatch) databaseURL = quoteMatch[1];
  }
  if (!databaseURL) {
    console.error('Could not find databaseURL in firebase-config.js');
    process.exit(1);
  }
  databaseURL = databaseURL.replace(/\/+$/, '');
  console.log('Detected DB URL:', databaseURL);

  const fetch = global.fetch || require('node-fetch');
  const res = await fetch(`${databaseURL}/resources.json`);
  if (!res.ok) {
    console.error('Failed to fetch resources.json', res.status);
    process.exit(1);
  }

  const data = await res.json();
  const pdfs = [];
  for (const [key, resource] of Object.entries(data || {})) {
    const fileUrl = resource.fileUrl || '';
    const ext = (resource.cloudinaryData?.format || '').toLowerCase() || (fileUrl.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf' || fileUrl.toLowerCase().endsWith('.pdf')) {
      pdfs.push({ key, name: resource.name, fileUrl });
    }
  }

  console.log(`Found ${pdfs.length} PDF resources.`);
  for (const p of pdfs) {
    console.log('\n---');
    console.log('Resource:', p.key, p.name);
    console.log('URL:', p.fileUrl);
    try {
      const head = await fetch(p.fileUrl, { method: 'HEAD' });
      console.log('Status:', head.status);
      console.log('Content-Type:', head.headers.get('content-type'));
      console.log('Content-Disposition:', head.headers.get('content-disposition'));
      console.log('Access-Control-Allow-Origin:', head.headers.get('access-control-allow-origin'));
      console.log('X-Frame-Options:', head.headers.get('x-frame-options'));
      console.log('Referrer-Policy:', head.headers.get('referrer-policy'));
    } catch (err) {
      console.error('HEAD request failed:', err.name || err.message);
      // try GET for servers that don't antwort to HEAD
      try {
        const g = await fetch(p.fileUrl, { method: 'GET' });
        console.log('GET status:', g.status);
        console.log('Content-Type:', g.headers.get('content-type'));
        console.log('Content-Disposition:', g.headers.get('content-disposition'));
        console.log('Access-Control-Allow-Origin:', g.headers.get('access-control-allow-origin'));
        console.log('X-Frame-Options:', g.headers.get('x-frame-options'));
      } catch (e2) {
        console.error('GET failed too:', e2.name || e2.message);
      }
    }
  }
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
