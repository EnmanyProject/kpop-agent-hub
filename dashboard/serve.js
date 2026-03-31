#!/usr/bin/env node
/**
 * serve.js - Local dashboard server
 * Usage: node serve.js [port]
 * Default port: 3456
 *
 * Serves:
 *   /              → dashboard files (index.html, dashboard.js, styles.css)
 *   /data/         → agent hub data (registry.json, scoring/, etc.)
 *   /projects/     → all project directories (for loading agent-scores.json)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = parseInt(process.argv[2]) || 3456;
const DASHBOARD_DIR = __dirname;
const AGENTS_DIR = path.join(__dirname, '..');
const BASE_DIR = path.join(__dirname, '..', '..', '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveFile(filePath, res) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Server Error: ${error.message}`);
  }
}

// ============================================================
// Template API Handlers
// ============================================================

function backupTemplate(templatePath) {
  const backupDir = path.join(AGENTS_DIR, 'templates', '.backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupPath = path.join(
    backupDir,
    `${path.basename(templatePath, '.md')}_${timestamp}.md`
  );
  fs.copyFileSync(templatePath, backupPath);
  return backupPath;
}

function handleApiTemplatesList(req, res) {
  const templatesDir = path.join(AGENTS_DIR, 'templates');
  try {
    const files = fs.readdirSync(templatesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({
        filename: f,
        agentName: f.replace('.md', ''),
        size: fs.statSync(path.join(templatesDir, f)).size
      }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(files));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

function handleApiTemplateRead(req, res, agentName) {
  // Security: prevent directory traversal
  if (agentName.includes('..') || agentName.includes('/') || agentName.includes('\\')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid agent name' }));
    return;
  }

  const templatePath = path.join(AGENTS_DIR, 'templates', `${agentName}.md`);
  if (!fs.existsSync(templatePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Template not found' }));
    return;
  }

  try {
    const content = fs.readFileSync(templatePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content, filename: `${agentName}.md` }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

function handleApiTemplateSave(req, res, agentName) {
  // Security: prevent directory traversal
  if (agentName.includes('..') || agentName.includes('/') || agentName.includes('\\')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid agent name' }));
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { content } = JSON.parse(body);
      const templatePath = path.join(AGENTS_DIR, 'templates', `${agentName}.md`);

      if (!fs.existsSync(templatePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Template not found' }));
        return;
      }

      // 1. Backup existing template
      const backupPath = backupTemplate(templatePath);
      console.log(`  📦 백업 생성: ${path.basename(backupPath)}`);

      // 2. Save new content
      fs.writeFileSync(templatePath, content, 'utf8');
      console.log(`  💾 템플릿 저장: ${agentName}.md`);

      // 3. Regenerate for all projects that use this agent
      const registry = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'registry.json'), 'utf8'));
      const agentKoreanName = agentName.split('-')[0]; // "정국-debug" → "정국"

      const result = { updated: [], errors: [], backup: path.basename(backupPath) };

      for (const projectName in registry.projects) {
        const project = registry.projects[projectName];
        if (project.activeAgents && project.activeAgents.includes(agentKoreanName)) {
          try {
            const scriptPath = path.join(AGENTS_DIR, 'scripts', 'generate-agent.js');
            execSync(`node "${scriptPath}" ${projectName} ${agentKoreanName}`, {
              cwd: AGENTS_DIR,
              timeout: 10000
            });
            result.updated.push(projectName);
            console.log(`  ✅ 재생성: ${projectName} → ${agentKoreanName}`);
          } catch (e) {
            result.errors.push({ project: projectName, error: e.message });
            console.log(`  ❌ 재생성 실패: ${projectName} → ${e.message}`);
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

// ============================================================
// Overlay API Handlers
// ============================================================

function handleApiOverlaysList(req, res) {
  const overlaysDir = path.join(AGENTS_DIR, 'overlays');
  try {
    if (!fs.existsSync(overlaysDir)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
      return;
    }

    const overlays = {};
    const files = fs.readdirSync(overlaysDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    files.forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(overlaysDir, f), 'utf8'));
        const projectName = f.replace('.json', '');
        overlays[projectName] = data;
      } catch (e) { /* skip malformed files */ }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(overlays));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

function handleApiOverlayRead(req, res, projectName) {
  if (projectName.includes('..') || projectName.includes('/') || projectName.includes('\\')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid project name' }));
    return;
  }

  const overlayPath = path.join(AGENTS_DIR, 'overlays', `${projectName}.json`);
  if (!fs.existsSync(overlayPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Overlay not found' }));
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ overlay: data, source: 'local' }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

function handleApiOverlaySave(req, res, projectName) {
  if (projectName.includes('..') || projectName.includes('/') || projectName.includes('\\')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid project name' }));
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const overlay = JSON.parse(body);
      if (!overlay || !overlay.version || !overlay.project) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid overlay format: version and project required' }));
        return;
      }

      overlay.lastUpdated = new Date().toISOString().split('T')[0];

      const overlaysDir = path.join(AGENTS_DIR, 'overlays');
      if (!fs.existsSync(overlaysDir)) {
        fs.mkdirSync(overlaysDir, { recursive: true });
      }

      const overlayPath = path.join(overlaysDir, `${projectName}.json`);
      fs.writeFileSync(overlayPath, JSON.stringify(overlay, null, 2), 'utf8');
      console.log(`  💾 overlay 저장: ${projectName}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: true, project: projectName, lastUpdated: overlay.lastUpdated }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

function handleApiOverlayDelete(req, res, projectName) {
  if (projectName.includes('..') || projectName.includes('/') || projectName.includes('\\')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid project name' }));
    return;
  }

  const overlayPath = path.join(AGENTS_DIR, 'overlays', `${projectName}.json`);
  if (!fs.existsSync(overlayPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Overlay not found' }));
    return;
  }

  try {
    // Reset to empty overlay instead of deleting
    const emptyOverlay = {
      version: '1.0.0',
      project: projectName,
      lastUpdated: new Date().toISOString().split('T')[0],
      agents: {},
      globalOverrides: {}
    };
    fs.writeFileSync(overlayPath, JSON.stringify(emptyOverlay, null, 2), 'utf8');
    console.log(`  🗑️  overlay 초기화: ${projectName}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ deleted: true, project: projectName }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// ============================================================
// Goals API Handlers (Paperclip 컨셉)
// ============================================================

const GOALS_DIR = path.join(AGENTS_DIR, 'goals');
const LOGS_DIR_PATH = path.join(AGENTS_DIR, 'logs');

function handleApiGoals(req, res) {
  try {
    const missionPath = path.join(GOALS_DIR, 'mission.json');
    const sprintsPath = path.join(GOALS_DIR, 'sprints.json');
    const missions = fs.existsSync(missionPath) ? JSON.parse(fs.readFileSync(missionPath, 'utf8')) : { missions: {} };
    const sprints = fs.existsSync(sprintsPath) ? JSON.parse(fs.readFileSync(sprintsPath, 'utf8')) : { sprints: {} };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ missions: missions.missions, sprints: sprints.sprints }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleApiGoalsMissionUpdate(req, res, projectName) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { mission, keyMetrics, currentPhase } = JSON.parse(body);
      const missionPath = path.join(GOALS_DIR, 'mission.json');
      const data = fs.existsSync(missionPath) ? JSON.parse(fs.readFileSync(missionPath, 'utf8')) : { version: '1.0.0', missions: {} };
      if (!data.missions[projectName]) data.missions[projectName] = {};
      if (mission !== undefined) data.missions[projectName].mission = mission;
      if (keyMetrics !== undefined) data.missions[projectName].keyMetrics = keyMetrics;
      if (currentPhase !== undefined) data.missions[projectName].currentPhase = currentPhase;
      data.lastUpdated = new Date().toISOString().split('T')[0];
      fs.writeFileSync(missionPath, JSON.stringify(data, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

function handleApiSprintGoalAdd(req, res, projectName) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { title, priority, assignedSquads } = JSON.parse(body);
      const sprintsPath = path.join(GOALS_DIR, 'sprints.json');
      const data = fs.existsSync(sprintsPath) ? JSON.parse(fs.readFileSync(sprintsPath, 'utf8')) : { version: '1.0.0', sprints: {} };
      if (!data.sprints[projectName]) {
        data.sprints[projectName] = { sprintName: 'Sprint', startDate: '', endDate: '', goals: [] };
      }
      const goals = data.sprints[projectName].goals;
      const prefix = projectName.charAt(0).toUpperCase();
      const nums = goals.map(g => parseInt(g.id.split('-')[1])).filter(n => !isNaN(n));
      const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      const id = `${prefix}-${String(next).padStart(3, '0')}`;
      goals.push({ id, title, priority: priority || 'medium', status: 'todo', assignedSquads: assignedSquads || [] });
      data.lastUpdated = new Date().toISOString().split('T')[0];
      fs.writeFileSync(sprintsPath, JSON.stringify(data, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, saved: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

function handleApiSprintGoalUpdate(req, res, projectName, goalId) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const updates = JSON.parse(body);
      const sprintsPath = path.join(GOALS_DIR, 'sprints.json');
      const data = JSON.parse(fs.readFileSync(sprintsPath, 'utf8'));
      const goal = data.sprints[projectName]?.goals.find(g => g.id === goalId);
      if (!goal) { res.writeHead(404); res.end(JSON.stringify({ error: 'Goal not found' })); return; }
      if (updates.status) goal.status = updates.status;
      if (updates.title) goal.title = updates.title;
      if (updates.priority) goal.priority = updates.priority;
      if (goal.status === 'done') goal.completedAt = new Date().toISOString().split('T')[0];
      data.lastUpdated = new Date().toISOString().split('T')[0];
      fs.writeFileSync(sprintsPath, JSON.stringify(data, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

function handleApiSprintGoalDelete(req, res, projectName, goalId) {
  try {
    const sprintsPath = path.join(GOALS_DIR, 'sprints.json');
    const data = JSON.parse(fs.readFileSync(sprintsPath, 'utf8'));
    const goals = data.sprints[projectName]?.goals;
    if (!goals) { res.writeHead(404); res.end(JSON.stringify({ error: 'Project not found' })); return; }
    const idx = goals.findIndex(g => g.id === goalId);
    if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ error: 'Goal not found' })); return; }
    goals.splice(idx, 1);
    data.lastUpdated = new Date().toISOString().split('T')[0];
    fs.writeFileSync(sprintsPath, JSON.stringify(data, null, 2), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ deleted: true }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============================================================
// Activity Log API Handlers
// ============================================================

function handleApiLogs(req, res, projectName) {
  try {
    const logPath = path.join(LOGS_DIR_PATH, `${projectName}.jsonl`);
    if (!fs.existsSync(logPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }
    const logs = fs.readFileSync(logPath, 'utf8')
      .split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(logs));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleApiLogsSummary(req, res, projectName) {
  try {
    const logPath = path.join(LOGS_DIR_PATH, `${projectName}.jsonl`);
    if (!fs.existsSync(logPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents: {}, total: 0, totalCost: 0 }));
      return;
    }
    const logs = fs.readFileSync(logPath, 'utf8')
      .split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    const agents = {};
    let totalCost = 0;
    logs.forEach(l => {
      if (!agents[l.agent]) agents[l.agent] = { total: 0, success: 0, cost: 0, lastAction: null };
      agents[l.agent].total++;
      if (l.result === 'success' || l.result === 'breakthrough') agents[l.agent].success++;
      if (l.cost) { agents[l.agent].cost += l.cost; totalCost += l.cost; }
      agents[l.agent].lastAction = l;
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents, total: logs.length, totalCost, recentLogs: logs.slice(-20).reverse() }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleApiAllLogs(req, res) {
  try {
    if (!fs.existsSync(LOGS_DIR_PATH)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
      return;
    }
    const result = {};
    fs.readdirSync(LOGS_DIR_PATH).filter(f => f.endsWith('.jsonl')).forEach(f => {
      const project = f.replace('.jsonl', '');
      const logs = fs.readFileSync(path.join(LOGS_DIR_PATH, f), 'utf8')
        .split('\n').filter(l => l.trim())
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      let cost = 0;
      logs.forEach(l => { if (l.cost) cost += l.cost; });
      result[project] = { total: logs.length, cost, recent: logs.slice(-5).reverse() };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============================================================
// File Write API Handler
// ============================================================

function handleApiWrite(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      const { filePath, content } = data;

      // Security: only allow writing to .claude directories
      const resolvedPath = path.resolve(BASE_DIR, filePath);
      if (!resolvedPath.includes('.claude')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '.claude 디렉토리만 쓸 수 있습니다.' }));
        return;
      }

      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resolvedPath, JSON.stringify(content, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let urlPath = decodeURIComponent(url.pathname);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API: Goals endpoints
  if (req.method === 'GET' && urlPath === '/api/goals') {
    handleApiGoals(req, res);
    return;
  }
  if (urlPath.match(/^\/api\/goals\/mission\//) && req.method === 'PUT') {
    const proj = decodeURIComponent(urlPath.replace('/api/goals/mission/', ''));
    handleApiGoalsMissionUpdate(req, res, proj);
    return;
  }
  if (urlPath.match(/^\/api\/goals\/sprint\/[^/]+$/) && req.method === 'POST') {
    const proj = decodeURIComponent(urlPath.replace('/api/goals/sprint/', ''));
    handleApiSprintGoalAdd(req, res, proj);
    return;
  }
  if (urlPath.match(/^\/api\/goals\/sprint\/[^/]+\/[^/]+$/)) {
    const parts = urlPath.replace('/api/goals/sprint/', '').split('/');
    const proj = decodeURIComponent(parts[0]);
    const goalId = decodeURIComponent(parts[1]);
    if (req.method === 'PUT') { handleApiSprintGoalUpdate(req, res, proj, goalId); return; }
    if (req.method === 'DELETE') { handleApiSprintGoalDelete(req, res, proj, goalId); return; }
  }

  // API: Activity Log endpoints
  if (req.method === 'GET' && urlPath === '/api/logs') {
    handleApiAllLogs(req, res);
    return;
  }
  if (req.method === 'GET' && urlPath.match(/^\/api\/logs\/[^/]+\/summary$/)) {
    const proj = decodeURIComponent(urlPath.replace('/api/logs/', '').replace('/summary', ''));
    handleApiLogsSummary(req, res, proj);
    return;
  }
  if (req.method === 'GET' && urlPath.match(/^\/api\/logs\/[^/]+$/) && urlPath !== '/api/logs') {
    const proj = decodeURIComponent(urlPath.replace('/api/logs/', ''));
    handleApiLogs(req, res, proj);
    return;
  }

  // API: Overlay endpoints
  if (req.method === 'GET' && urlPath === '/api/overlays') {
    handleApiOverlaysList(req, res);
    return;
  }

  if (urlPath.startsWith('/api/overlays/') && urlPath !== '/api/overlays') {
    const projectName = decodeURIComponent(urlPath.replace('/api/overlays/', ''));
    if (req.method === 'GET') { handleApiOverlayRead(req, res, projectName); return; }
    if (req.method === 'PUT') { handleApiOverlaySave(req, res, projectName); return; }
    if (req.method === 'DELETE') { handleApiOverlayDelete(req, res, projectName); return; }
  }

  // API: Template endpoints
  if (req.method === 'GET' && urlPath === '/api/templates') {
    handleApiTemplatesList(req, res);
    return;
  }

  if (req.method === 'GET' && urlPath.startsWith('/api/templates/')) {
    const agentName = decodeURIComponent(urlPath.replace('/api/templates/', ''));
    handleApiTemplateRead(req, res, agentName);
    return;
  }

  if (req.method === 'POST' && urlPath.startsWith('/api/templates/')) {
    const agentName = decodeURIComponent(urlPath.replace('/api/templates/', ''));
    handleApiTemplateSave(req, res, agentName);
    return;
  }

  // API: Write file
  if (req.method === 'POST' && urlPath === '/api/write') {
    handleApiWrite(req, res);
    return;
  }

  // API: List projects (scan directories)
  if (urlPath === '/api/projects') {
    try {
      const registry = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'registry.json'), 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(registry.projects));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Static: Dashboard files
  if (urlPath === '/' || urlPath === '/index.html') {
    serveFile(path.join(DASHBOARD_DIR, 'index.html'), res);
    return;
  }

  if (urlPath.startsWith('/dashboard.') || urlPath.startsWith('/styles.')) {
    serveFile(path.join(DASHBOARD_DIR, urlPath.slice(1)), res);
    return;
  }

  // Static: Agent hub data
  if (urlPath.startsWith('/data/')) {
    const dataPath = path.join(AGENTS_DIR, urlPath.replace('/data/', ''));
    serveFile(dataPath, res);
    return;
  }

  // Static: Project files
  if (urlPath.startsWith('/projects/')) {
    const projectPath = path.join(BASE_DIR, urlPath.replace('/projects/', ''));
    serveFile(projectPath, res);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('🎤 K-pop Agent Hub Dashboard');
  console.log('═══════════════════════════════');
  console.log(`📡 http://localhost:${PORT}`);
  console.log('');
  console.log('경로 매핑:');
  console.log(`  /           → ${DASHBOARD_DIR}`);
  console.log(`  /data/      → ${AGENTS_DIR}`);
  console.log(`  /projects/  → ${BASE_DIR}`);
  console.log('');
  console.log('API:');
  console.log('  POST /api/write                       → JSON 파일 쓰기');
  console.log('  GET  /api/projects                    → 프로젝트 목록');
  console.log('  GET  /api/templates                   → 템플릿 목록');
  console.log('  GET  /api/templates/:name             → 템플릿 읽기');
  console.log('  POST /api/templates/:name             → 템플릿 저장 + 재생성');
  console.log('  GET  /api/overlays                    → 오버라이드 목록');
  console.log('  GET  /api/overlays/:project           → 오버라이드 읽기');
  console.log('  PUT  /api/overlays/:project           → 오버라이드 저장');
  console.log('  DELETE /api/overlays/:project         → 오버라이드 초기화');
  console.log('  GET  /api/goals                       → 미션 + 스프린트 목표');
  console.log('  PUT  /api/goals/mission/:project      → 미션 업데이트');
  console.log('  POST /api/goals/sprint/:project       → 스프린트 목표 추가');
  console.log('  PUT  /api/goals/sprint/:project/:id   → 목표 상태 변경');
  console.log('  DELETE /api/goals/sprint/:project/:id → 목표 삭제');
  console.log('  GET  /api/logs                        → 전체 로그 요약');
  console.log('  GET  /api/logs/:project               → 프로젝트 로그');
  console.log('  GET  /api/logs/:project/summary       → 로그 집계');
  console.log('');
  console.log('Ctrl+C로 종료');
  console.log('═══════════════════════════════');
});
