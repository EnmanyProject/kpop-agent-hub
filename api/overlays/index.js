const fs = require('fs');
const path = require('path');

let blobModule = null;
function getBlob() {
  if (blobModule) return blobModule;
  try { blobModule = require('@vercel/blob'); } catch(e) { blobModule = false; }
  return blobModule;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const registry = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'registry.json'), 'utf8')
  );
  const projectNames = Object.keys(registry.projects || {});

  const overlays = {};

  for (const name of projectNames) {
    // Try Vercel Blob first
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = getBlob();
      if (blob) {
        try {
          const { list } = blob;
          const result = await list({ prefix: `overlays/${name}.json` });
          if (result.blobs.length > 0) {
            const response = await fetch(result.blobs[0].url);
            overlays[name] = await response.json();
            continue;
          }
        } catch(e) { /* fall through */ }
      }
    }

    // Fallback: bundled file
    const filePath = path.join(process.cwd(), 'overlays', `${name}.json`);
    if (fs.existsSync(filePath)) {
      overlays[name] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  }

  return res.status(200).json(overlays);
};
