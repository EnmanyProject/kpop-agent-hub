const fs = require('fs');
const path = require('path');

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const registryPath = path.join(process.cwd(), 'registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    res.status(200).json(registry.projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
