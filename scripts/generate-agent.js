#!/usr/bin/env node
/**
 * generate-agent.js - Template -> Project agent file generator
 * Usage: node generate-agent.js <project> <agentName>
 * Example: node generate-agent.js wedding 진
 *
 * Merge priority: overlay > agent-config.json (legacy) > registry.json (base)
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..');
const BASE_DIR = require('os').homedir();
const OVERLAYS_DIR = path.join(AGENTS_DIR, 'overlays');

function loadRegistry() {
  const registryPath = path.join(AGENTS_DIR, 'registry.json');
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function loadProjectConfig(projectPath) {
  const configPath = path.join(projectPath, '.claude', 'agent-config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return null;
}

// 목표 계층 로딩 (Paperclip 컨셉)
function loadMission(projectName) {
  const missionPath = path.join(AGENTS_DIR, 'goals', 'mission.json');
  if (fs.existsSync(missionPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(missionPath, 'utf8'));
      return data.missions[projectName] || null;
    } catch (e) { return null; }
  }
  return null;
}

function loadSprint(projectName) {
  const sprintPath = path.join(AGENTS_DIR, 'goals', 'sprints.json');
  if (fs.existsSync(sprintPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(sprintPath, 'utf8'));
      return data.sprints[projectName] || null;
    } catch (e) { return null; }
  }
  return null;
}

function formatSprintGoals(sprint) {
  if (!sprint || !sprint.goals || sprint.goals.length === 0) return '(목표 미설정)';
  const statusIcon = { 'todo': '○', 'in-progress': '●', 'done': '✓' };
  return sprint.goals.map(g => {
    const icon = statusIcon[g.status] || '?';
    return `- ${icon} **${g.id}** ${g.title} (${g.priority}) [${g.status}]`;
  }).join('\n');
}

function loadOverlay(projectName) {
  const overlayPath = path.join(OVERLAYS_DIR, `${projectName}.json`);
  if (fs.existsSync(overlayPath)) {
    try {
      return JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
    } catch (e) {
      console.warn(`  ⚠️  overlay 파싱 실패 (${projectName}): ${e.message}`);
    }
  }
  return null;
}

function getProjectPath(registry, projectName) {
  const project = registry.projects[projectName];
  if (!project) {
    console.error(`❌ 프로젝트 "${projectName}"을 registry에서 찾을 수 없습니다.`);
    process.exit(1);
  }
  return path.join(BASE_DIR, project.path || projectName);
}

function loadTemplate(templateFile) {
  const templatePath = path.join(AGENTS_DIR, 'templates', templateFile);
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ 템플릿 파일을 찾을 수 없습니다: ${templatePath}`);
    process.exit(1);
  }
  return fs.readFileSync(templatePath, 'utf8');
}

function getActiveAgents(registry, projectName) {
  const project = registry.projects[projectName];
  if (!project) return [];
  return project.activeAgents.map(name => {
    const agent = registry.agents[name];
    return `${name} (${agent.role}) - /project:${agent.command}`;
  }).join('\n');
}

function getAgentMatrix(registry, projectName) {
  const project = registry.projects[projectName];
  if (!project) return '';

  const header = '| 에이전트 | 명령어 | 전문 영역 | 투입 시점 |';
  const separator = '|----------|--------|-----------|-----------|';
  const rows = project.activeAgents.map(name => {
    const agent = registry.agents[name];
    return `| **${name}** | \`/project:${agent.command}\` | ${agent.expertise.join(', ')} | ${agent.role} |`;
  });

  return [header, separator, ...rows].join('\n');
}

// 활동 로그 안내 푸터 (git post-commit hook이 자동 기록)
function getActivityLogFooter(agentName, agentCommand, projectName) {
  return `

---

## 활동 기록

git commit 시 post-commit hook이 자동으로 활동을 기록한다.
커밋 메시지에 작업 내용을 명확히 적으면 자동 분류된다.
수동 기록이 필요하면: \`node ${path.join(AGENTS_DIR, 'scripts', 'log-activity.js').replace(/\\/g, '/')} ${projectName} ${agentName} ${agentCommand} [result] "[요약]"\`
`;
}

function getAgentTaskMap(registry, projectName) {
  const project = registry.projects[projectName];
  if (!project) return '';

  const header = '| 에이전트 | 역할 | subagent_type | 권장 모델 | 페르소나 요약 |';
  const separator = '|----------|------|---------------|-----------|---------------|';
  const rows = project.activeAgents
    .filter(name => name !== '진') // manager excluded from delegation targets
    .map(name => {
      const agent = registry.agents[name];
      const personality = agent.personality.split('.')[0]; // first sentence only
      return `| **${name}** | ${agent.role} | \`${agent.subagentType}\` | \`${agent.recommendedModel}\` | ${personality} |`;
    });

  return [header, separator, ...rows].join('\n');
}

function resolveCustomizations(registry, projectConfig, agentName) {
  const customizations = {};

  if (projectConfig && projectConfig.customizations && projectConfig.customizations[agentName]) {
    Object.assign(customizations, projectConfig.customizations[agentName]);
  }

  return customizations;
}

/**
 * resolveAgent - 3-layer merge: overlay > legacy customizations > base registry
 * Returns resolved values for role, expertise, model, additionalContext, and templatePatches.
 */
function resolveAgent(agent, agentName, overlay, customizations) {
  const resolved = {
    role: agent.role,
    expertise: [...agent.expertise],
    model: agent.recommendedModel,
    additionalContext: '',
    templatePatches: { prepend: '', append: '' }
  };

  // Layer 1: legacy customizations (lowest priority override)
  if (customizations.role) resolved.role = customizations.role;
  if (customizations.expertise) resolved.expertise = [...customizations.expertise];
  if (customizations.additionalContext) resolved.additionalContext = customizations.additionalContext;

  // Layer 2: overlay (highest priority override)
  if (overlay) {
    const globalCtx = overlay.globalOverrides && overlay.globalOverrides.additionalContext;
    const agentOverlay = overlay.agents && overlay.agents[agentName];

    // Global overlay context
    if (globalCtx) {
      resolved.additionalContext = resolved.additionalContext
        ? `${resolved.additionalContext}\n\n${globalCtx}`
        : globalCtx;
    }

    // Per-agent overlay
    if (agentOverlay) {
      if (agentOverlay.roleOverride) resolved.role = agentOverlay.roleOverride;
      if (agentOverlay.modelOverride) resolved.model = agentOverlay.modelOverride;

      if (agentOverlay.expertiseOverride) {
        resolved.expertise = [...agentOverlay.expertiseOverride];
      } else if (agentOverlay.expertiseAppend) {
        resolved.expertise = [...resolved.expertise, ...agentOverlay.expertiseAppend];
      }

      if (agentOverlay.additionalContext) {
        resolved.additionalContext = resolved.additionalContext
          ? `${resolved.additionalContext}\n\n${agentOverlay.additionalContext}`
          : agentOverlay.additionalContext;
      }

      if (agentOverlay.templatePatches) {
        if (agentOverlay.templatePatches.prepend) {
          resolved.templatePatches.prepend = agentOverlay.templatePatches.prepend;
        }
        if (agentOverlay.templatePatches.append) {
          resolved.templatePatches.append = agentOverlay.templatePatches.append;
        }
      }
    }
  }

  return resolved;
}

/**
 * applyTemplatePatches - prepend/append content to generated output
 */
function applyTemplatePatches(output, patches) {
  if (!patches) return output;
  let result = output;
  if (patches.prepend) {
    result = patches.prepend + '\n\n' + result;
  }
  if (patches.append) {
    result = result + '\n\n' + patches.append;
  }
  return result;
}

function substituteVariables(template, variables) {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value || '');
  }

  return result;
}

function generateAgent(projectName, agentName) {
  const registry = loadRegistry();
  const agent = registry.agents[agentName];

  if (!agent) {
    console.error(`❌ 에이전트 "${agentName}"을 registry에서 찾을 수 없습니다.`);
    process.exit(1);
  }

  const project = registry.projects[projectName];
  if (!project) {
    console.error(`❌ 프로젝트 "${projectName}"을 registry에서 찾을 수 없습니다.`);
    process.exit(1);
  }

  // Check if agent is active in this project
  if (!project.activeAgents.includes(agentName)) {
    console.log(`⏭️  ${agentName}은 ${projectName} 프로젝트에서 비활성 상태입니다. 건너뜁니다.`);
    return false;
  }

  const projectPath = getProjectPath(registry, projectName);
  const projectConfig = loadProjectConfig(projectPath);
  const customizations = resolveCustomizations(registry, projectConfig, agentName);
  const overlay = loadOverlay(projectName);

  // 목표 계층 로딩
  const mission = loadMission(projectName);
  const sprint = loadSprint(projectName);

  // 3-layer merge: overlay > legacy > base
  const resolved = resolveAgent(agent, agentName, overlay, customizations);

  // Log overlay info if applied
  if (overlay && overlay.agents && overlay.agents[agentName]) {
    const fields = Object.keys(overlay.agents[agentName]);
    console.log(`  🔧 overlay 적용: ${fields.join(', ')}`);
  }

  // Load template
  const template = loadTemplate(agent.templateFile);

  // Build variables
  const variables = {
    AGENT_NAME: agentName,
    AGENT_NAME_EN: agent.nameEn,
    AGENT_ROLE: resolved.role,
    AGENT_ROLE_EN: agent.roleEn,
    AGENT_PERSONALITY: agent.personality,
    AGENT_COMMAND: agent.command,
    RECOMMENDED_MODEL: resolved.model,
    ALTERNATIVE_MODELS: agent.alternativeModels.join(', ') || 'N/A',
    MODEL_RATIONALE: agent.modelRationale,
    PROJECT_NAME: projectName,
    PROJECT_DESCRIPTION: project.description || projectName,
    TECH_STACK: (projectConfig ? projectConfig.techStack : project.techStack).join(', '),
    ACTIVE_AGENTS: getActiveAgents(registry, projectName),
    AGENT_MATRIX: getAgentMatrix(registry, projectName),
    AGENT_TASK_MAP: getAgentTaskMap(registry, projectName),
    ADDITIONAL_CONTEXT: resolved.additionalContext,
    EXPERTISE: resolved.expertise.join(', '),
    CUSTOM_SECTIONS: '',
    // 목표 계층 변수 (Paperclip 컨셉)
    PROJECT_MISSION: mission ? mission.mission : '(미션 미설정)',
    PROJECT_PHASE: mission ? mission.currentPhase : '',
    SPRINT_NAME: sprint ? sprint.sprintName : '(스프린트 미설정)',
    SPRINT_GOALS: formatSprintGoals(sprint),
    AGENTS_SCRIPTS_PATH: path.join(AGENTS_DIR, 'scripts').replace(/\\/g, '/')
  };

  // Substitute
  let output = substituteVariables(template, variables);

  // Apply template patches from overlay
  output = applyTemplatePatches(output, resolved.templatePatches);

  // 활동 로그 푸터 추가 (모든 에이전트)
  output += getActivityLogFooter(agentName, agent.command, projectName);

  // Write to project commands directory
  const commandsDir = path.join(projectPath, '.claude', 'commands');
  if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
  }

  const outputPath = path.join(commandsDir, `${agent.command}.md`);
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`  ✅ ${agentName} (${resolved.role}) → ${outputPath}`);
  return true;
}

// CLI execution
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('사용법: node generate-agent.js <project> <agentName>');
  console.log('예시: node generate-agent.js wedding 진');
  process.exit(1);
}

const [projectName, agentName] = args;
console.log(`\n🎤 에이전트 생성: ${agentName} → ${projectName}\n`);
generateAgent(projectName, agentName);
console.log('\n✅ 완료!\n');
