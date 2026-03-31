#!/usr/bin/env node
/**
 * bundle-data.js — 배포용 정적 데이터 번들 생성
 * Vercel 배포 전에 실행하여 goals + logs 데이터를 정적 JSON으로 추출
 *
 * Usage: node bundle-data.js
 * Output: dashboard/bundled-data.json
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..');
const GOALS_DIR = path.join(AGENTS_DIR, 'goals');
const LOGS_DIR = path.join(AGENTS_DIR, 'logs');
const OUTPUT_PATH = path.join(__dirname, 'bundled-data.json');

// Goals 로딩
function loadGoals() {
  const missions = {};
  const sprints = {};
  try {
    const mPath = path.join(GOALS_DIR, 'mission.json');
    if (fs.existsSync(mPath)) Object.assign(missions, JSON.parse(fs.readFileSync(mPath, 'utf8')).missions || {});
  } catch (e) { console.warn('  ⚠️ mission.json 로드 실패'); }
  try {
    const sPath = path.join(GOALS_DIR, 'sprints.json');
    if (fs.existsSync(sPath)) Object.assign(sprints, JSON.parse(fs.readFileSync(sPath, 'utf8')).sprints || {});
  } catch (e) { console.warn('  ⚠️ sprints.json 로드 실패'); }
  return { missions, sprints };
}

// Logs 로딩 — 프로젝트별 요약 + 최근 로그
function loadLogs() {
  const result = {};
  if (!fs.existsSync(LOGS_DIR)) return result;

  fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl')).forEach(f => {
    const project = f.replace('.jsonl', '');
    const logs = fs.readFileSync(path.join(LOGS_DIR, f), 'utf8')
      .split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    // 요약 집계
    const agents = {};
    let totalCost = 0;
    logs.forEach(l => {
      if (!agents[l.agent]) agents[l.agent] = { total: 0, success: 0, cost: 0, lastAction: null };
      agents[l.agent].total++;
      if (l.result === 'success' || l.result === 'breakthrough') agents[l.agent].success++;
      if (l.cost) { agents[l.agent].cost += l.cost; totalCost += l.cost; }
      agents[l.agent].lastAction = l;
    });

    result[project] = {
      total: logs.length,
      cost: totalCost,
      recent: logs.slice(-10).reverse(),
      summary: { agents, total: logs.length, totalCost, recentLogs: logs.slice(-20).reverse() }
    };
  });

  return result;
}

// 번들 생성
const goals = loadGoals();
const logs = loadLogs();

const bundle = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  goals,
  logs
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(bundle, null, 2), 'utf8');

const size = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1);
console.log(`\n📦 bundled-data.json 생성 완료 (${size}KB)`);
console.log(`   Goals: ${Object.keys(goals.missions).length} missions, ${Object.keys(goals.sprints).length} sprints`);
console.log(`   Logs: ${Object.keys(logs).length} projects, ${Object.values(logs).reduce((s, l) => s + l.total, 0)} entries\n`);
