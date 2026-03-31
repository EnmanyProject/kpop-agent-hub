const fs = require('fs');
const path = require('path');

let blobModule = null;
function getBlob() {
  if (blobModule) return blobModule;
  try { blobModule = require('@vercel/blob'); } catch(e) { blobModule = false; }
  return blobModule;
}

// JSONL 파싱
function parseJsonl(content) {
  return content.split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = {};

  // 프로젝트 목록 가져오기
  const registryPath = path.join(process.cwd(), 'registry.json');
  let projectNames = [];
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    projectNames = Object.keys(registry.projects || {});
  } catch(e) { /* empty */ }

  for (const project of projectNames) {
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
            const text = await response.text();
            logs = parseJsonl(text);
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

    if (logs.length > 0) {
      let cost = 0;
      logs.forEach(l => { if (l.cost) cost += l.cost; });
      result[project] = { total: logs.length, cost, recent: logs.slice(-10).reverse() };
    }
  }

  res.status(200).json(result);
};
