const fs = require('fs');
const path = require('path');

let blobModule = null;
function getBlob() {
  if (blobModule) return blobModule;
  try { blobModule = require('@vercel/blob'); } catch(e) { blobModule = false; }
  return blobModule;
}

async function loadSprints() {
  const blobKey = 'goals/sprints.json';
  const filePath = path.join(process.cwd(), 'goals', 'sprints.json');

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = getBlob();
    if (blob) {
      try {
        const { list } = blob;
        const result = await list({ prefix: blobKey });
        if (result.blobs.length > 0) {
          const response = await fetch(result.blobs[0].url);
          return { data: await response.json(), source: 'blob' };
        }
      } catch(e) { /* fall through */ }
    }
  }
  if (fs.existsSync(filePath)) {
    return { data: JSON.parse(fs.readFileSync(filePath, 'utf8')), source: 'file' };
  }
  return { data: { version: '1.0.0', sprints: {} }, source: 'default' };
}

async function saveSprints(data) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
  const blob = getBlob();
  if (!blob) return false;
  const { put } = blob;
  await put('goals/sprints.json', JSON.stringify(data, null, 2), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false
  });
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const project = decodeURIComponent(req.query.project || '');
  if (!project || project.includes('..')) return res.status(400).json({ error: 'Invalid project' });

  // POST: 목표 추가
  if (req.method === 'POST') {
    const { title, priority, assignedSquads } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });

    const { data } = await loadSprints();
    if (!data.sprints[project]) {
      data.sprints[project] = { sprintName: 'Sprint', startDate: '', endDate: '', goals: [] };
    }
    const goals = data.sprints[project].goals;
    const prefix = project.charAt(0).toUpperCase();
    const nums = goals.map(g => parseInt(g.id.split('-')[1])).filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const id = `${prefix}-${String(next).padStart(3, '0')}`;
    goals.push({ id, title, priority: priority || 'medium', status: 'todo', assignedSquads: assignedSquads || [] });
    data.lastUpdated = new Date().toISOString().split('T')[0];

    const saved = await saveSprints(data);
    if (!saved) return res.status(503).json({ error: 'Blob Storage 미설정' });
    return res.status(200).json({ id, saved: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
