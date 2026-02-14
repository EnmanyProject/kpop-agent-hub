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

  const project = decodeURIComponent(req.query.project || '');
  if (!project || project.includes('..') || project.includes('/') || project.includes('\\')) {
    return res.status(400).json({ error: 'Invalid project name' });
  }

  // GET: Read overlay
  if (req.method === 'GET') {
    // Try Vercel Blob first
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = getBlob();
      if (blob) {
        try {
          const { list } = blob;
          const result = await list({ prefix: `overlays/${project}.json` });
          if (result.blobs.length > 0) {
            const response = await fetch(result.blobs[0].url);
            const data = await response.json();
            return res.status(200).json({ overlay: data, source: 'blob' });
          }
        } catch(e) { /* fall through */ }
      }
    }

    // Fallback: bundled file
    const filePath = path.join(process.cwd(), 'overlays', `${project}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Overlay not found' });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return res.status(200).json({ overlay: data, source: 'bundled' });
  }

  // PUT: Save overlay
  if (req.method === 'PUT') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(503).json({
        error: 'Vercel Blob Storage가 설정되지 않았습니다.',
        hint: 'Vercel 프로젝트 Settings → Storage → Blob 연결 후 사용 가능합니다.'
      });
    }

    const blob = getBlob();
    if (!blob) {
      return res.status(500).json({ error: '@vercel/blob module not available' });
    }

    try {
      const overlay = req.body;
      if (!overlay || !overlay.version || !overlay.project) {
        return res.status(400).json({ error: 'Invalid overlay format: version and project required' });
      }

      overlay.lastUpdated = new Date().toISOString().split('T')[0];

      const { put } = blob;
      await put(`overlays/${project}.json`, JSON.stringify(overlay, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });

      return res.status(200).json({ saved: true, project, lastUpdated: overlay.lastUpdated });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE: Remove overlay from Blob (revert to bundled)
  if (req.method === 'DELETE') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(503).json({ error: 'Vercel Blob Storage가 설정되지 않았습니다.' });
    }

    const blob = getBlob();
    if (!blob) {
      return res.status(500).json({ error: '@vercel/blob module not available' });
    }

    try {
      const { list, del } = blob;
      const result = await list({ prefix: `overlays/${project}.json` });
      if (result.blobs.length > 0) {
        await del(result.blobs.map(b => b.url));
      }
      return res.status(200).json({ deleted: true, project });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
