#!/usr/bin/env node
/**
 * add-project.js - Register a new project in the agent system
 * Usage: node add-project.js --name "project" --stack "Express,PostgreSQL" --agents "진,지드래곤,민호"
 * Options:
 *   --name       Project name (required)
 *   --path       Project path relative to base (default: same as name)
 *   --stack      Comma-separated tech stack (required)
 *   --agents     Comma-separated agent names (default: core agents)
 *   --template   Template project to copy from (optional)
 *   --desc       Project description (optional)
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..');
const BASE_DIR = path.join(__dirname, '..', '..', '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].replace('--', '');
      args[key] = argv[i + 1] || '';
      i++;
    }
  }
  return args;
}

function loadRegistry() {
  const registryPath = path.join(AGENTS_DIR, 'registry.json');
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function saveRegistry(registry) {
  const registryPath = path.join(AGENTS_DIR, 'registry.json');
  registry.lastUpdated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
}

const DEFAULT_AGENTS = ['진', '지드래곤', '민호', '아이유', '정국', '수호', '뷔', '제니', 'RM'];

function addProject(options) {
  const { name, stack, template, desc } = options;
  const projectPath = options.path || name;
  const agents = options.agents
    ? options.agents.split(',').map(a => a.trim())
    : DEFAULT_AGENTS;

  if (!name) {
    console.error('❌ --name 옵션이 필요합니다.');
    process.exit(1);
  }
  if (!stack) {
    console.error('❌ --stack 옵션이 필요합니다.');
    process.exit(1);
  }

  const registry = loadRegistry();

  // Check if project already exists
  if (registry.projects[name]) {
    console.error(`⚠️  프로젝트 "${name}"은 이미 등록되어 있습니다.`);
    process.exit(1);
  }

  // Validate agent names
  const invalidAgents = agents.filter(a => !registry.agents[a]);
  if (invalidAgents.length > 0) {
    console.error(`❌ 알 수 없는 에이전트: ${invalidAgents.join(', ')}`);
    process.exit(1);
  }

  const techStack = stack.split(',').map(s => s.trim());
  const allAgentNames = Object.keys(registry.agents);
  const disabledAgents = allAgentNames.filter(a => !agents.includes(a));

  console.log(`\n🚀 새 프로젝트 생성: ${name}\n`);

  // 1. Update registry.json
  registry.projects[name] = {
    path: projectPath,
    techStack: techStack,
    activeAgents: agents,
    disabledAgents: disabledAgents,
    customizations: {},
    description: desc || name
  };

  // Copy customizations from template if specified
  if (template && registry.projects[template]) {
    console.log(`📋 템플릿 프로젝트: ${template}`);
  }

  saveRegistry(registry);
  console.log(`✅ registry.json 업데이트 완료`);

  // 2. Create project .claude directory
  const fullProjectPath = path.join(BASE_DIR, projectPath, '.claude');
  const commandsPath = path.join(fullProjectPath, 'commands');

  if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandsPath, { recursive: true });
    console.log(`✅ 폴더 생성: ${fullProjectPath}`);
  }

  // 3. Create agent-config.json
  const config = {
    project: name,
    techStack: techStack,
    customizations: {},
    disabledAgents: disabledAgents,
    modelOverrides: {},
    createdDate: new Date().toISOString().split('T')[0]
  };

  fs.writeFileSync(
    path.join(fullProjectPath, 'agent-config.json'),
    JSON.stringify(config, null, 2),
    'utf8'
  );
  console.log(`✅ agent-config.json 생성 완료`);

  // 4. Initialize agent-scores.json
  const scores = {
    project: name,
    lastUpdated: new Date().toISOString(),
    agents: {}
  };

  agents.forEach(agentName => {
    const agent = registry.agents[agentName];
    scores.agents[agentName] = {
      totalScore: 800,
      rank: 'A',
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
        fixPatterns: { incorrectDiagnosis: [], successfulPatterns: [] },
        technicalKnowledge: { fileExpertise: {}, techStackProficiency: {}, skills: [] },
        codeReviewFeedback: { receivedFromOthers: [], commonIssues: {} },
        learningJourney: {
          since: new Date().toISOString().split('T')[0],
          milestones: [],
          currentFocus: { goal: '프로젝트 파악 및 초기 개발', progress: '0/10 tasks', targetDate: '' }
        }
      },
      penalties: [],
      warnings: 0,
      improvementMissions: []
    };
  });

  fs.writeFileSync(
    path.join(fullProjectPath, 'agent-scores.json'),
    JSON.stringify(scores, null, 2),
    'utf8'
  );
  console.log(`✅ agent-scores.json 초기화 완료`);

  // 5. Generate agent command files
  console.log(`\n📝 에이전트 파일 생성 중...\n`);
  let generated = 0;
  agents.forEach(agentName => {
    try {
      const result = require('child_process').execSync(
        `node "${path.join(__dirname, 'generate-agent.js')}" "${name}" "${agentName}"`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      if (result.includes('✅')) generated++;
    } catch (error) {
      console.error(`  ❌ ${agentName}: ${error.message.split('\n')[0]}`);
    }
  });

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🎉 프로젝트 "${name}" 생성 완료!`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`📁 위치: ${path.join(BASE_DIR, projectPath, '.claude')}`);
  console.log(`👥 활성 에이전트: ${agents.length}명 (생성: ${generated}명)`);
  console.log(`🔧 기술 스택: ${techStack.join(', ')}`);
  console.log(`${'═'.repeat(50)}\n`);
}

// CLI execution
const args = parseArgs(process.argv);

if (!args.name) {
  console.log('사용법:');
  console.log('  node add-project.js --name "project" --stack "Express,PostgreSQL" [옵션]');
  console.log('');
  console.log('필수 옵션:');
  console.log('  --name      프로젝트명');
  console.log('  --stack     기술 스택 (쉼표 구분)');
  console.log('');
  console.log('선택 옵션:');
  console.log('  --path      프로젝트 경로 (기본: name과 동일)');
  console.log('  --agents    활성 에이전트 (쉼표 구분, 기본: 핵심 9명)');
  console.log('  --template  템플릿 프로젝트명');
  console.log('  --desc      프로젝트 설명');
  console.log('');
  console.log('예시:');
  console.log('  node add-project.js --name quiz --stack "Express,React Native,PostgreSQL,Redis"');
  console.log('  node add-project.js --name chatgame --path "chatgame/sns-app" --stack "Next.js,AI Chat"');
  process.exit(1);
}

addProject(args);
