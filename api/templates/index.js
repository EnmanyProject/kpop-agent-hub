const fs = require('fs');
const path = require('path');

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const templatesDir = path.join(process.cwd(), 'templates');
    const files = fs.readdirSync(templatesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({
        filename: f,
        agentName: f.replace('.md', ''),
        size: fs.statSync(path.join(templatesDir, f)).size
      }));

    res.status(200).json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
