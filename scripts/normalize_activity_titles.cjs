// normalize_activity_titles.cjs
// Fetch recent activity_table entries and normalize announcement titles by
// stripping repeated leading prefixes like "New announcement:" or "Updated Announcement:"
// Usage: node scripts/normalize_activity_titles.cjs

const fs = require('fs');
const path = require('path');

async function run() {
  const repoRoot = path.resolve(__dirname, '..');
  const firebaseConfigPath = path.join(repoRoot, 'firebase-config.js');
  if (!fs.existsSync(firebaseConfigPath)) {
    console.error('firebase-config.js not found in repo root. Aborting.');
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
  console.log('Using Realtime DB URL:', databaseURL);

  const fetch = global.fetch || require('node-fetch');

  // helper to strip leading prefixes
  function stripLeadingPrefix(s) {
    if (!s) return '';
    return String(s).replace(/^\s*(?:new\s*announcement|updated\s*announcement)\s*[:\-–—]?\s*/i, '').trim();
  }

  // fetch full activity_table snapshot (we'll sort and limit locally)
  const url = `${databaseURL}/activity_table.json`;

  console.log('Fetching recent activity entries...');
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Failed to fetch activity_table:', res.status, res.statusText);
    process.exit(1);
  }
  const data = await res.json();
  if (!data) {
    console.log('No activity entries found.');
    return;
  }

  // sort entries by timestamp descending and take last 200
  const entries = Object.entries(data)
    .map(([k, v]) => ({ key: k, val: v }))
    .filter(e => e.val)
    .sort((a, b) => (Number(b.val.timestamp || 0) - Number(a.val.timestamp || 0)))
    .slice(0, 200);

  console.log(`Loaded ${entries.length} recent entries (capped to 200).`);

  const changes = [];
  for (const { key, val: entry } of entries) {
    if (!entry || typeof entry.title !== 'string') continue;
    // only normalize announcement types (be conservative)
    if ((entry.type || '').toLowerCase() !== 'announcement') continue;
    const orig = entry.title || '';
    const stripped = stripLeadingPrefix(orig);
    // If title already equals stripped, skip. Also skip empty stripped titles.
    if (!stripped) continue;
    // If the orig is longer than stripped and seems to contain the prefix, update
    const origLower = orig.trim().toLowerCase();
    const strippedLower = stripped.trim().toLowerCase();
    // If origLower starts with 'new announcement' or 'updated announcement' OR
    // origLower contains the stripped title but has repeated prefix, update.
    const hasPrefix = /^\s*(new\s*announcement|updated\s*announcement)\b/i.test(orig);
    if (hasPrefix || (origLower !== strippedLower && origLower.includes(strippedLower))) {
      changes.push({ key, before: orig, after: stripped });
    }
  }

  if (!changes.length) {
    console.log('No announcement titles needed normalization.');
    return;
  }

  console.log(`Found ${changes.length} entries to normalize.`);

  // Confirm with user (interactive) via console prompt
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => rl.question('Proceed to patch these entries? (yes/no) ', ans => { rl.close(); resolve(ans); }));
  if (!/^y(es)?$/i.test(answer)) {
    console.log('Aborting per user input. No changes made.');
    return;
  }

  // Apply patches
  let patched = 0;
  for (const c of changes) {
    const patchUrl = `${databaseURL}/activity_table/${c.key}.json`;
    const body = JSON.stringify({ title: c.after });
    try {
      const p = await fetch(patchUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      if (!p.ok) {
        console.error('Patch failed for', c.key, p.status, p.statusText);
      } else {
        console.log('Patched', c.key, '=>', c.after);
        patched++;
      }
    } catch (err) {
      console.error('Error patching', c.key, err);
    }
  }

  console.log(`Done. Patched ${patched}/${changes.length} entries.`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
