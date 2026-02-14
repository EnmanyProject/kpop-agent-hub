# K-pop Agent Management System

16명의 K-pop 아이돌 이름 AI 에이전트를 프로젝트 단위로 관리하는 시스템.

---

## 시스템 개요

6개 스쿼드에 16명의 전문 에이전트가 배치되어 있으며, 각 에이전트는 고유한 역할과 전문 분야를 가진다. 중앙 레지스트리(`registry.json`)에서 에이전트/프로젝트/모델 정보를 통합 관리하고, 템플릿 시스템으로 프로젝트별 에이전트 파일을 자동 생성한다.

### 스쿼드 구성

| 스쿼드 | 이름 | 에이전트 | 담당 영역 |
|--------|------|----------|-----------|
| Command | 지휘 | 진 (총괄 매니저) | 프로젝트 관리, 작업 분배 |
| Dev | 개발 | 지드래곤 (풀스택), 민호 (API), 아이유 (프론트엔드), 화사 (CSS) | 전체 개발 |
| Data | 데이터 | 윈터 (DBA), 태민 (마이그레이션) | DB 관리, 스키마 변경 |
| QA | 품질 | 정국 (디버그), 수호 (코드 리뷰), 카리나 (PR 리뷰), 다현 (테스트) | 품질 보증 |
| Ops | 운영 | 뷔 (배포), 제니 (릴리즈), RM (헬스 체크) | 배포, 릴리즈, 모니터링 |
| Maint | 유지보수 | 리사 (리팩토링), 장원영 (클린업) | 코드 개선, 정리 |

### 에이전트 상세

| 에이전트 | 영문명 | 커맨드 | 권장 모델 | 전문 분야 |
|----------|--------|--------|-----------|-----------|
| 진 | Jin | `manager` | opus | 프로젝트 관리, 작업 분배, 품질 검증 |
| 지드래곤 | G-Dragon | `feature` | opus | 풀스택 개발, API+Frontend+DB 전 레이어 |
| 민호 | Minho | `api-route` | sonnet | Express 라우트, CRUD, 미들웨어, 인증 |
| 아이유 | IU | `frontend` | sonnet | UI/UX, DOM 조작, 이벤트 핸들링 |
| 화사 | Hwasa | `css-update` | haiku | CSS, 반응형, 애니메이션, 캐시 버스팅 |
| 윈터 | Winter | `db-query` | sonnet | Raw SQL, 쿼리 최적화, PostgreSQL |
| 태민 | Taemin | `migrate` | opus | DB 마이그레이션, 스키마 변경, 롤백 |
| 정국 | Jungkook | `debug` | sonnet | 체계적 디버깅, 에러 분석, 로그 추적 |
| 수호 | Suho | `code-review` | sonnet | 코드 품질, 보안/성능/타입 7대 검사 |
| 카리나 | Karina | `pr-review` | sonnet | PR 리뷰, 크로스커팅 검증 |
| 다현 | Dahyun | `test` | haiku | E2E 테스트, 단위 테스트, Playwright |
| 뷔 | V | `deploy-verify` | sonnet | 배포 검증, 환경변수, Vercel |
| 제니 | Jennie | `release` | haiku | 버전 관리, CHANGELOG, Git 워크플로우 |
| RM | RM | `health` | sonnet | 시스템 진단, 빌드 검증, 보안 점검 |
| 리사 | Lisa | `refactor` | opus | 코드 리팩토링, 패턴 개선, 구조 최적화 |
| 장원영 | Jang Wonyoung | `cleanup` | haiku | Dead code 제거, 참조 검증, 파일 정리 |

---

## 디렉토리 구조

```
C:\Users\dosik\.claude\agents\
├── registry.json              # 중앙 에이전트 레지스트리 (에이전트/프로젝트/모델 정보)
├── README.md                  # 이 문서
├── templates\                 # 16개 에이전트 템플릿
│   ├── 진-manager.md
│   ├── 지드래곤-fullstack.md
│   ├── 민호-api.md
│   ├── 아이유-frontend.md
│   ├── 화사-css.md
│   ├── 윈터-dba.md
│   ├── 태민-migration.md
│   ├── 정국-debug.md
│   ├── 수호-review.md
│   ├── 카리나-pr.md
│   ├── 다현-test.md
│   ├── 뷔-deploy.md
│   ├── 제니-release.md
│   ├── RM-health.md
│   ├── 리사-refactor.md
│   └── 장원영-cleanup.md
├── scoring\
│   ├── metrics.json           # 점수 산정 기준 (5개 지표, 가중치)
│   └── penalties.json         # 패널티 규칙 (4단계 에스컬레이션)
├── dashboard\
│   ├── serve.js               # 로컬 HTTP 서버 (포트 3456)
│   ├── index.html             # 대시보드 SPA
│   ├── dashboard.js           # 대시보드 로직
│   └── styles.css             # K-pop 테마 스타일
└── scripts\
    ├── generate-agent.js      # 템플릿 -> 프로젝트 에이전트 파일 생성
    ├── generate-all.js        # 전체 에이전트 일괄 생성
    ├── update-score.js        # 점수 업데이트 엔진
    ├── add-project.js         # 신규 프로젝트 등록
    ├── clone-project.js       # 프로젝트 템플릿 복제
    └── update-skills.js       # 에이전트 스킬 관리
```

---

## 빠른 시작

### 1. 대시보드 실행

```bash
node C:\Users\dosik\.claude\agents\dashboard\serve.js
```

브라우저에서 `http://localhost:3456` 접속. 칸반 보드에서 전체 에이전트 현황, 점수, 프로젝트별 상태를 확인할 수 있다.

### 2. 에이전트 호출

프로젝트 내에서 슬래시 커맨드로 에이전트를 호출한다.

```
/프로젝트명:커맨드 작업 내용
```

호출 예시:

```
/wedding:debug 인증 버그 수정
/wedding:feature 방명록 CRUD 구현
/chatgame:frontend 채팅 UI 개선
/gidaryeo:db-query 장소 검색 쿼리 최적화
/wedding:health 전체 시스템 점검
```

---

## CLI 명령어

모든 스크립트는 `C:\Users\dosik\.claude\agents\scripts\` 아래에 위치한다.

### 점수 업데이트

```bash
node scripts/update-score.js <프로젝트> <에이전트> <유형> [설명]
```

유형별 점수 변동:

| 유형 | 점수 변동 | 설명 |
|------|-----------|------|
| `success` | +15 | 작업 성공 |
| `partial` | +5 | 부분 성공 |
| `failure` | -20 | 작업 실패 |
| `excellent` | +30 | 탁월한 성과 |
| `penalty` | 카테고리별 | 패널티 적용 |

예시:

```bash
node scripts/update-score.js wedding 정국 success "로그인 버그 수정 완료"
node scripts/update-score.js chatgame 지드래곤 excellent "채팅 시스템 전면 리팩토링"
node scripts/update-score.js wedding 민호 failure "API 응답 오류 미해결"
```

### 점수 초기화

```bash
node scripts/update-score.js <프로젝트> --init
```

프로젝트 내 모든 에이전트를 초기 점수(800점)로 설정한다.

### 에이전트 파일 생성

```bash
# 단일 에이전트 생성
node scripts/generate-agent.js <프로젝트> <에이전트명>

# 전체 에이전트 일괄 생성
node scripts/generate-all.js [프로젝트]
```

예시:

```bash
node scripts/generate-agent.js wedding 정국
node scripts/generate-all.js wedding
```

### 프로젝트 관리

```bash
# 신규 프로젝트 등록
node scripts/add-project.js --name "프로젝트명" --stack "Express,PostgreSQL" [--agents "진,지드래곤,민호"]

# 기존 프로젝트 복제
node scripts/clone-project.js <원본프로젝트> <대상프로젝트> [--stack "스택 오버라이드"]
```

예시:

```bash
node scripts/add-project.js --name "newproject" --stack "Next.js,Prisma,PostgreSQL" --agents "진,지드래곤,민호,아이유,윈터"
node scripts/clone-project.js wedding newproject --stack "Next.js,Prisma"
```

### 스킬 관리

```bash
node scripts/update-skills.js <프로젝트> <에이전트> --skill "스킬명" --proficiency <숙련도>
```

예시:

```bash
node scripts/update-skills.js wedding 윈터 --skill "PostgreSQL" --proficiency 95
node scripts/update-skills.js chatgame 아이유 --skill "React Hooks" --proficiency 80
```

---

## 점수 시스템

### 기본 구조

- 만점: 1000점
- 초기 점수: 800점 (A등급)
- 5개 지표의 가중 합산으로 산출

### 평가 지표

| 지표 | 가중치 | 배점 | 데이터 소스 |
|------|--------|------|-------------|
| 작업 성공률 (successRate) | 30% | 300점 | git 커밋, 수동 피드백 |
| 코드 품질 (qualityScore) | 25% | 250점 | 코드 리뷰, 수동 피드백 |
| 사용자 만족도 (userSatisfaction) | 20% | 200점 | 수동 피드백 |
| 응답 시간 (responseTime) | 15% | 150점 | git 커밋, 타임스탬프 |
| 일관성 (consistency) | 10% | 100점 | git 커밋, 코드 리뷰 |

### 등급 체계

| 등급 | 점수 범위 | 의미 |
|------|-----------|------|
| S | 900 - 1000 | 최우수 |
| A | 800 - 899 | 우수 |
| B | 700 - 799 | 보통 |
| C | 600 - 699 | 주의 |
| D | 0 - 599 | 개선 필요 |

---

## 패널티 시스템

### 위반 카테고리

| 카테고리 | 기본 감점 | 심각도 | 예시 |
|----------|-----------|--------|------|
| 프로세스 위반 | -15점 | 보통 | 디버깅 순서 미준수, 검증 생략, 테스트 없이 커밋 |
| 품질 문제 | -25점 | 높음 | 버그 유발 코드, 미완성 구현, 보안 취약점 도입 |
| 소통 실패 | -10점 | 낮음 | 거짓 완료 보고, 피드백 무시, 변경사항 미고지 |
| 치명적 오류 | -100점 | 치명 | 데이터 손실, 프로덕션 장애, SQL Injection |

### 4단계 에스컬레이션

**1단계** -- 기본 감점 (1배) + 자동 경고

- 점수 차감: 기본 감점 x 1
- 자동 경고 기록
- 개선 영역 식별

**2단계** -- 같은 카테고리 30일 내 재위반 (2배) + 개선 미션

- 점수 차감: 기본 감점 x 2
- 개선 미션: 5건 성공 시 +30점 회복 (30일 내)

**3단계** -- 같은 카테고리 60일 내 재위반 (3배) + 교체 검토

- 점수 차감: 기본 감점 x 3
- 교체 검토 상태 진입
- 긴급 미션: 8건 성공 시 +50점 회복 (14일 내)

**4단계** -- 4차 위반 또는 치명적 오류 3회

- 에이전트 교체
- 동일 스쿼드 백업 에이전트 투입
- 교체된 에이전트 30일 훈련 상태 후 재평가

### 감쇄 정책

- 동일 카테고리 90일간 위반 없으면 에스컬레이션 레벨 1단계 감소

---

## 프로젝트 커스터마이징

각 프로젝트는 `[프로젝트]/.claude/agent-config.json` 파일로 에이전트 동작을 커스터마이징할 수 있다.

### 설정 항목

```json
{
  "techStack": ["Next.js", "Prisma", "PostgreSQL"],
  "agents": {
    "윈터": {
      "expertise": ["Prisma ORM", "PostgreSQL"],
      "additionalContext": "이 프로젝트는 Prisma를 사용하므로 Raw SQL 대신 Prisma 쿼리 빌더 우선"
    },
    "민호": {
      "expertise": ["Next.js API Routes", "App Router"],
      "additionalContext": "Express 대신 Next.js API Routes 사용"
    }
  },
  "disabledAgents": ["화사", "태민"],
  "modelOverrides": {
    "정국": "opus"
  }
}
```

| 필드 | 설명 |
|------|------|
| `techStack` | 프로젝트 기술 스택 오버라이드 |
| `agents.<이름>.expertise` | 에이전트별 전문 분야 재정의 |
| `agents.<이름>.additionalContext` | 프로젝트 고유 맥락 추가 |
| `disabledAgents` | 비활성화할 에이전트 목록 |
| `modelOverrides` | 에이전트별 모델 오버라이드 |

---

## 배포된 프로젝트 현황

| 프로젝트 | 설명 | 기술 스택 | 활성 에이전트 |
|----------|------|-----------|---------------|
| wedding | 청첩장 웹 애플리케이션 | Express, PostgreSQL, Vanilla JS, Neon DB, Vercel, EJS | 16명 (전원) |
| chatgame | MBTI 로맨스 시뮬레이션 SNS | Next.js, AI Chat, App Router | 9명 (진, 지드래곤, 민호, 아이유, 정국, 수호, 뷔, 제니, RM) |
| gidaryeo | 반려견 동반 장소 앱 | Flutter, Dart, Next.js, Supabase | 10명 (진, 지드래곤, 민호, 아이유, 윈터, 태민, 정국, 카리나, 뷔, RM) |

---

## 템플릿 시스템

에이전트 템플릿(`templates\` 디렉토리)은 변수 치환 방식으로 프로젝트별 에이전트 파일을 생성한다.

### 변수 목록

| 변수 | 용도 |
|------|------|
| `{{PROJECT_NAME}}` | 프로젝트명 |
| `{{TECH_STACK}}` | 기술 스택 목록 |
| `{{AGENT_EXPERTISE}}` | 에이전트 전문 분야 |
| `{{ADDITIONAL_CONTEXT}}` | 프로젝트별 추가 맥락 |

`generate-agent.js`가 레지스트리와 프로젝트 설정을 읽어 변수를 치환한 후, 프로젝트의 `.claude/` 디렉토리에 최종 에이전트 파일을 생성한다.

---

## 모델 비용 매트릭스

에이전트별 권장 모델은 작업 복잡도와 비용 효율성을 고려하여 배정된다.

| 모델 | 비용 ($/1M 토큰) | 속도 | 품질 | 적합 작업 |
|------|-------------------|------|------|-----------|
| haiku | 0.25 | 빠름 | 보통 | 단순 작업, 빠른 피드백 (화사, 다현, 제니, 장원영) |
| sonnet | 3.00 | 보통 | 우수 | 일반 구현, 리뷰 (민호, 아이유, 윈터, 정국, 수호, 카리나, 뷔, RM) |
| opus | 15.00 | 느림 | 최고 | 복잡한 설계, 고난도 (진, 지드래곤, 태민, 리사) |
