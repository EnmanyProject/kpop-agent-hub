#!/usr/bin/env node
/**
 * install-hooks.js — 모든 등록된 프로젝트에 git post-commit hook 설치
 *
 * Usage:
 *   node install-hooks.js              # 전체 프로젝트 설치
 *   node install-hooks.js <project>    # 특정 프로젝트만
 *   node install-hooks.js --remove     # 전체 hook 제거
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..');
const LOGGER_PATH = path.join(__dirname, 'git-post-commit-logger.js').replace(/\\/g, '/');
// 홈 디렉토리 자동 감지 (경로 차이 해소: ~/.claude/agents/ vs ~/agents/)
const BASE_DIR = require('os').homedir();

const HOOK_MARKER = '# K-pop Agent Hub Activity Logger';

function getHookContent() {
  return `#!/bin/sh
${HOOK_MARKER}
node "${LOGGER_PATH}" 2>/dev/null || true
`;
}

function installHook(projectName, projectPath) {
  const hooksDir = path.join(projectPath, '.git', 'hooks');

  // .git 디렉토리 존재 확인
  if (!fs.existsSync(path.join(projectPath, '.git'))) {
    console.log(`  ⏭️  ${projectName}: .git 없음 — 건너뜀`);
    return false;
  }

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = path.join(hooksDir, 'post-commit');

  // 기존 hook이 있으면 우리 마커가 이미 있는지 확인
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');
    if (existing.includes(HOOK_MARKER)) {
      console.log(`  ✅ ${projectName}: 이미 설치됨`);
      return true;
    }
    // 기존 hook에 추가 (기존 내용 보존)
    const appended = existing.trimEnd() + '\n\n' + HOOK_MARKER + '\n' + `node "${LOGGER_PATH}" 2>/dev/null || true\n`;
    fs.writeFileSync(hookPath, appended, { mode: 0o755 });
    console.log(`  ✅ ${projectName}: 기존 hook에 추가됨`);
    return true;
  }

  // 새 hook 생성
  fs.writeFileSync(hookPath, getHookContent(), { mode: 0o755 });
  console.log(`  ✅ ${projectName}: hook 설치 완료`);
  return true;
}

function removeHook(projectName, projectPath) {
  const hookPath = path.join(projectPath, '.git', 'hooks', 'post-commit');
  if (!fs.existsSync(hookPath)) {
    console.log(`  ⏭️  ${projectName}: hook 없음`);
    return;
  }

  const content = fs.readFileSync(hookPath, 'utf8');
  if (!content.includes(HOOK_MARKER)) {
    console.log(`  ⏭️  ${projectName}: 우리 hook이 아님`);
    return;
  }

  // 우리 부분만 제거
  const lines = content.split('\n');
  const filtered = [];
  let skip = false;
  for (const line of lines) {
    if (line.includes(HOOK_MARKER)) { skip = true; continue; }
    if (skip && line.includes('git-post-commit-logger')) { skip = false; continue; }
    skip = false;
    filtered.push(line);
  }

  const remaining = filtered.join('\n').trim();
  if (!remaining || remaining === '#!/bin/sh') {
    fs.unlinkSync(hookPath);
    console.log(`  🗑️  ${projectName}: hook 제거됨`);
  } else {
    fs.writeFileSync(hookPath, remaining + '\n', { mode: 0o755 });
    console.log(`  🗑️  ${projectName}: 우리 부분만 제거됨`);
  }
}

// === Main ===
const args = process.argv.slice(2);
const isRemove = args.includes('--remove');
const targetProject = args.find(a => !a.startsWith('--'));

let registry;
try {
  registry = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'registry.json'), 'utf8'));
} catch (e) {
  console.error('❌ registry.json 로드 실패');
  process.exit(1);
}

console.log(`\n🔧 Git Hook ${isRemove ? '제거' : '설치'}\n`);

const projects = targetProject
  ? { [targetProject]: registry.projects[targetProject] }
  : registry.projects;

let count = 0;
for (const [name, proj] of Object.entries(projects)) {
  if (!proj) { console.log(`  ❌ ${name}: registry에 없음`); continue; }
  const projectPath = path.join(BASE_DIR, proj.path || name);
  if (!fs.existsSync(projectPath)) {
    console.log(`  ⏭️  ${name}: 경로 없음 (${projectPath})`);
    continue;
  }
  if (isRemove) {
    removeHook(name, projectPath);
  } else {
    if (installHook(name, projectPath)) count++;
  }
}

console.log(`\n${isRemove ? '제거' : '설치'} 완료: ${count}개 프로젝트\n`);
