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
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const project = decodeURIComponent(req.query.project || '');
  if (!project || project.includes('..')) return res.status(400).json({ error: 'Invalid project' });

  const blobKey = 'goals/mission.json';
  const filePath = path.join(process.cwd(), 'goals', 'mission.json');

  // 기존 데이터 로드
  let data = { version: '1.0.0', missions: {} };
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = getBlob();
    if (blob) {
      try {
        const { list } = blob;
        const result = await list({ prefix: blobKey });
        if (result.blobs.length > 0) {
          const response = await fetch(result.blobs[0].url);
          data = await response.json();
        }
      } catch(e) { /* use default */ }
    }
  }
  if (!data.missions || Object.keys(data.missions).length === 0) {
    if (fs.existsSync(filePath)) data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  // 업데이트
  const { mission, keyMetrics, currentPhase } = req.body || {};
  if (!data.missions[project]) data.missions[project] = {};
  if (mission !== undefined) data.missions[project].mission = mission;
  if (keyMetrics !== undefined) data.missions[project].keyMetrics = keyMetrics;
  if (currentPhase !== undefined) data.missions[project].currentPhase = currentPhase;
  data.lastUpdated = new Date().toISOString().split('T')[0];

  // Blob에 저장
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = getBlob();
    if (blob) {
      try {
        const { put } = blob;
        await put(blobKey, JSON.stringify(data, null, 2), {
          access: 'public', contentType: 'application/json', addRandomSuffix: false
        });
        return res.status(200).json({ saved: true });
      } catch(e) {
        return res.status(500).json({ error: e.message });
      }
    }
  }

  return res.status(503).json({ error: 'Blob Storage 미설정' });
};
