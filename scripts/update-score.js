#!/usr/bin/env node
/**
 * update-score.js - Agent score update engine
 * Usage:
 *   node update-score.js <project> <agent> <type> [description]
 *   Types: success, partial, failure, excellent, penalty
 *
 * Examples:
 *   node update-score.js wedding 정국 success "인증 버그 완벽 해결"
 *   node update-score.js wedding 정국 penalty "process:디버깅 순서 위반"
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..');
const BASE_DIR = path.join(__dirname, '..', '..', '..');

function loadRegistry() {
  const registryPath = path.join(AGENTS_DIR, 'registry.json');
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function loadMetrics() {
  const metricsPath = path.join(AGENTS_DIR, 'scoring', 'metrics.json');
  return JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
}

function loadPenalties() {
  const penaltiesPath = path.join(AGENTS_DIR, 'scoring', 'penalties.json');
  return JSON.parse(fs.readFileSync(penaltiesPath, 'utf8'));
}

function getScoresPath(projectName) {
  const registry = loadRegistry();
  const project = registry.projects[projectName];
  const projectPath = project.path || projectName;
  return path.join(BASE_DIR, projectPath, '.claude', 'agent-scores.json');
}

function loadScores(projectName) {
  const scoresPath = getScoresPath(projectName);
  if (!fs.existsSync(scoresPath)) {
    return initializeScores(projectName);
  }
  return JSON.parse(fs.readFileSync(scoresPath, 'utf8'));
}

function saveScores(projectName, scores) {
  const scoresPath = getScoresPath(projectName);
  const dir = path.dirname(scoresPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  scores.lastUpdated = new Date().toISOString();
  fs.writeFileSync(scoresPath, JSON.stringify(scores, null, 2), 'utf8');
}

function initializeScores(projectName) {
  const registry = loadRegistry();
  const metrics = loadMetrics();
  const project = registry.projects[projectName];

  if (!project) {
    console.error(`❌ 프로젝트 "${projectName}"을 찾을 수 없습니다.`);
    process.exit(1);
  }

  const scores = {
    project: projectName,
    lastUpdated: new Date().toISOString(),
    agents: {}
  };

  for (const agentName of project.activeAgents) {
    const agent = registry.agents[agentName];
    scores.agents[agentName] = {
      totalScore: metrics.initialScore,
      rank: getRank(metrics.initialScore),
      currentModel: agent.recommendedModel || 'sonnet',
      modelHistory: [],
      metrics: {
        tasksCompleted: 0,
        successfulTasks: 0,
        successRate: 100,
        avgResponseTime: 0,
        qualityScore: 80,
        userSatisfaction: 4.0,
        consistency: 80
      },
      recentTasks: [],
      developmentMemory: {
        workHistory: [],
        fixPatterns: {
          incorrectDiagnosis: [],
          successfulPatterns: []
        },
        technicalKnowledge: {
          fileExpertise: {},
          techStackProficiency: {},
          skills: []
        },
        codeReviewFeedback: {
          receivedFromOthers: [],
          commonIssues: {}
        },
        learningJourney: {
          since: new Date().toISOString().split('T')[0],
          milestones: [],
          currentFocus: {
            goal: "프로젝트 파악 및 초기 개발",
            progress: "0/10 tasks",
            targetDate: ""
          }
        }
      },
      penalties: [],
      warnings: 0,
      improvementMissions: []
    };
  }

  saveScores(projectName, scores);
  return scores;
}

function getRank(score) {
  if (score >= 900) return 'S';
  if (score >= 800) return 'A';
  if (score >= 700) return 'B';
  if (score >= 600) return 'C';
  return 'D';
}

function getRankEmoji(rank) {
  const emojis = { S: '🏆', A: '🟢', B: '🟡', C: '⚠️', D: '🔴' };
  return emojis[rank] || '❓';
}

function applyFeedback(projectName, agentName, type, description) {
  const scores = loadScores(projectName);
  const metrics = loadMetrics();

  if (!scores.agents[agentName]) {
    console.error(`❌ 에이전트 "${agentName}"을 ${projectName}에서 찾을 수 없습니다.`);
    process.exit(1);
  }

  const agent = scores.agents[agentName];
  const feedbackConfig = metrics.feedbackScoring[type];

  if (!feedbackConfig) {
    console.error(`❌ 알 수 없는 피드백 타입: ${type}`);
    console.log('   사용 가능: success, partial, failure, excellent');
    process.exit(1);
  }

  const oldScore = agent.totalScore;
  agent.totalScore = Math.max(0, Math.min(1000, agent.totalScore + feedbackConfig.scoreChange));
  agent.rank = getRank(agent.totalScore);

  // Update metrics
  agent.metrics.tasksCompleted++;
  if (type === 'success' || type === 'excellent') {
    agent.metrics.successfulTasks++;
  }
  agent.metrics.successRate = Math.round(
    (agent.metrics.successfulTasks / agent.metrics.tasksCompleted) * 100
  );

  // Add to recent tasks
  agent.recentTasks.unshift({
    date: new Date().toISOString().split('T')[0],
    type: type,
    description: description || feedbackConfig.description,
    scoreChange: feedbackConfig.scoreChange,
    newScore: agent.totalScore
  });

  // Keep only last 50 tasks
  if (agent.recentTasks.length > 50) {
    agent.recentTasks = agent.recentTasks.slice(0, 50);
  }

  // Add to work history in development memory
  agent.developmentMemory.workHistory.unshift({
    date: new Date().toISOString().split('T')[0],
    taskType: type === 'success' || type === 'excellent' ? 'success' : type === 'failure' ? 'failure' : 'partial',
    description: description || feedbackConfig.description,
    outcome: type,
    scoreChange: feedbackConfig.scoreChange
  });

  if (agent.developmentMemory.workHistory.length > 50) {
    agent.developmentMemory.workHistory = agent.developmentMemory.workHistory.slice(0, 50);
  }

  saveScores(projectName, scores);

  console.log(`\n📊 점수 업데이트: ${agentName} (${projectName})`);
  console.log(`   ${oldScore} → ${agent.totalScore} (${feedbackConfig.scoreChange > 0 ? '+' : ''}${feedbackConfig.scoreChange})`);
  console.log(`   등급: ${getRankEmoji(agent.rank)} ${agent.rank}`);
  console.log(`   사유: ${description || feedbackConfig.description}`);
}

function applyPenalty(projectName, agentName, penaltyStr, description) {
  const scores = loadScores(projectName);
  const penaltyRules = loadPenalties();

  if (!scores.agents[agentName]) {
    console.error(`❌ 에이전트 "${agentName}"을 ${projectName}에서 찾을 수 없습니다.`);
    process.exit(1);
  }

  // Parse penalty string: "category:description"
  const [category] = penaltyStr.split(':');
  const categoryConfig = penaltyRules.categories[category];

  if (!categoryConfig) {
    console.error(`❌ 알 수 없는 페널티 카테고리: ${category}`);
    console.log('   사용 가능: process, quality, communication, critical');
    process.exit(1);
  }

  const agent = scores.agents[agentName];
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

  // Count recent violations in same category
  const recentViolations = agent.penalties.filter(p =>
    p.category === category &&
    new Date(p.date) > thirtyDaysAgo
  ).length;

  const escalatedViolations = agent.penalties.filter(p =>
    p.category === category &&
    new Date(p.date) > sixtyDaysAgo
  ).length;

  // Determine escalation level
  let level, multiplier, warningLevel;
  if (escalatedViolations >= 3) {
    level = 4;
    multiplier = 3;
    warningLevel = '🚨';
  } else if (recentViolations >= 2) {
    level = 3;
    multiplier = 3;
    warningLevel = '🚨';
  } else if (recentViolations >= 1) {
    level = 2;
    multiplier = 2;
    warningLevel = '🔴';
  } else {
    level = 1;
    multiplier = 1;
    warningLevel = '⚠️';
  }

  const scoreChange = categoryConfig.basePoints * multiplier;
  const oldScore = agent.totalScore;
  agent.totalScore = Math.max(0, agent.totalScore + scoreChange);
  agent.rank = getRank(agent.totalScore);
  agent.warnings = Math.max(agent.warnings, level);

  // Record penalty
  agent.penalties.push({
    date: now.toISOString().split('T')[0],
    category: category,
    categoryName: categoryConfig.name,
    severity: categoryConfig.severity,
    level: level,
    warningLevel: warningLevel,
    scoreChange: scoreChange,
    description: description || penaltyStr,
    multiplier: multiplier
  });

  // Add improvement mission for level 2+
  if (level >= 2) {
    const escalationConfig = penaltyRules.escalation[`level${level}`];
    if (escalationConfig && escalationConfig.improvementMission) {
      agent.improvementMissions.push({
        assignedDate: now.toISOString().split('T')[0],
        category: category,
        level: level,
        requiredSuccesses: escalationConfig.improvementMission.requiredSuccesses,
        recoveryPoints: escalationConfig.improvementMission.recoveryPoints,
        timeLimit: escalationConfig.improvementMission.timeLimit,
        completedSuccesses: 0,
        status: 'active'
      });
    }
  }

  // Record in development memory
  agent.developmentMemory.workHistory.unshift({
    date: now.toISOString().split('T')[0],
    taskType: 'penalty',
    description: `[${categoryConfig.name}] ${description || penaltyStr}`,
    outcome: 'penalty',
    scoreChange: scoreChange
  });

  saveScores(projectName, scores);

  console.log(`\n🚨 페널티 적용: ${agentName} (${projectName})`);
  console.log(`   카테고리: ${categoryConfig.name} (${categoryConfig.severity})`);
  console.log(`   레벨: ${level}차 위반 ${warningLevel}`);
  console.log(`   점수: ${oldScore} → ${agent.totalScore} (${scoreChange})`);
  console.log(`   등급: ${getRankEmoji(agent.rank)} ${agent.rank}`);
  if (level >= 2) {
    console.log(`   ⚡ 개선 미션 할당됨`);
  }
  if (level >= 4) {
    console.log(`   🔄 에이전트 교체 검토 필요!`);
  }
}

// CLI execution
const args = process.argv.slice(2);
if (args.length < 2 || (args.length < 3 && args[1] !== '--init')) {
  console.log('사용법:');
  console.log('  node update-score.js <project> <agent> <type> [description]');
  console.log('');
  console.log('타입:');
  console.log('  success   - 작업 성공 (+15)');
  console.log('  partial   - 부분 성공 (+5)');
  console.log('  failure   - 작업 실패 (-20)');
  console.log('  excellent - 탁월한 성과 (+30)');
  console.log('  penalty   - 페널티 (description에 "category:설명" 형식)');
  console.log('');
  console.log('예시:');
  console.log('  node update-score.js wedding 정국 success "인증 버그 완벽 해결"');
  console.log('  node update-score.js wedding 정국 penalty "process:디버깅 순서 위반"');
  console.log('');
  console.log('초기화:');
  console.log('  node update-score.js <project> --init');
  process.exit(1);
}

const [projectName, agentName, type, ...descParts] = args;
const description = descParts.join(' ');

if (agentName === '--init') {
  console.log(`\n🎤 점수 초기화: ${projectName}\n`);
  initializeScores(projectName);
  console.log('✅ 완료!\n');
} else if (type === 'penalty') {
  applyPenalty(projectName, agentName, description, description);
} else {
  applyFeedback(projectName, agentName, type, description);
}
