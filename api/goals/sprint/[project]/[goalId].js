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
          return await response.json();
        }
      } catch(e) { /* fall through */ }
    }
  }
  if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { version: '1.0.0', sprints: {} };
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
  const goalId = decodeURIComponent(req.query.goalId || '');
  if (!project || !goalId) return res.status(400).json({ error: 'project and goalId required' });

  const data = await loadSprints();
  const goals = data.sprints[project]?.goals;
  if (!goals) return res.status(404).json({ error: 'Project not found' });

  // PUT: 목표 상태/내용 변경
  if (req.method === 'PUT') {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const updates = req.body || {};
    if (updates.status) goal.status = updates.status;
    if (updates.title) goal.title = updates.title;
    if (updates.priority) goal.priority = updates.priority;
    if (goal.status === 'done') goal.completedAt = new Date().toISOString().split('T')[0];
    data.lastUpdated = new Date().toISOString().split('T')[0];

    const saved = await saveSprints(data);
    if (!saved) return res.status(503).json({ error: 'Blob Storage 미설정' });
    return res.status(200).json({ saved: true });
  }

  // DELETE: 목표 삭제
  if (req.method === 'DELETE') {
    const idx = goals.findIndex(g => g.id === goalId);
    if (idx === -1) return res.status(404).json({ error: 'Goal not found' });
    goals.splice(idx, 1);
    data.lastUpdated = new Date().toISOString().split('T')[0];

    const saved = await saveSprints(data);
    if (!saved) return res.status(503).json({ error: 'Blob Storage 미설정' });
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
