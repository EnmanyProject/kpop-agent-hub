#!/usr/bin/env node
/**
 * log-activity.js — 에이전트 활동 기록 (append-only JSONL)
 * 폐기된 update-score.js를 대체
 *
 * Usage:
 *   node log-activity.js <project> <agent> <action> <result> "summary"
 *     [--goal R-001] [--files file1,file2] [--model sonnet] [--tokens 12500,3200]
 *
 * Actions: feature|debug|api-route|frontend|css-update|db-query|migrate|
 *          code-review|test|deploy-verify|release|health|refactor|cleanup|
 *          design|pr-review|delegate
 *
 * Results: success|failure|partial|breakthrough
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const REGISTRY_PATH = path.join(__dirname, '..', 'registry.json');

const VALID_ACTIONS = [
  'feature', 'debug', 'api-route', 'frontend', 'css-update', 'db-query',
  'migrate', 'code-review', 'test', 'deploy-verify', 'release', 'health',
  'refactor', 'cleanup', 'design', 'pr-review', 'delegate'
];

const VALID_RESULTS = ['success', 'failure', 'partial', 'breakthrough'];

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

// registry에서 모델 비용 조회
function getModelCost(model) {
  try {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const matrix = registry.modelCostMatrix || {};
    const m = matrix[model];
    if (m) {
      return {
        input: m.inputCostPerMillion || m.costPerMillionTokens || 0,
        output: m.outputCostPerMillion || (m.costPerMillionTokens * 5) || 0
      };
    }
  } catch (e) { /* fallback */ }
  // 기본값
  const defaults = {
    haiku: { input: 0.25, output: 1.25 },
    sonnet: { input: 3, output: 15 },
    opus: { input: 15, output: 75 }
  };
  return defaults[model] || defaults.sonnet;
}

// 에이전트 이름으로 기본 모델 조회
function getAgentModel(agentName) {
  try {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const agent = registry.agents[agentName];
    if (agent) return agent.recommendedModel || 'sonnet';
  } catch (e) { /* fallback */ }
  return 'sonnet';
}

// 비용 계산
function computeCost(model, inputTokens, outputTokens) {
  const rates = getModelCost(model);
  return ((inputTokens / 1_000_000) * rates.input) + ((outputTokens / 1_000_000) * rates.output);
}

// === Main ===

const args = process.argv.slice(2);
if (args.length < 5) {
  console.log(`
사용법:
  node log-activity.js <project> <agent> <action> <result> "summary"
    [--goal R-001] [--files file1,file2] [--model sonnet] [--tokens input,output]

Actions: ${VALID_ACTIONS.join(', ')}
Results: ${VALID_RESULTS.join(', ')}
  `);
  process.exit(0);
}

const [project, agent, action, result, summary] = args;
const flags = parseArgs(args.slice(5));

// 유효성 검사
if (!VALID_ACTIONS.includes(action)) {
  console.error(`❌ 유효하지 않은 action: ${action}\n가능: ${VALID_ACTIONS.join(', ')}`);
  process.exit(1);
}
if (!VALID_RESULTS.includes(result)) {
  console.error(`❌ 유효하지 않은 result: ${result}\n가능: ${VALID_RESULTS.join(', ')}`);
  process.exit(1);
}

// 로그 엔트리 생성
const model = flags.model || getAgentModel(agent);
const entry = {
  ts: new Date().toISOString(),
  agent,
  action,
  model,
  goal: flags.goal || null,
  files: flags.files ? flags.files.split(',').slice(0, 10) : [],
  result,
  summary: summary || ''
};

// 토큰/비용 계산
if (flags.tokens) {
  const [inp, out] = flags.tokens.split(',').map(Number);
  if (!isNaN(inp) && !isNaN(out)) {
    entry.tokens = { input: inp, output: out };
    entry.cost = Math.round(computeCost(model, inp, out) * 1000) / 1000;
  }
}

// 로그 디렉토리 확인
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Append-only 기록
const logPath = path.join(LOGS_DIR, `${project}.jsonl`);
const line = JSON.stringify(entry) + '\n';

try {
  fs.appendFileSync(logPath, line, 'utf8');
  const costStr = entry.cost ? ` ($${entry.cost})` : '';
  console.log(`📝 ${agent} → ${action} [${result}]${costStr}: ${summary}`);
} catch (e) {
  console.error(`❌ 로그 기록 실패: ${e.message}`);
  process.exit(1);
}
