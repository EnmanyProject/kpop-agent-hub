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
const BASE_DIR = path.join(__dirname, '..', '..', '..');
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

function getSelfMemoryFooter(agentName, projectName, projectPath) {
  const scoresPath = path.join(projectPath, '.claude', 'agent-scores.json').replace(/\\/g, '/');
  return `

---

## 이력서 (개발 메모리) 참조 - 필수!

**작업 시작 전, 반드시 자신의 이력서를 읽어라.**

\`\`\`
Read 도구로 다음 파일을 읽는다:
${scoresPath}
\`\`\`

이 파일의 \`agents.${agentName}.developmentMemory\` 섹션에서:

1. **과거 실수 패턴 확인** (\`fixPatterns.incorrectDiagnosis\`)
   - 같은 실수를 반복하지 않는다
   - 과거에 잘못된 접근법이 기록되어 있으면 그 방법을 피한다

2. **성공 패턴 확인** (\`fixPatterns.successfulPatterns\`)
   - 과거에 성공한 접근법이 있으면 우선 사용한다

3. **파일 전문성 확인** (\`technicalKnowledge.fileExpertise\`)
   - 자주 수정한 파일의 성공률을 확인한다
   - 성공률이 낮은 파일은 더 신중하게 접근한다

4. **코드 리뷰 피드백 확인** (\`codeReviewFeedback\`)
   - 수호로부터 받은 피드백 중 반복되는 이슈를 확인한다
   - 같은 지적을 받지 않도록 주의한다

5. **현재 개선 미션 확인** (\`improvementMissions\`)
   - 활성 미션이 있으면 이번 작업에서 개선 기회로 삼는다

**이력서가 없거나 비어있으면 무시하고 작업을 진행한다.**
**이력서 참조에 실패해도 작업은 계속 진행한다.**
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
    CUSTOM_SECTIONS: ''
  };

  // Substitute
  let output = substituteVariables(template, variables);

  // Apply template patches from overlay
  output = applyTemplatePatches(output, resolved.templatePatches);

  // Append self-memory footer to all agents (except manager who evaluates others)
  if (agent.command !== 'manager') {
    output += getSelfMemoryFooter(agentName, projectName, projectPath);
  }

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
