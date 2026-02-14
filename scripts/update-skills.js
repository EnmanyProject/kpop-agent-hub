#!/usr/bin/env node
/**
 * update-skills.js - Update agent skills externally
 * Usage: node update-skills.js <project> <agent> --skill "skill name" --proficiency 80
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..', '..', '..');
const AGENTS_DIR = path.join(__dirname, '..');

function loadRegistry() {
  return JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'registry.json'), 'utf8'));
}

function getScoresPath(projectName) {
  const registry = loadRegistry();
  const project = registry.projects[projectName];
  if (!project) {
    console.error(`❌ 프로젝트 "${projectName}"을 찾을 수 없습니다.`);
    process.exit(1);
  }
  return path.join(BASE_DIR, project.path || projectName, '.claude', 'agent-scores.json');
}

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

function updateSkills(project, agent, updates) {
  const scorePath = getScoresPath(project);

  if (!fs.existsSync(scorePath)) {
    console.error(`❌ 점수 파일을 찾을 수 없습니다: ${scorePath}`);
    process.exit(1);
  }

  const scores = JSON.parse(fs.readFileSync(scorePath, 'utf8'));

  if (!scores.agents[agent]) {
    console.error(`❌ 에이전트 "${agent}"을 ${project}에서 찾을 수 없습니다.`);
    console.log(`   사용 가능: ${Object.keys(scores.agents).join(', ')}`);
    process.exit(1);
  }

  const memory = scores.agents[agent].developmentMemory;

  if (!memory.technicalKnowledge) {
    memory.technicalKnowledge = {};
  }
  if (!memory.technicalKnowledge.skills) {
    memory.technicalKnowledge.skills = [];
  }

  if (updates.skill) {
    // Check if skill already exists
    const existingIdx = memory.technicalKnowledge.skills.findIndex(
      s => s.name === updates.skill
    );

    const skillEntry = {
      name: updates.skill,
      proficiency: parseInt(updates.proficiency) || 50,
      addedDate: new Date().toISOString().split('T')[0],
      lastUpdated: new Date().toISOString().split('T')[0],
      notes: updates.notes || '',
      source: updates.source || 'external'
    };

    if (existingIdx >= 0) {
      // Update existing
      memory.technicalKnowledge.skills[existingIdx] = {
        ...memory.technicalKnowledge.skills[existingIdx],
        ...skillEntry,
        addedDate: memory.technicalKnowledge.skills[existingIdx].addedDate
      };
      console.log(`\n🔄 기존 기술 업데이트: ${updates.skill}`);
    } else {
      // Add new
      memory.technicalKnowledge.skills.push(skillEntry);
      console.log(`\n✅ 새 기술 추가: ${updates.skill}`);
    }

    scores.lastUpdated = new Date().toISOString();
    fs.writeFileSync(scorePath, JSON.stringify(scores, null, 2), 'utf8');

    console.log(`   에이전트: ${agent} (${project})`);
    console.log(`   숙련도: ${skillEntry.proficiency}%`);
    if (updates.notes) console.log(`   메모: ${updates.notes}`);
    console.log(`   출처: ${skillEntry.source}`);
  }

  if (updates.list) {
    const skills = memory.technicalKnowledge.skills || [];
    if (skills.length === 0) {
      console.log(`\n📋 ${agent} (${project}): 등록된 기술 없음`);
    } else {
      console.log(`\n📋 ${agent} (${project}) 기술 목록:\n`);
      skills.forEach((s, i) => {
        const bar = '▓'.repeat(Math.floor(s.proficiency / 10)) + '░'.repeat(10 - Math.floor(s.proficiency / 10));
        console.log(`  ${i + 1}. ${s.name}`);
        console.log(`     ${bar} ${s.proficiency}%`);
        console.log(`     추가: ${s.addedDate} | 출처: ${s.source}`);
        if (s.notes) console.log(`     메모: ${s.notes}`);
        console.log('');
      });
    }
  }

  if (updates.remove) {
    const idx = memory.technicalKnowledge.skills.findIndex(s => s.name === updates.remove);
    if (idx >= 0) {
      const removed = memory.technicalKnowledge.skills.splice(idx, 1)[0];
      scores.lastUpdated = new Date().toISOString();
      fs.writeFileSync(scorePath, JSON.stringify(scores, null, 2), 'utf8');
      console.log(`\n🗑️  기술 삭제: ${removed.name} (${removed.proficiency}%)`);
    } else {
      console.error(`❌ 기술 "${updates.remove}"을 찾을 수 없습니다.`);
    }
  }
}

// CLI
const { positional, named } = parseArgs(process.argv);

if (positional.length < 2 && !named.help) {
  console.log('사용법:');
  console.log('  node update-skills.js <project> <agent> [옵션]');
  console.log('');
  console.log('옵션:');
  console.log('  --skill        기술명 (추가/업데이트)');
  console.log('  --proficiency  숙련도 (0-100)');
  console.log('  --notes        메모');
  console.log('  --source       출처 (workshop/online/project/self-study/mentoring)');
  console.log('  --list         기술 목록 표시');
  console.log('  --remove       기술 삭제');
  console.log('');
  console.log('예시:');
  console.log('  node update-skills.js wedding 정국 --skill "PostgreSQL 집계 쿼리" --proficiency 90');
  console.log('  node update-skills.js wedding 정국 --list true');
  console.log('  node update-skills.js wedding 정국 --remove "Redis"');
  process.exit(1);
}

const [project, agent] = positional;
updateSkills(project, agent, named);
