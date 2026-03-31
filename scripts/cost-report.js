#!/usr/bin/env node
/**
 * cost-report.js — 전체/프로젝트별 비용 리포트
 *
 * Usage:
 *   node cost-report.js              # 전체 프로젝트 요약
 *   node cost-report.js <project>    # 단일 프로젝트 상세
 *   node cost-report.js --monthly    # 월별 추이
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');

function loadAllLogs() {
  if (!fs.existsSync(LOGS_DIR)) return {};
  const result = {};
  fs.readdirSync(LOGS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .forEach(f => {
      const project = f.replace('.jsonl', '');
      result[project] = fs.readFileSync(path.join(LOGS_DIR, f), 'utf8')
        .split('\n')
        .filter(l => l.trim())
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
    });
  return result;
}

function formatCost(cost) {
  return cost > 0 ? `$${cost.toFixed(3)}` : '$0.000';
}

// 전체 요약
function showAll(allLogs) {
  console.log('\n💰 전체 프로젝트 비용 리포트\n');
  console.log('프로젝트     활동수    비용       가장 비싼 에이전트');
  console.log('─'.repeat(60));

  let grandTotal = 0;
  let grandCount = 0;

  Object.entries(allLogs).forEach(([project, logs]) => {
    let cost = 0;
    const agentCosts = {};
    logs.forEach(l => {
      const c = l.cost || 0;
      cost += c;
      if (!agentCosts[l.agent]) agentCosts[l.agent] = 0;
      agentCosts[l.agent] += c;
    });

    grandTotal += cost;
    grandCount += logs.length;

    const topAgent = Object.entries(agentCosts).sort((a, b) => b[1] - a[1])[0];
    const topStr = topAgent ? `${topAgent[0]} (${formatCost(topAgent[1])})` : '-';

    console.log(
      `${project.padEnd(12)} ${String(logs.length).padStart(5)}  ${formatCost(cost).padStart(10)}   ${topStr}`
    );
  });

  console.log('─'.repeat(60));
  console.log(`${'TOTAL'.padEnd(12)} ${String(grandCount).padStart(5)}  ${formatCost(grandTotal).padStart(10)}`);
  console.log('');
}

// 단일 프로젝트 상세
function showProject(project, logs) {
  console.log(`\n💰 ${project} 비용 상세\n`);

  // 에이전트별
  const byAgent = {};
  const byModel = {};
  const byDay = {};
  let total = 0;

  logs.forEach(l => {
    const c = l.cost || 0;
    total += c;

    if (!byAgent[l.agent]) byAgent[l.agent] = { cost: 0, count: 0, model: l.model };
    byAgent[l.agent].cost += c;
    byAgent[l.agent].count++;

    const model = l.model || 'unknown';
    if (!byModel[model]) byModel[model] = { cost: 0, count: 0 };
    byModel[model].cost += c;
    byModel[model].count++;

    const day = l.ts ? l.ts.split('T')[0] : 'unknown';
    if (!byDay[day]) byDay[day] = 0;
    byDay[day] += c;
  });

  // 에이전트별 테이블
  console.log('📊 에이전트별');
  Object.entries(byAgent)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([name, d]) => {
      const bar = '█'.repeat(Math.ceil(d.cost * 10));
      console.log(`  ${name.padEnd(8)} ${d.model.padEnd(7)} ${formatCost(d.cost).padStart(8)} (${d.count}회) ${bar}`);
    });

  // 모델별
  console.log('\n📊 모델별');
  Object.entries(byModel)
    .sort((a, b) => b[1].cost - a[1].cost)
    .forEach(([model, d]) => {
      const pct = total > 0 ? Math.round((d.cost / total) * 100) : 0;
      console.log(`  ${model.padEnd(8)} ${formatCost(d.cost).padStart(8)} (${pct}%, ${d.count}회)`);
    });

  // 일별 추이 (최근 14일)
  const days = Object.keys(byDay).sort().slice(-14);
  if (days.length > 0) {
    console.log('\n📊 일별 추이 (최근 14일)');
    days.forEach(day => {
      const c = byDay[day];
      const bar = '▓'.repeat(Math.ceil(c * 20));
      console.log(`  ${day} ${formatCost(c).padStart(8)} ${bar}`);
    });
  }

  console.log(`\n총계: ${formatCost(total)} (${logs.length}건)\n`);
}

// === Main ===
const args = process.argv.slice(2);
const allLogs = loadAllLogs();

if (args.length === 0 || args[0] === '--monthly') {
  showAll(allLogs);
} else {
  const project = args[0];
  if (!allLogs[project]) {
    console.log(`(${project} 로그 없음)`);
    process.exit(0);
  }
  showProject(project, allLogs[project]);
}
