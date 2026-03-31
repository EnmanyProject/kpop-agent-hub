const fs = require('fs');
const path = require('path');

let blobModule = null;
function getBlob() {
  if (blobModule) return blobModule;
  try { blobModule = require('@vercel/blob'); } catch(e) { blobModule = false; }
  return blobModule;
}

function parseJsonl(content) {
  return content.split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const project = decodeURIComponent(req.query.project || '');
  if (!project || project.includes('..')) return res.status(400).json({ error: 'Invalid project' });

  // URL에 /summary가 포함되어 있으면 집계 모드
  const isSummary = req.url && req.url.includes('/summary');

  let logs = [];

  // Blob에서 로드
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = getBlob();
    if (blob) {
      try {
        const { list } = blob;
        const r = await list({ prefix: `logs/${project}.jsonl` });
        if (r.blobs.length > 0) {
          const response = await fetch(r.blobs[0].url);
          logs = parseJsonl(await response.text());
        }
      } catch(e) { /* fall through */ }
    }
  }

  // 로컬 파일 fallback
  if (logs.length === 0) {
    const filePath = path.join(process.cwd(), 'logs', `${project}.jsonl`);
    if (fs.existsSync(filePath)) {
      logs = parseJsonl(fs.readFileSync(filePath, 'utf8'));
    }
  }

  if (isSummary) {
    // 집계 모드
    const agents = {};
    let totalCost = 0;
    logs.forEach(l => {
      if (!agents[l.agent]) agents[l.agent] = { total: 0, success: 0, cost: 0, lastAction: null };
      agents[l.agent].total++;
      if (l.result === 'success' || l.result === 'breakthrough') agents[l.agent].success++;
      if (l.cost) { agents[l.agent].cost += l.cost; totalCost += l.cost; }
      agents[l.agent].lastAction = l;
    });
    return res.status(200).json({ agents, total: logs.length, totalCost, recentLogs: logs.slice(-20).reverse() });
  }

  // 전체 로그 반환
  res.status(200).json(logs);
};
