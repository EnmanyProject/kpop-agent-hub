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

  const name = decodeURIComponent(req.query.name || '');
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    return res.status(400).json({ error: 'Invalid template name' });
  }

  // GET: Read template
  if (req.method === 'GET') {
    // Try Vercel Blob first (for edited versions)
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = getBlob();
      if (blob) {
        try {
          const { list } = blob;
          const result = await list({ prefix: `templates/${name}.md` });
          if (result.blobs.length > 0) {
            const response = await fetch(result.blobs[0].url);
            const content = await response.text();
            return res.status(200).json({ content, source: 'blob' });
          }
        } catch(e) { /* fall through to bundled file */ }
      }
    }

    // Fallback: bundled file from deployment
    const filePath = path.join(process.cwd(), 'templates', `${name}.md`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return res.status(200).json({ content, source: 'bundled' });
  }

  // POST: Save template
  if (req.method === 'POST') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(503).json({
        error: 'Vercel Blob Storage가 설정되지 않았습니다.',
        hint: 'Vercel 프로젝트 Settings → Storage → Blob 연결 후 사용 가능합니다.',
        updated: []
      });
    }

    const blob = getBlob();
    if (!blob) {
      return res.status(500).json({ error: '@vercel/blob module not available', updated: [] });
    }

    try {
      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Content is required', updated: [] });
      }

      const { put } = blob;
      await put(`templates/${name}.md`, content, {
        access: 'public',
        addRandomSuffix: false,
      });

      return res.status(200).json({
        updated: ['vercel-blob'],
        backup: `blob-${new Date().toISOString().split('T')[0]}`,
        note: '온라인 저장 완료. 로컬 프로젝트 반영은 generate-agent.js를 실행하세요.'
      });
    } catch(e) {
      return res.status(500).json({ error: e.message, updated: [] });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
