#!/usr/bin/env node
/**
 * update-goals.js — 스프린트 목표 관리 CLI
 *
 * Usage:
 *   node update-goals.js mission <project> "미션 텍스트"
 *   node update-goals.js sprint <project> add "제목" [--priority high|medium|low] [--squads dev,qa]
 *   node update-goals.js sprint <project> done <goal-id>
 *   node update-goals.js sprint <project> status <goal-id> <in-progress|todo|done>
 *   node update-goals.js sprint <project> remove <goal-id>
 *   node update-goals.js sprint <project> list
 *   node update-goals.js sprint <project> new "Sprint 이름" --start 2026-04-14 --end 2026-04-27
 */

const fs = require('fs');
const path = require('path');

const GOALS_DIR = path.join(__dirname, '..', 'goals');
const MISSION_PATH = path.join(GOALS_DIR, 'mission.json');
const SPRINTS_PATH = path.join(GOALS_DIR, 'sprints.json');

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJSON(filePath, data) {
  data.lastUpdated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function parseArgs(args) {
  const flags = {};
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] || true;
      i += 2;
    } else {
      i++;
    }
  }
  return flags;
}

// 다음 goal ID 자동 생성 (프로젝트 첫글자 + 3자리 숫자)
function nextGoalId(goals, projectName) {
  const prefix = projectName.charAt(0).toUpperCase();
  const nums = goals
    .map(g => g.id)
    .filter(id => id.startsWith(prefix + '-'))
    .map(id => parseInt(id.split('-')[1], 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

// === Commands ===

function handleMission(project, text) {
  const data = loadJSON(MISSION_PATH) || { version: '1.0.0', missions: {} };
  if (!data.missions[project]) {
    data.missions[project] = { mission: '', keyMetrics: [], currentPhase: 'development' };
  }
  data.missions[project].mission = text;
  saveJSON(MISSION_PATH, data);
  console.log(`✅ ${project} 미션 업데이트: "${text}"`);
}

function handleSprintAdd(project, title, flags) {
  const data = loadJSON(SPRINTS_PATH) || { version: '1.0.0', sprints: {} };
  if (!data.sprints[project]) {
    data.sprints[project] = { sprintName: 'Sprint', startDate: '', endDate: '', goals: [] };
  }

  const goals = data.sprints[project].goals;
  const id = nextGoalId(goals, project);
  const squads = flags.squads ? flags.squads.split(',') : [];

  goals.push({
    id,
    title,
    priority: flags.priority || 'medium',
    status: 'todo',
    assignedSquads: squads
  });

  saveJSON(SPRINTS_PATH, data);
  console.log(`✅ ${project} 목표 추가: [${id}] ${title} (${flags.priority || 'medium'})`);
}

function handleSprintStatus(project, goalId, status) {
  const validStatuses = ['todo', 'in-progress', 'done'];
  if (!validStatuses.includes(status)) {
    console.error(`❌ 유효하지 않은 상태: ${status} (가능: ${validStatuses.join(', ')})`);
    process.exit(1);
  }

  const data = loadJSON(SPRINTS_PATH);
  if (!data || !data.sprints[project]) {
    console.error(`❌ 프로젝트 "${project}" 스프린트 없음`);
    process.exit(1);
  }

  const goal = data.sprints[project].goals.find(g => g.id === goalId);
  if (!goal) {
    console.error(`❌ 목표 "${goalId}" 없음`);
    process.exit(1);
  }

  goal.status = status;
  if (status === 'done') goal.completedAt = new Date().toISOString().split('T')[0];
  saveJSON(SPRINTS_PATH, data);
  console.log(`✅ ${goalId} → ${status}`);
}

function handleSprintDone(project, goalId) {
  handleSprintStatus(project, goalId, 'done');
}

function handleSprintRemove(project, goalId) {
  const data = loadJSON(SPRINTS_PATH);
  if (!data || !data.sprints[project]) {
    console.error(`❌ 프로젝트 "${project}" 스프린트 없음`);
    process.exit(1);
  }

  const idx = data.sprints[project].goals.findIndex(g => g.id === goalId);
  if (idx === -1) {
    console.error(`❌ 목표 "${goalId}" 없음`);
    process.exit(1);
  }

  const removed = data.sprints[project].goals.splice(idx, 1)[0];
  saveJSON(SPRINTS_PATH, data);
  console.log(`🗑️  ${goalId} "${removed.title}" 삭제됨`);
}

function handleSprintList(project) {
  const data = loadJSON(SPRINTS_PATH);
  if (!data || !data.sprints[project]) {
    console.log(`(${project} 스프린트 없음)`);
    return;
  }

  const sprint = data.sprints[project];
  console.log(`\n📋 ${sprint.sprintName} (${sprint.startDate} ~ ${sprint.endDate})`);
  console.log('─'.repeat(50));

  if (sprint.goals.length === 0) {
    console.log('  (목표 없음)');
    return;
  }

  const statusIcon = { 'todo': '○', 'in-progress': '●', 'done': '✓' };
  sprint.goals.forEach(g => {
    const icon = statusIcon[g.status] || '?';
    const pri = g.priority === 'high' ? '🔴' : g.priority === 'low' ? '🟢' : '🟡';
    console.log(`  ${icon} [${g.id}] ${g.title}  ${pri} ${g.priority}  ${g.status}`);
  });
  console.log('');
}

function handleSprintNew(project, sprintName, flags) {
  const data = loadJSON(SPRINTS_PATH) || { version: '1.0.0', sprints: {} };
  data.sprints[project] = {
    sprintName,
    startDate: flags.start || new Date().toISOString().split('T')[0],
    endDate: flags.end || '',
    goals: []
  };
  saveJSON(SPRINTS_PATH, data);
  console.log(`✅ ${project} 새 스프린트: "${sprintName}"`);
}

// === Main ===

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log(`
사용법:
  node update-goals.js mission <project> "미션 텍스트"
  node update-goals.js sprint <project> add "제목" [--priority high] [--squads dev,qa]
  node update-goals.js sprint <project> done <goal-id>
  node update-goals.js sprint <project> status <goal-id> <status>
  node update-goals.js sprint <project> remove <goal-id>
  node update-goals.js sprint <project> list
  node update-goals.js sprint <project> new "Sprint 이름" --start YYYY-MM-DD --end YYYY-MM-DD
  `);
  process.exit(0);
}

const [type, project, ...rest] = args;
const flags = parseArgs(rest);

if (type === 'mission') {
  handleMission(project, rest[0]);
} else if (type === 'sprint') {
  const action = rest[0];
  if (action === 'add') handleSprintAdd(project, rest[1], flags);
  else if (action === 'done') handleSprintDone(project, rest[1]);
  else if (action === 'status') handleSprintStatus(project, rest[1], rest[2]);
  else if (action === 'remove') handleSprintRemove(project, rest[1]);
  else if (action === 'list') handleSprintList(project);
  else if (action === 'new') handleSprintNew(project, rest[1], flags);
  else {
    console.error(`❌ 알 수 없는 액션: ${action}`);
    process.exit(1);
  }
} else {
  console.error(`❌ 알 수 없는 타입: ${type} (mission 또는 sprint)`);
  process.exit(1);
}
