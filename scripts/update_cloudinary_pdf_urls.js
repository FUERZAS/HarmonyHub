// Update Cloudinary-stored PDF resources to use raw delivery URLs
// Usage: node scripts/update_cloudinary_pdf_urls.js
// This script reads firebase-config.js to determine the Realtime Database URL,
// fetches /resources.json, and for any entry with cloudinaryData.format === 'pdf',
// it patches the resource's fileUrl to a Cloudinary raw delivery URL.

const fs = require('fs');
const path = require('path');

async function run() {
  const repoRoot = path.resolve(__dirname, '..');
  const firebaseConfigPath = path.join(repoRoot, 'firebase-config.js');
  const cloudinaryConfigPath = path.join(repoRoot, 'cloudinary-config.js');

  if (!fs.existsSync(firebaseConfigPath)) {
    console.error('firebase-config.js not found in repo root. Please ensure the script is run from the repository root.');
    process.exit(1);
  }

  const fbText = fs.readFileSync(firebaseConfigPath, 'utf8');
  // Robustly locate the databaseURL value without relying on complex regex literals
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
  console.log('Detected Realtime DB URL:', databaseURL);

  // read cloudinary-config for cloudName
  let cloudName = null;
  if (fs.existsSync(cloudinaryConfigPath)) {
    const cloudText = fs.readFileSync(cloudinaryConfigPath, 'utf8');
    const cloudMatch = cloudText.match(/cloudName\s*:\s*['"]([\w-]+)['"]/);
    if (cloudMatch) cloudName = cloudMatch[1];
    console.log('Detected cloudinary cloudName:', cloudName);
  }

  const resourcesUrl = `${databaseURL}/resources.json`;
  console.log('Fetching resources from:', resourcesUrl);

  const fetch = global.fetch || require('node-fetch');
  const res = await fetch(resourcesUrl);
  if (!res.ok) {
    console.error('Failed to fetch resources.json:', res.status, res.statusText);
    process.exit(1);
  }

  const data = await res.json();
  if (!data) {
    console.log('No resources found.');
    return;
  }

  const updates = [];
  for (const [key, resource] of Object.entries(data)) {
    const cloud = resource.cloudinaryData;
    if (cloud && (cloud.format || '').toLowerCase() === 'pdf') {
      const publicId = cloud.public_id;
      const version = cloud.version;
      if (!publicId) continue;
      if (!cloudName && resource.fileUrl) {
        // try to extract cloudName from existing secure_url
        const m = resource.fileUrl.match(/https:\/\/res.cloudinary.com\/([\w-]+)\//);
        if (m) cloudName = m[1];
      }
      if (!cloudName) {
        console.warn(`Skipping ${key}: cloudName unknown and cannot construct raw URL`);
        continue;
      }
      const rawUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${version ? 'v' + version + '/' : ''}${publicId}.${cloud.format}`;
      if (resource.fileUrl !== rawUrl) {
        updates.push({ key, rawUrl });
      }
    }
  }

  console.log(`Found ${updates.length} PDF resources to update.`);
  for (const u of updates) {
    const patchUrl = `${databaseURL}/resources/${u.key}.json`;
    console.log('Patching', patchUrl, '=>', u.rawUrl);
    const p = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileUrl: u.rawUrl })
    });
    if (!p.ok) console.error('Patch failed for', u.key, p.status, p.statusText);
    else console.log('Patched', u.key);
  }

  console.log('Done.');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
