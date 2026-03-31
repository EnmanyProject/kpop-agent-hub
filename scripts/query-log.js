#!/usr/bin/env node
/**
 * query-log.js — 활동 로그 조회/집계 CLI
 *
 * Usage:
 *   node query-log.js <project> [options]
 *
 * Options:
 *   --agent <name>     에이전트 필터
 *   --action <type>    액션 필터
 *   --goal <id>        목표 필터
 *   --result <type>    결과 필터
 *   --days <n>         최근 N일 (기본 30)
 *   --limit <n>        최대 출력 수 (기본 20)
 *   --summary          에이전트별 요약 통계
 *   --cost             비용 분석
 *   --json             JSON 출력
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');

function parseArgs(args) {
  const flags = {};
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else {
      i++;
    }
  }
  return flags;
}

function loadLogs(project) {
  const logPath = path.join(LOGS_DIR, `${project}.jsonl`);
  if (!fs.existsSync(logPath)) return [];

  return fs.readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}

function filterLogs(logs, flags) {
  const days = parseInt(flags.days) || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  return logs.filter(log => {
    if (log.ts < cutoff) return false;
    if (flags.agent && log.agent !== flags.agent) return false;
    if (flags.action && log.action !== flags.action) return false;
    if (flags.goal && log.goal !== flags.goal) return false;
    if (flags.result && log.result !== flags.result) return false;
    return true;
  });
}

function formatTime(ts) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

// === 기본 출력: 최근 활동 리스트 ===
function showRecent(logs, flags) {
  const limit = parseInt(flags.limit) || 20;
  const recent = logs.slice(-limit).reverse();

  if (recent.length === 0) {
    console.log('  (활동 로그 없음)');
    return;
  }

  const resultIcon = { success: '✓', failure: '✗', partial: '△', breakthrough: '★' };

  recent.forEach(log => {
    const icon = resultIcon[log.result] || '?';
    const costStr = log.cost ? ` $${log.cost}` : '';
    console.log(`  ${formatTime(log.ts)} ${icon} ${log.agent.padEnd(4)} ${log.action.padEnd(12)} ${log.summary}${costStr}`);
  });
}

// === --summary: 에이전트별 요약 ===
function showSummary(logs, project) {
  const agents = {};

  logs.forEach(log => {
    if (!agents[log.agent]) {
      agents[log.agent] = { total: 0, success: 0, failure: 0, cost: 0, actions: {} };
    }
    const a = agents[log.agent];
    a.total++;
    if (log.result === 'success' || log.result === 'breakthrough') a.success++;
    if (log.result === 'failure') a.failure++;
    if (log.cost) a.cost += log.cost;
    a.actions[log.action] = (a.actions[log.action] || 0) + 1;
  });

  console.log(`\n=== ${project} 활동 요약 (${logs.length}건) ===\n`);
  console.log('에이전트      활동  성공률    비용     주요 액션');
  console.log('─'.repeat(60));

  Object.entries(agents)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([name, data]) => {
      const rate = data.total > 0 ? Math.round((data.success / data.total) * 100) : 0;
      const topAction = Object.entries(data.actions).sort((a, b) => b[1] - a[1])[0];
      const costStr = data.cost > 0 ? `$${data.cost.toFixed(3)}` : '-';
      console.log(
        `${name.padEnd(10)} ${String(data.total).padStart(5)}  ${String(rate + '%').padStart(5)}  ${costStr.padStart(8)}     ${topAction ? topAction[0] : '-'}`
      );
    });
  console.log('');
}

// === --cost: 비용 분석 ===
function showCost(logs, project) {
  const byAgent = {};
  const byModel = {};
  let totalCost = 0;

  logs.forEach(log => {
    const cost = log.cost || 0;
    totalCost += cost;

    if (!byAgent[log.agent]) byAgent[log.agent] = { cost: 0, count: 0, model: log.model };
    byAgent[log.agent].cost += cost;
    byAgent[log.agent].count++;

    const model = log.model || 'unknown';
    if (!byModel[model]) byModel[model] = { cost: 0, count: 0 };
    byModel[model].cost += cost;
    byModel[model].count++;
  });

  console.log(`\n=== ${project} 비용 분석 ===\n`);

  console.log('에이전트별:');
  Object.entries(byAgent)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([name, data]) => {
      console.log(`  ${name.padEnd(10)} (${data.model || '?'})  : $${data.cost.toFixed(3)} (${data.count}회)`);
    });

  console.log('\n모델별:');
  Object.entries(byModel)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([model, data]) => {
      console.log(`  ${model.padEnd(8)} : $${data.cost.toFixed(3)} (${data.count}회)`);
    });

  console.log(`\n총 추정 비용: $${totalCost.toFixed(3)}\n`);
}

// === Main ===

const args = process.argv.slice(2);
if (args.length < 1) {
  console.log(`
사용법:
  node query-log.js <project> [--agent 정국] [--days 7] [--summary] [--cost] [--json]
  `);
  process.exit(0);
}

const project = args[0];
const flags = parseArgs(args.slice(1));

const allLogs = loadLogs(project);
const filtered = filterLogs(allLogs, flags);

if (flags.json) {
  console.log(JSON.stringify(filtered, null, 2));
} else if (flags.summary) {
  showSummary(filtered, project);
} else if (flags.cost) {
  showCost(filtered, project);
} else {
  console.log(`\n📋 ${project} 최근 활동 (${filtered.length}건)\n`);
  showRecent(filtered, flags);
  console.log('');
}
