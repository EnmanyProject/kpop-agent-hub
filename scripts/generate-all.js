#!/usr/bin/env node
/**
 * generate-all.js - Batch agent file generator
 * Usage:
 *   node generate-all.js              # All projects, all agents
 *   node generate-all.js wedding      # Specific project, all agents
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..');

function loadRegistry() {
  const registryPath = path.join(AGENTS_DIR, 'registry.json');
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function generateForProject(projectName) {
  const registry = loadRegistry();
  const project = registry.projects[projectName];

  if (!project) {
    console.error(`❌ 프로젝트 "${projectName}"을 찾을 수 없습니다.`);
    return { success: 0, skipped: 0, failed: 0 };
  }

  console.log(`\n📁 프로젝트: ${projectName}`);
  console.log(`   기술 스택: ${project.techStack.join(', ')}`);
  console.log(`   활성 에이전트: ${project.activeAgents.length}명`);
  console.log(`   ─────────────────────────────`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const agentName of project.activeAgents) {
    try {
      const result = require('child_process').execSync(
        `node "${path.join(__dirname, 'generate-agent.js')}" "${projectName}" "${agentName}"`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      if (result.includes('✅')) {
        success++;
      } else if (result.includes('⏭️')) {
        skipped++;
      }
    } catch (error) {
      console.error(`  ❌ ${agentName}: ${error.message}`);
      failed++;
    }
  }

  return { success, skipped, failed };
}

// CLI execution
const args = process.argv.slice(2);
const registry = loadRegistry();

console.log('🎤 K-pop Agent Generator');
console.log('═══════════════════════════════\n');

const totals = { success: 0, skipped: 0, failed: 0 };

if (args.length === 0) {
  // All projects
  const projectNames = Object.keys(registry.projects);
  console.log(`📊 전체 프로젝트: ${projectNames.length}개\n`);

  for (const projectName of projectNames) {
    const result = generateForProject(projectName);
    totals.success += result.success;
    totals.skipped += result.skipped;
    totals.failed += result.failed;
  }
} else {
  // Specific project
  const result = generateForProject(args[0]);
  totals.success += result.success;
  totals.skipped += result.skipped;
  totals.failed += result.failed;
}

console.log('\n═══════════════════════════════');
console.log(`📊 결과 요약:`);
console.log(`   ✅ 성공: ${totals.success}`);
console.log(`   ⏭️  건너뜀: ${totals.skipped}`);
console.log(`   ❌ 실패: ${totals.failed}`);
console.log('═══════════════════════════════\n');
