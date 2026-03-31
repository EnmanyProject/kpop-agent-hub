const fs = require('fs');
const path = require('path');

let blobModule = null;
function getBlob() {
  if (blobModule) return blobModule;
  try { blobModule = require('@vercel/blob'); } catch(e) { blobModule = false; }
  return blobModule;
}

async function loadJsonFromBlobOrFile(blobKey, filePath) {
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
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const missionPath = path.join(process.cwd(), 'goals', 'mission.json');
  const sprintsPath = path.join(process.cwd(), 'goals', 'sprints.json');

  const missionData = await loadJsonFromBlobOrFile('goals/mission.json', missionPath);
  const sprintsData = await loadJsonFromBlobOrFile('goals/sprints.json', sprintsPath);

  res.status(200).json({
    missions: missionData ? missionData.missions || {} : {},
    sprints: sprintsData ? sprintsData.sprints || {} : {}
  });
};
