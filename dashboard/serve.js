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
  console.log('  POST /api/write              → JSON 파일 쓰기');
  console.log('  GET  /api/projects           → 프로젝트 목록');
  console.log('  GET  /api/templates          → 템플릿 목록');
  console.log('  GET  /api/templates/:name    → 템플릿 읽기');
  console.log('  POST /api/templates/:name    → 템플릿 저장 + 재생성');
  console.log('  GET  /api/overlays           → 오버라이드 목록');
  console.log('  GET  /api/overlays/:project  → 오버라이드 읽기');
  console.log('  PUT  /api/overlays/:project  → 오버라이드 저장');
  console.log('  DELETE /api/overlays/:project → 오버라이드 초기화');
  console.log('');
  console.log('Ctrl+C로 종료');
  console.log('═══════════════════════════════');
});
