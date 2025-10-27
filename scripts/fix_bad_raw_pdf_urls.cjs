// Fix resources where constructed Cloudinary raw URL returns non-200
// Will set fileUrl back to cloudinaryData.secure_url when available

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
  const candidates = [];
  for (const [key, resource] of Object.entries(data || {})) {
    const fileUrl = resource.fileUrl || '';
    const ext = (resource.cloudinaryData?.format || '').toLowerCase() || (fileUrl.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf' || fileUrl.toLowerCase().endsWith('.pdf')) {
      candidates.push({ key, resource });
    }
  }

  console.log(`Found ${candidates.length} PDF resources to check.`);
  for (const c of candidates) {
    const key = c.key;
    const resource = c.resource;
    console.log('\n---');
    console.log('Resource:', key, resource.name);
    const cloud = resource.cloudinaryData;
    if (!cloud) {
      console.log('No cloudinaryData present; skipping.');
      continue;
    }
    const cloudName = cloud.public_id && resource.fileUrl && resource.fileUrl.match(/res.cloudinary.com\/(.*?)\//) ? (resource.fileUrl.match(/res.cloudinary.com\/(.*?)\//)[1]) : (global.cloudinaryConfig?.cloudName || null);
    const publicId = cloud.public_id;
    const version = cloud.version;
    if (!cloudName || !publicId) {
      console.warn('Missing cloudName/publicId; skipping.');
      continue;
    }
    const rawUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${version ? 'v' + version + '/' : ''}${publicId}.${cloud.format}`;
    console.log('Constructed rawUrl:', rawUrl);
    try {
      const h = await fetch(rawUrl, { method: 'HEAD' });
      console.log('raw HEAD status:', h.status);
      if (h.ok) {
        console.log('Raw URL valid; no change needed.');
        continue;
      }
    } catch (err) {
      console.log('HEAD for rawUrl failed:', err && err.name ? err.name : String(err));
    }

    // raw URL invalid — fall back to secure_url if available
    const secure = cloud.secure_url || resource.fileUrl;
    if (!secure) {
      console.warn('No secure_url to fall back to; manual fix needed for', key);
      continue;
    }

    if (secure === resource.fileUrl) {
      console.log('fileUrl already points to secure_url but raw is invalid; no update (fileUrl unchanged)');
      continue;
    }

    // Patch DB
    const patchUrl = `${databaseURL}/resources/${key}.json`;
    console.log('Patching resource to secure_url:', patchUrl, '=>', secure);
    const p = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileUrl: secure })
    });
    if (!p.ok) console.error('Patch failed', p.status, p.statusText);
    else console.log('Patched', key);
  }
  console.log('\nDone.');
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
