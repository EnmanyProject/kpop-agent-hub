#!/usr/bin/env node
/**
 * clone-project.js - Clone agent setup from one project to another
 * Usage: node clone-project.js <source-project> <target-project> [options]
 * Options:
 *   --stack      Override tech stack (comma-separated)
 *   --customize  Agent customizations ("agent:context,agent:context")
 *   --path       Target project path (default: same as target name)
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..');
const BASE_DIR = path.join(__dirname, '..', '..', '..');

function parseArgs(argv) {
  const positional = [];
  const named = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].replace('--', '');
      named[key] = argv[i + 1] || '';
      i++;
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, named };
}

function loadRegistry() {
  return JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'registry.json'), 'utf8'));
}

function cloneProject(source, target, options) {
  const registry = loadRegistry();

  if (!registry.projects[source]) {
    console.error(`❌ 소스 프로젝트 "${source}"을 찾을 수 없습니다.`);
    process.exit(1);
  }

  if (registry.projects[target]) {
    console.error(`⚠️  대상 프로젝트 "${target}"은 이미 존재합니다.`);
    process.exit(1);
  }

  const sourceProject = registry.projects[source];
  const targetPath = options.path || target;
  const techStack = options.stack
    ? options.stack.split(',').map(s => s.trim())
    : sourceProject.techStack;

  console.log(`\n📋 프로젝트 복제: ${source} → ${target}\n`);

  // Parse customizations
  const customizations = {};
  if (options.customize) {
    options.customize.split(',').forEach(pair => {
      const [agent, context] = pair.split(':');
      customizations[agent.trim()] = {
        additionalContext: context.trim()
      };
    });
  }

  // Build add-project args
  const agents = sourceProject.activeAgents.join(',');
  const addCmd = [
    `node "${path.join(__dirname, 'add-project.js')}"`,
    `--name "${target}"`,
    `--path "${targetPath}"`,
    `--stack "${techStack.join(',')}"`,
    `--agents "${agents}"`,
    `--template "${source}"`,
    `--desc "${target} (cloned from ${source})"`
  ].join(' ');

  try {
    require('child_process').execSync(addCmd, { encoding: 'utf8', stdio: 'inherit' });
  } catch (error) {
    console.error(`❌ 프로젝트 생성 실패: ${error.message}`);
    process.exit(1);
  }

  // Apply customizations to agent-config.json
  if (Object.keys(customizations).length > 0) {
    const configPath = path.join(BASE_DIR, targetPath, '.claude', 'agent-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.customizations = { ...config.customizations, ...customizations };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`\n✅ 커스터마이징 적용:`);
      Object.entries(customizations).forEach(([agent, ctx]) => {
        console.log(`   ${agent}: ${ctx.additionalContext}`);
      });
    }
  }

  console.log(`\n🎉 복제 완료!`);
  console.log(`   소스: ${source} (${sourceProject.activeAgents.length}명)`);
  console.log(`   대상: ${target}`);
  console.log(`   기술 스택: ${techStack.join(', ')}\n`);
}

// CLI
const { positional, named } = parseArgs(process.argv);

if (positional.length < 2) {
  console.log('사용법:');
  console.log('  node clone-project.js <source> <target> [옵션]');
  console.log('');
  console.log('옵션:');
  console.log('  --stack      기술 스택 오버라이드 (쉼표 구분)');
  console.log('  --customize  에이전트 커스터마이징 ("agent:context,agent:context")');
  console.log('  --path       대상 프로젝트 경로');
  console.log('');
  console.log('예시:');
  console.log('  node clone-project.js wedding my-app');
  console.log('  node clone-project.js wedding my-app --stack "Next.js,Supabase"');
  process.exit(1);
}

const [source, target] = positional;
cloneProject(source, target, named);
