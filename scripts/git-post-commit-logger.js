#!/usr/bin/env node
/**
 * git-post-commit-logger.js — git post-commit hook에서 자동 호출
 * 커밋 정보를 파싱하여 활동 로그에 자동 기록
 *
 * 동작 방식:
 *   1. git log에서 최신 커밋 메시지/파일 추출
 *   2. 커밋 메시지에서 에이전트/액션 자동 감지
 *   3. 프로젝트 이름은 git repo 경로에서 추출
 *   4. logs/{project}.jsonl에 append
 *
 * 설치: 각 프로젝트 .git/hooks/post-commit에서 이 스크립트 호출
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const REGISTRY_PATH = path.join(__dirname, '..', 'registry.json');

// 프로젝트 경로 → 프로젝트 이름 매핑
function detectProject(repoRoot) {
  try {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const dirName = path.basename(repoRoot);
    // registry.projects에서 path가 일치하는 프로젝트 찾기
    for (const [name, proj] of Object.entries(registry.projects || {})) {
      if (proj.path === dirName || name.toLowerCase() === dirName.toLowerCase()) {
        return name;
      }
    }
    // 폴더명을 첫글자 대문자로 반환
    return dirName.charAt(0).toUpperCase() + dirName.slice(1);
  } catch (e) {
    return path.basename(repoRoot);
  }
}

// 커밋 메시지에서 에이전트 이름 감지
function detectAgent(message) {
  // 에이전트 이름 → 커밋 패턴 매핑
  const agentPatterns = [
    { names: ['진', 'Jin'], agent: '진' },
    { names: ['지드래곤', 'G-Dragon', 'GD'], agent: '지드래곤' },
    { names: ['민호', 'Minho'], agent: '민호' },
    { names: ['아이유', 'IU'], agent: '아이유' },
    { names: ['화사', 'Hwasa'], agent: '화사' },
    { names: ['카리나', 'Karina'], agent: '카리나' },
    { names: ['윈터', 'Winter'], agent: '윈터' },
    { names: ['태민', 'Taemin'], agent: '태민' },
    { names: ['정국', 'Jungkook', 'JK'], agent: '정국' },
    { names: ['수호', 'Suho'], agent: '수호' },
    { names: ['수지', 'Suzy'], agent: '수지' },
    { names: ['다현', 'Dahyun'], agent: '다현' },
    { names: ['뷔', 'V', 'Taehyung'], agent: '뷔' },
    { names: ['제니', 'Jennie'], agent: '제니' },
    { names: ['RM', 'Namjoon'], agent: 'RM' },
    { names: ['리사', 'Lisa'], agent: '리사' },
    { names: ['장원영', 'Wonyoung'], agent: '장원영' }
  ];

  for (const { names, agent } of agentPatterns) {
    for (const name of names) {
      if (message.includes(name)) return agent;
    }
  }

  return 'auto'; // 감지 실패 시
}

// 커밋 메시지에서 액션 타입 감지
function detectAction(message) {
  const msg = message.toLowerCase();
  // conventional commits 패턴
  if (msg.startsWith('feat:') || msg.startsWith('feat(') || msg.includes('기능 추가') || msg.includes('구현')) return 'feature';
  if (msg.startsWith('fix:') || msg.startsWith('fix(') || msg.includes('버그') || msg.includes('수정')) return 'debug';
  if (msg.startsWith('refactor:') || msg.includes('리팩토')) return 'refactor';
  if (msg.startsWith('style:') || msg.includes('css') || msg.includes('스타일')) return 'css-update';
  if (msg.startsWith('test:') || msg.includes('테스트')) return 'test';
  if (msg.startsWith('docs:') || msg.includes('문서')) return 'feature';
  if (msg.startsWith('chore:') || msg.includes('설정')) return 'cleanup';
  if (msg.includes('migrate') || msg.includes('마이그레이션') || msg.includes('스키마')) return 'migrate';
  if (msg.includes('deploy') || msg.includes('배포')) return 'deploy-verify';
  if (msg.includes('release') || msg.includes('릴리즈') || msg.includes('버전')) return 'release';
  if (msg.includes('api') || msg.includes('route') || msg.includes('라우트') || msg.includes('엔드포인트')) return 'api-route';
  if (msg.includes('ui') || msg.includes('화면') || msg.includes('컴포넌트') || msg.includes('페이지')) return 'frontend';
  if (msg.includes('db') || msg.includes('쿼리') || msg.includes('query') || msg.includes('sql')) return 'db-query';
  if (msg.includes('review') || msg.includes('리뷰')) return 'code-review';
  if (msg.includes('design') || msg.includes('디자인')) return 'design';
  if (msg.includes('clean') || msg.includes('정리') || msg.includes('제거')) return 'cleanup';
  if (msg.includes('health') || msg.includes('진단')) return 'health';

  return 'feature'; // 기본값
}

// 커밋 메시지에서 결과 감지
function detectResult(message) {
  const msg = message.toLowerCase();
  if (msg.includes('wip') || msg.includes('진행중') || msg.includes('임시')) return 'partial';
  if (msg.includes('fail') || msg.includes('실패') || msg.includes('revert')) return 'failure';
  if (msg.includes('breakthrough') || msg.includes('돌파') || msg.includes('해결!')) return 'breakthrough';
  return 'success';
}

// 에이전트의 모델 조회
function getAgentModel(agentName) {
  try {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const agent = registry.agents[agentName];
    if (agent) return agent.recommendedModel || 'sonnet';
  } catch (e) { /* fallback */ }
  return 'sonnet';
}

// === Main ===
try {
  // git 정보 수집
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const message = execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim();
  const filesRaw = execSync('git diff-tree --no-commit-id --name-only -r HEAD', { encoding: 'utf8' }).trim();
  const files = filesRaw.split('\n').filter(f => f.trim()).slice(0, 10);
  const hash = execSync('git log -1 --pretty=%h', { encoding: 'utf8' }).trim();

  // 자동 감지
  const project = detectProject(repoRoot);
  const agent = detectAgent(message);
  const action = detectAction(message);
  const result = detectResult(message);
  const model = agent !== 'auto' ? getAgentModel(agent) : 'sonnet';

  // 로그 엔트리 생성
  const entry = {
    ts: new Date().toISOString(),
    agent,
    action,
    model,
    goal: null,
    files,
    result,
    summary: message.split('\n')[0].substring(0, 120), // 첫 줄만, 120자 제한
    commit: hash,
    source: 'git-hook'
  };

  // JSONL에 기록
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const logPath = path.join(LOGS_DIR, `${project}.jsonl`);
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');

  // 콘솔 출력 (hook에서 보임)
  console.log(`📝 [${project}] ${agent} → ${action} [${result}]: ${entry.summary.substring(0, 50)}`);

} catch (e) {
  // hook 실패가 commit을 막으면 안 됨 — 조용히 종료
  // 디버깅이 필요하면 아래 주석 해제
  // console.error(`⚠️ activity-log hook error: ${e.message}`);
  process.exit(0);
}
