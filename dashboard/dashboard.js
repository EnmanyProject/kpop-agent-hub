/**
 * K-pop Agent Hub Dashboard
 * Vanilla JS application for managing K-pop themed AI agents
 * No external dependencies required
 */

class AgentDashboard {
  constructor() {
    this.registry = null;
    this.projectScores = {};
    this.projectOverlays = {};
    this.goalsData = { missions: {}, sprints: {} };
    this.logsData = {};
    this.logsSummary = {};
    this.currentView = 'overview';
    this.currentProject = null;
    this.refreshInterval = null;
    this.draggedAgent = null;

    this.init();
  }

  async init() {
    await this.loadAllData();
    this.bindGlobalEvents();
    this.renderMainView();
    this.startAutoRefresh();
  }

  // ============================================================
  // Data Loading
  // ============================================================

  async loadRegistry() {
    try {
      const res = await fetch('/data/registry.json');
      if (res.ok) {
        this.registry = await res.json();
        return;
      }
    } catch (e) { /* fall through */ }
    try {
      const res = await fetch('../registry.json');
      if (res.ok) {
        this.registry = await res.json();
        return;
      }
    } catch (e) { /* fall through */ }
    this.registry = this.generateFallbackRegistry();
  }

  async loadBundledScores() {
    if (this._bundledScores !== undefined) return this._bundledScores;
    try {
      const res = await fetch('bundled-scores.json');
      if (res.ok) {
        const data = await res.json();
        this._bundledScores = data.projects || {};
        return this._bundledScores;
      }
    } catch (e) { /* not available */ }
    this._bundledScores = null;
    return null;
  }

  async loadProjectScores(projectName) {
    if (this.projectScores[projectName]) return this.projectScores[projectName];

    const project = this.registry.projects[projectName];
    if (!project) return null;

    // 1. Try bundled scores (works on both localhost and Vercel)
    const bundled = await this.loadBundledScores();
    if (bundled && bundled[projectName]) {
      this.projectScores[projectName] = bundled[projectName];
      return bundled[projectName];
    }

    // 2. Try direct file access (localhost only)
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal) {
      const paths = [
        `/projects/${project.path}/.claude/agent-scores.json`,
        `../../${project.path}/.claude/agent-scores.json`
      ];
      for (const path of paths) {
        try {
          const res = await fetch(path);
          if (res.ok) {
            const data = await res.json();
            this.projectScores[projectName] = data;
            return data;
          }
        } catch (e) { /* try next path */ }
      }
    }

    // 3. Fallback: generate random scores
    this.projectScores[projectName] = this.generateFallbackScores(projectName);
    return this.projectScores[projectName];
  }

  async loadProjectOverlays() {
    try {
      const res = await fetch('/api/overlays');
      if (res.ok) {
        this.projectOverlays = await res.json();
        return;
      }
    } catch (e) { /* fall through */ }

    // Fallback: try loading individual overlay files
    const projectNames = Object.keys(this.registry.projects || {});
    for (const name of projectNames) {
      try {
        const res = await fetch(`/data/overlays/${name}.json`);
        if (res.ok) {
          this.projectOverlays[name] = await res.json();
        }
      } catch (e) { /* skip */ }
    }
  }

  hasOverrides(projectName, agentName) {
    const overlay = this.projectOverlays[projectName];
    if (!overlay || !overlay.agents) return false;
    const agentOverlay = overlay.agents[agentName];
    return agentOverlay && Object.keys(agentOverlay).length > 0;
  }

  async loadGoals() {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        this.goalsData = await res.json();
      }
    } catch (e) { /* fallback */ }
  }

  async loadAllLogs() {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        this.logsData = await res.json();
      }
    } catch (e) { /* fallback */ }
  }

  async loadProjectLogSummary(projectName) {
    if (this.logsSummary[projectName]) return;
    try {
      const res = await fetch(`/api/logs/${encodeURIComponent(projectName)}/summary`);
      if (res.ok) this.logsSummary[projectName] = await res.json();
    } catch (e) { /* fallback */ }
  }

  async loadAllData() {
    await this.loadRegistry();
    if (!this.registry) return;

    const projectNames = Object.keys(this.registry.projects || {});
    await Promise.all([
      ...projectNames.map(name => this.loadProjectScores(name)),
      ...projectNames.map(name => this.loadProjectLogSummary(name)),
      this.loadProjectOverlays(),
      this.loadGoals(),
      this.loadAllLogs()
    ]);
  }

  generateFallbackRegistry() {
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString().slice(0, 10),
      squads: {
        command: { name: 'Command Squad', nameKr: '\uc9c0\ud718', description: 'Project management', color: '#FFD700' },
        dev: { name: 'Dev Squad', nameKr: '\uac1c\ubc1c', description: 'Full-stack development', color: '#4CAF50' },
        data: { name: 'Data Squad', nameKr: '\ub370\uc774\ud130', description: 'Database management', color: '#2196F3' },
        qa: { name: 'QA Squad', nameKr: '\ud488\uc9c8', description: 'Quality assurance', color: '#9C27B0' },
        ops: { name: 'Ops Squad', nameKr: '\uc6b4\uc601', description: 'Operations', color: '#FF5722' },
        maint: { name: 'Maint Squad', nameKr: '\uc720\uc9c0\ubcf4\uc218', description: 'Maintenance', color: '#607D8B' }
      },
      agents: {},
      projects: {},
      modelCostMatrix: {
        haiku: { costPerMillionTokens: 0.25, speed: 3, quality: 2, recommendedFor: 'Simple tasks' },
        sonnet: { costPerMillionTokens: 3.00, speed: 2, quality: 4, recommendedFor: 'General work' },
        opus: { costPerMillionTokens: 15.00, speed: 1, quality: 5, recommendedFor: 'Complex tasks' }
      }
    };
  }

  generateFallbackScores(projectName) {
    const agents = this.registry.agents || {};
    const project = this.registry.projects[projectName];
    const activeAgents = project ? project.activeAgents : Object.keys(agents);
    const scores = { project: projectName, lastUpdated: new Date().toISOString(), agents: {} };

    activeAgents.forEach(name => {
      const agent = agents[name];
      if (!agent) return;
      const base = 800;
      const variance = Math.floor(Math.random() * 160) - 40;
      const score = Math.max(500, Math.min(980, base + variance));
      scores.agents[name] = {
        totalScore: score,
        metrics: {
          successRate: Math.floor(70 + Math.random() * 30),
          qualityScore: Math.floor(65 + Math.random() * 35),
          responseTime: Math.floor(60 + Math.random() * 40),
          userSatisfaction: +(3 + Math.random() * 2).toFixed(1),
          consistency: Math.floor(70 + Math.random() * 30)
        },
        rank: this.calculateRank(score),
        model: agent.recommendedModel || 'sonnet',
        penalties: [],
        improvementMissions: [],
        recentTasks: this.generateSampleTasks(),
        developmentMemory: {
          workHistory: ['Initial assignment', 'Setup complete'],
          fixPatterns: [],
          expertise: agent.expertise || [],
          learningNotes: []
        },
        externalSkills: agent.expertise ? agent.expertise.slice(0, 2) : []
      };
    });

    return scores;
  }

  generateSampleTasks() {
    const tasks = [
      { name: 'Initial setup', status: 'success', scoreChange: 15, date: '2026-02-13' },
      { name: 'Configuration', status: 'success', scoreChange: 10, date: '2026-02-13' }
    ];
    return tasks;
  }

  // ============================================================
  // Calculations & Utilities
  // ============================================================

  calculateRank(score) {
    if (score >= 900) return 'S';
    if (score >= 800) return 'A';
    if (score >= 700) return 'B';
    if (score >= 600) return 'C';
    return 'D';
  }

  getRankEmoji(rank) {
    const map = { S: '\ud83c\udfc6', A: '\ud83d\udfe2', B: '\ud83d\udfe1', C: '\u26a0\ufe0f', D: '\ud83d\udd34' };
    return map[rank] || '';
  }

  getRankColor(rank) {
    const map = { S: '#FFD700', A: '#4CAF50', B: '#2196F3', C: '#FF9800', D: '#F44336' };
    return map[rank] || '#9a9ab8';
  }

  getRankClass(rank) {
    return `rank-${rank.toLowerCase()}`;
  }

  getModelIcon(model) {
    const map = {
      opus: { label: 'Opus', icon: '\u26a1', cls: 'model-opus' },
      sonnet: { label: 'Sonnet', icon: '\u266b', cls: 'model-sonnet' },
      haiku: { label: 'Haiku', icon: '\u2744', cls: 'model-haiku' }
    };
    return map[model] || map.sonnet;
  }

  calculateOverallStats() {
    const allAgents = [];
    let totalScore = 0;
    let warningCount = 0;
    const projectCount = Object.keys(this.registry.projects || {}).length;

    Object.entries(this.projectScores).forEach(([projName, projData]) => {
      if (!projData || !projData.agents) return;
      Object.entries(projData.agents).forEach(([name, data]) => {
        allAgents.push({ name, project: projName, ...data });
        totalScore += data.totalScore || 0;
        if ((data.totalScore || 0) < 700) warningCount++;
      });
    });

    const avgScore = allAgents.length > 0 ? Math.round(totalScore / allAgents.length) : 0;
    const sorted = [...allAgents].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    const topPerformers = sorted.slice(0, 3);
    const warnings = sorted.filter(a => (a.totalScore || 0) < 700);

    return {
      totalAgents: allAgents.length,
      avgScore,
      projectCount,
      warningCount,
      topPerformers,
      warnings,
      allAgents: sorted
    };
  }

  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch (e) {
      return dateStr;
    }
  }

  createProgressBar(value, max, color) {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return `
      <div class="progress-bar-container">
        <div class="progress-bar animated" style="width:${pct}%;background:${color};"></div>
      </div>`;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================================
  // Rendering - Main View
  // ============================================================

  renderMainView() {
    const main = document.getElementById('app-main');
    const stats = this.calculateOverallStats();
    const projects = Object.keys(this.registry.projects || {});

    let html = '';

    // Stats Grid (활동 로그 기반)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let weekActivity = 0, weekCost = 0, activeGoals = 0;
    Object.values(this.logsData).forEach(p => {
      weekActivity += (p.recent || []).filter(l => l.ts >= weekAgo).length;
      // 전체 활동 카운트 사용 (정확한 주간 필터는 서버에서)
      weekActivity = Math.max(weekActivity, p.total || 0);
      weekCost += p.cost || 0;
    });
    Object.values(this.goalsData.sprints || {}).forEach(s => {
      activeGoals += (s.goals || []).filter(g => g.status === 'in-progress' || g.status === 'todo').length;
    });

    html += `<div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Agents</div>
        <div class="stat-value pink">${Object.keys(this.registry.agents || {}).length}</div>
        <div class="stat-sub">${stats.projectCount} projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Activity</div>
        <div class="stat-value purple">${weekActivity}</div>
        <div class="stat-sub">logged actions</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Est. Cost</div>
        <div class="stat-value cyan">$${weekCost.toFixed(2)}</div>
        <div class="stat-sub">estimated total</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Goals</div>
        <div class="stat-value ${activeGoals > 0 ? 'gold' : 'green'}">${activeGoals}</div>
        <div class="stat-sub">sprint goals</div>
      </div>
    </div>`;

    // 최근 활동 피드 (Top Performers 대체)
    const allRecent = [];
    Object.entries(this.logsData).forEach(([proj, data]) => {
      (data.recent || []).forEach(l => allRecent.push({ ...l, project: proj }));
    });
    allRecent.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));

    html += `<div class="section-header">
      <span class="section-title">Recent Activity</span>
      <span class="section-badge">latest actions</span>
    </div>`;
    html += '<div class="activity-feed">';
    if (allRecent.length === 0) {
      html += '<div class="empty-state"><div class="empty-state-icon">--</div><div class="empty-state-text">No activity logged yet</div></div>';
    } else {
      const resultIcon = { success: '<span style="color:var(--green)">&#10003;</span>', failure: '<span style="color:var(--red)">&#10007;</span>', partial: '<span style="color:var(--orange)">&#9651;</span>', breakthrough: '<span style="color:var(--gold)">&#9733;</span>' };
      allRecent.slice(0, 10).forEach(l => {
        const agent = this.registry.agents[l.agent] || {};
        const icon = resultIcon[l.result] || '?';
        const costStr = l.cost ? `<span class="activity-cost">$${l.cost.toFixed(3)}</span>` : '';
        const timeStr = l.ts ? new Date(l.ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        html += `
        <div class="activity-item" data-agent="${this.escapeHtml(l.agent)}" data-project="${this.escapeHtml(l.project)}">
          <span class="activity-icon">${icon}</span>
          <div class="activity-info">
            <span class="activity-agent">${this.escapeHtml(l.agent)}</span>
            <span class="activity-action">${this.escapeHtml(l.action)}</span>
            <span class="activity-summary">${this.escapeHtml(l.summary || '')}</span>
          </div>
          <div class="activity-meta">
            ${costStr}
            <span class="activity-time">${timeStr}</span>
            <span class="activity-project">${this.escapeHtml(l.project)}</span>
          </div>
        </div>`;
      });
    }
    html += '</div>';

    // 스프린트 목표 요약
    const sprintProjects = Object.entries(this.goalsData.sprints || {}).filter(([_, s]) => s.goals && s.goals.length > 0);
    if (sprintProjects.length > 0) {
      html += `<div class="section-header">
        <span class="section-title">Sprint Goals</span>
        <span class="section-badge">${activeGoals} active</span>
      </div>`;
      html += '<div class="goals-overview">';
      sprintProjects.forEach(([projName, sprint]) => {
        html += `<div class="goal-project-group"><div class="goal-project-name">${this.escapeHtml(projName)} — ${this.escapeHtml(sprint.sprintName || '')}</div>`;
        sprint.goals.forEach(g => {
          const statusCls = g.status === 'done' ? 'goal-done' : g.status === 'in-progress' ? 'goal-active' : 'goal-todo';
          const priCls = g.priority === 'high' ? 'pri-high' : g.priority === 'low' ? 'pri-low' : 'pri-med';
          html += `<div class="goal-item ${statusCls}"><span class="goal-id">${g.id}</span><span class="goal-title">${this.escapeHtml(g.title)}</span><span class="goal-pri ${priCls}">${g.priority}</span><span class="goal-status">${g.status}</span></div>`;
        });
        html += '</div>';
      });
      html += '</div>';
    }

    // Project Tabs + Goals/Cost 탭
    html += `<div class="section-header mt-16">
      <span class="section-title">Projects</span>
    </div>`;
    html += '<div class="project-tabs">';
    html += `<button class="project-tab project-tab-overview ${this.currentView === 'overview' ? 'active' : ''}" data-view="overview">Overview</button>`;
    projects.forEach(name => {
      const proj = this.registry.projects[name];
      html += `<button class="project-tab ${this.currentView === name ? 'active' : ''}" data-view="${this.escapeHtml(name)}">${this.escapeHtml(proj.description || name)}</button>`;
    });
    html += `<span class="tab-separator">|</span>`;
    html += `<button class="project-tab tab-goals ${this.currentView === 'goals' ? 'active' : ''}" data-view="goals">Goals</button>`;
    html += `<button class="project-tab tab-cost ${this.currentView === 'cost' ? 'active' : ''}" data-view="cost">Cost</button>`;
    html += '</div>';

    // Project Content Area
    html += '<div id="project-content"></div>';

    main.innerHTML = html;

    // Render content based on current view
    if (this.currentView === 'goals') {
      this.renderGoalsView();
    } else if (this.currentView === 'cost') {
      this.renderCostView();
    } else if (this.currentView !== 'overview') {
      this.renderProjectView(this.currentView);
    }

    this.bindViewEvents();
  }

  // ============================================================
  // Rendering - Project View (Kanban)
  // ============================================================

  renderProjectView(projectName) {
    const container = document.getElementById('project-content');
    if (!container) return;

    const project = this.registry.projects[projectName];
    if (!project) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">?</div><div class="empty-state-text">Project data not found</div></div>';
      return;
    }
    const scores = this.projectScores[projectName] || this.generateFallbackScores(projectName);

    this.currentProject = projectName;
    const squads = this.registry.squads || {};
    const squadKeys = [...Object.keys(squads), 'inactive'];

    // Group agents by squad
    const grouped = {};
    squadKeys.forEach(s => { grouped[s] = []; });

    const activeAgents = project.activeAgents || [];
    const disabledAgents = project.disabledAgents || [];
    const allRegisteredAgents = Object.keys(this.registry.agents || {});

    activeAgents.forEach(name => {
      const agent = this.registry.agents[name];
      if (!agent) return;
      const squad = agent.squad || 'inactive';
      if (!grouped[squad]) grouped[squad] = [];
      grouped[squad].push(name);
    });

    disabledAgents.forEach(name => {
      if (!grouped.inactive) grouped.inactive = [];
      grouped.inactive.push(name);
    });

    // 스프린트 목표 패널
    const sprint = this.goalsData.sprints ? this.goalsData.sprints[projectName] : null;
    const mission = this.goalsData.missions ? this.goalsData.missions[projectName] : null;
    let html = '';

    if (sprint || mission) {
      html += '<div class="sprint-panel">';
      if (mission) {
        html += `<div class="sprint-mission">${this.escapeHtml(mission.mission || '')} <span class="phase-badge">${this.escapeHtml(mission.currentPhase || '')}</span></div>`;
      }
      if (sprint) {
        html += `<div class="sprint-header"><span class="sprint-name">${this.escapeHtml(sprint.sprintName || '')}</span><span class="sprint-dates">${sprint.startDate || ''} ~ ${sprint.endDate || ''}</span></div>`;
        html += '<div class="sprint-goals">';
        (sprint.goals || []).forEach(g => {
          const statusCls = g.status === 'done' ? 'goal-done' : g.status === 'in-progress' ? 'goal-active' : 'goal-todo';
          const priCls = g.priority === 'high' ? 'pri-high' : g.priority === 'low' ? 'pri-low' : 'pri-med';
          html += `<div class="sprint-goal-card ${statusCls}" data-goal-id="${g.id}" data-project="${this.escapeHtml(projectName)}">
            <div class="goal-card-top"><span class="goal-id">${g.id}</span><span class="goal-pri ${priCls}">${g.priority}</span></div>
            <div class="goal-card-title">${this.escapeHtml(g.title)}</div>
            <div class="goal-card-status"><select class="goal-status-select" data-goal-id="${g.id}" data-project="${this.escapeHtml(projectName)}">
              <option value="todo" ${g.status === 'todo' ? 'selected' : ''}>대기</option>
              <option value="in-progress" ${g.status === 'in-progress' ? 'selected' : ''}>진행중</option>
              <option value="done" ${g.status === 'done' ? 'selected' : ''}>완료</option>
            </select></div>
          </div>`;
        });
        // 목표 추가 버튼
        html += `<div class="sprint-goal-card goal-add" data-project="${this.escapeHtml(projectName)}"><div class="goal-add-icon">+</div><div class="goal-add-text">목표 추가</div></div>`;
        html += '</div>';
      }
      html += '</div>';
    }

    html += '<div class="kanban-board">';

    squadKeys.forEach(squadKey => {
      const squad = squads[squadKey] || { name: 'Inactive', nameKr: '\ube44\ud65c\uc131', color: '#424242' };
      const agents = grouped[squadKey] || [];

      html += `
      <div class="kanban-column" data-squad="${this.escapeHtml(squadKey)}">
        <div class="kanban-column-header">
          <span class="kanban-column-title">
            <span class="column-color-dot" style="background:${squad.color || '#424242'}"></span>
            ${this.escapeHtml(squad.nameKr || squad.name || squadKey)}
          </span>
          <span class="kanban-column-count">${agents.length}</span>
        </div>
        <div class="kanban-column-body" data-squad="${this.escapeHtml(squadKey)}">`;

      agents.forEach(name => {
        html += this.renderAgentCard(name, this.registry.agents[name], scores.agents ? scores.agents[name] : null);
      });

      if (agents.length === 0) {
        html += '<div class="empty-state" style="padding:20px 0;"><div class="empty-state-text" style="font-size:0.75rem;">No agents</div></div>';
      }

      html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;
    this.initDragAndDrop();
    this.bindKanbanCardEvents();
    this.bindGoalEvents();
  }

  renderAgentCard(agentName, agentData, scoreData) {
    if (!agentData) return '';

    const model = scoreData ? (scoreData.currentModel || scoreData.model) : (agentData.recommendedModel || 'sonnet');
    const modelInfo = this.getModelIcon(model);
    const hasOvr = this.currentProject && this.hasOverrides(this.currentProject, agentName);

    // 활동 로그에서 에이전트 정보 가져오기
    const summary = this.logsSummary[this.currentProject];
    const agentLog = summary && summary.agents ? summary.agents[agentName] : null;
    const lastAction = agentLog && agentLog.lastAction;
    const actCount = agentLog ? agentLog.total : 0;
    const costStr = agentLog && agentLog.cost > 0 ? `$${agentLog.cost.toFixed(2)}` : '';
    const lastStr = lastAction ? new Date(lastAction.ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' ' + (lastAction.action || '') : '';
    const resultIcon = lastAction ? (lastAction.result === 'success' ? ' ✓' : lastAction.result === 'failure' ? ' ✗' : '') : '';

    return `
    <div class="agent-card squad-${agentData.squad || 'dev'}"
         draggable="true"
         data-agent="${this.escapeHtml(agentName)}"
         data-project="${this.escapeHtml(this.currentProject || '')}">
      <span class="drag-handle">\u2630</span>
      <div class="agent-card-top">
        <div class="agent-name">
          ${this.escapeHtml(agentName)}
          <span class="agent-name-en">${this.escapeHtml(agentData.nameEn || '')}</span>
          ${hasOvr ? '<span class="overlay-indicator">OVR</span>' : ''}
        </div>
        <span class="agent-model-icon ${modelInfo.cls}">${modelInfo.icon} ${modelInfo.label}</span>
      </div>
      <div class="agent-role">${this.escapeHtml(agentData.role || agentData.roleEn || '')}</div>
      <div class="agent-activity-info">
        ${lastStr ? `<div class="agent-last-action">최근: ${lastStr}${resultIcon}</div>` : '<div class="agent-last-action" style="color:var(--text-muted)">활동 없음</div>'}
        <div class="agent-card-bottom">
          <span class="agent-activity-count">${actCount}회</span>
          ${costStr ? `<span class="agent-cost-badge">${costStr}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ============================================================
  // Rendering - Agent Modal
  // ============================================================

  renderAgentModal(agentName, projectName) {
    const agent = this.registry.agents[agentName];
    if (!agent) return;

    const scores = this.projectScores[projectName];
    const agentScore = scores && scores.agents ? scores.agents[agentName] : null;
    const score = agentScore ? agentScore.totalScore : 800;
    const rank = agentScore ? agentScore.rank : this.calculateRank(score);
    const modelInfo = this.getModelIcon(agentScore ? (agentScore.currentModel || agentScore.model) : agent.recommendedModel);

    const titleEl = document.getElementById('modal-agent-title');
    titleEl.innerHTML = `${this.escapeHtml(agentName)} (${this.escapeHtml(agent.nameEn || '')}) - ${this.escapeHtml(agent.role || '')}`;

    const body = document.getElementById('modal-agent-body');

    // Summary bar (활동 기반)
    const summary = this.logsSummary[projectName];
    const agentLog = summary && summary.agents ? summary.agents[agentName] : null;
    const actTotal = agentLog ? agentLog.total : 0;
    const actSuccess = agentLog ? agentLog.success : 0;
    const actRate = actTotal > 0 ? Math.round((actSuccess / actTotal) * 100) : 0;
    const actCost = agentLog ? agentLog.cost : 0;

    let html = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;padding:12px;background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border-color);">
      <div style="text-align:center;">
        <div style="font-size:1.4rem;font-weight:700;color:var(--pink);">${actTotal}</div>
        <div style="font-size:0.65rem;color:var(--text-muted);">활동</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:1.4rem;font-weight:700;color:var(--green);">${actRate}%</div>
        <div style="font-size:0.65rem;color:var(--text-muted);">성공률</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:1.4rem;font-weight:700;color:var(--cyan);">$${actCost.toFixed(2)}</div>
        <div style="font-size:0.65rem;color:var(--text-muted);">비용</div>
      </div>
      <div style="flex:1;"></div>
      <div>
        <span class="agent-model-icon ${modelInfo.cls}" style="font-size:0.85rem;padding:4px 12px;">${modelInfo.icon} ${modelInfo.label}</span>
      </div>
    </div>
    <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:16px;padding:0 4px;">${this.escapeHtml(agent.personality || '')}</div>`;

    // Tabs (점수 탭 제거, 활동/비용 탭 추가)
    html += `
    <div class="modal-tabs">
      <button class="modal-tab active" data-modal-tab="activity">활동 로그</button>
      <button class="modal-tab" data-modal-tab="goals">목표 진행</button>
      <button class="modal-tab" data-modal-tab="cost">비용</button>
      <button class="modal-tab" data-modal-tab="model">Model</button>
      <button class="modal-tab" data-modal-tab="memory">Memory</button>
      <button class="modal-tab" data-modal-tab="skills">Skills</button>
      <button class="modal-tab" data-modal-tab="overrides">Overrides</button>
      <button class="modal-tab" data-modal-tab="prompt">Prompt</button>
    </div>`;

    // Tab Contents
    html += `<div class="modal-tab-content active" data-tab-panel="activity">${this.renderActivityLog(agentName, projectName)}</div>`;
    html += `<div class="modal-tab-content" data-tab-panel="goals">${this.renderAgentGoals(agentName, projectName)}</div>`;
    html += `<div class="modal-tab-content" data-tab-panel="cost">${this.renderAgentCost(agentName, projectName)}</div>`;
    html += `<div class="modal-tab-content" data-tab-panel="model">${this.renderModelSettings(agent, agentScore, projectName, agentName)}</div>`;
    html += `<div class="modal-tab-content" data-tab-panel="memory">${this.renderDevelopmentMemory(agentScore, agent)}</div>`;
    html += `<div class="modal-tab-content" data-tab-panel="skills">${this.renderSkillsManager(agentScore, agent, projectName, agentName)}</div>`;
    html += `<div class="modal-tab-content" data-tab-panel="overrides">${this.renderOverridesTab(agent, agentName, projectName)}</div>`;
    html += `<div class="modal-tab-content" data-tab-panel="prompt">${this.renderPromptTab(agent, agentName)}</div>`;

    body.innerHTML = html;

    // Show modal
    document.getElementById('modal-agent').style.display = 'flex';
    this.bindModalTabEvents();
  }

  // ============================================================
  // Agent Profile Sections
  // ============================================================

  // ============================================================
  // 활동 로그 탭 (에이전트 모달)
  // ============================================================

  renderActivityLog(agentName, projectName) {
    const summary = this.logsSummary[projectName];
    const recentLogs = summary ? (summary.recentLogs || []).filter(l => l.agent === agentName) : [];
    if (recentLogs.length === 0) {
      return '<div class="empty-state"><div class="empty-state-text">활동 로그 없음</div></div>';
    }
    const resultIcon = { success: '✓', failure: '✗', partial: '△', breakthrough: '★' };
    let html = '';
    recentLogs.slice(0, 15).forEach(l => {
      const icon = resultIcon[l.result] || '?';
      const cls = l.result === 'success' ? 'green' : l.result === 'failure' ? 'red' : l.result === 'breakthrough' ? 'gold' : 'orange';
      const time = l.ts ? new Date(l.ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const costStr = l.cost ? `$${l.cost.toFixed(3)}` : '';
      html += `<div class="log-entry">
        <span class="log-icon" style="color:var(--${cls})">${icon}</span>
        <span class="log-action">${this.escapeHtml(l.action)}</span>
        <span class="log-summary">${this.escapeHtml(l.summary || '')}</span>
        <span class="log-meta">${costStr} ${time}</span>
      </div>`;
    });
    return html;
  }

  renderAgentGoals(agentName, projectName) {
    const agent = this.registry.agents[agentName];
    const sprint = this.goalsData.sprints ? this.goalsData.sprints[projectName] : null;
    if (!sprint || !sprint.goals || sprint.goals.length === 0) {
      return '<div class="empty-state"><div class="empty-state-text">스프린트 목표 없음</div></div>';
    }
    const squad = agent ? agent.squad : '';
    const goals = sprint.goals.filter(g => !g.assignedSquads || g.assignedSquads.length === 0 || g.assignedSquads.includes(squad));
    if (goals.length === 0) {
      return '<div class="empty-state"><div class="empty-state-text">이 에이전트에 배정된 목표 없음</div></div>';
    }
    let html = `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">${sprint.sprintName} (${sprint.startDate} ~ ${sprint.endDate})</div>`;
    goals.forEach(g => {
      const statusCls = g.status === 'done' ? 'goal-done' : g.status === 'in-progress' ? 'goal-active' : 'goal-todo';
      const priCls = g.priority === 'high' ? 'pri-high' : g.priority === 'low' ? 'pri-low' : 'pri-med';
      html += `<div class="goal-item ${statusCls}"><span class="goal-id">${g.id}</span><span class="goal-title">${this.escapeHtml(g.title)}</span><span class="goal-pri ${priCls}">${g.priority}</span><span class="goal-status">${g.status}</span></div>`;
    });
    return html;
  }

  renderAgentCost(agentName, projectName) {
    const summary = this.logsSummary[projectName];
    const agentLog = summary && summary.agents ? summary.agents[agentName] : null;
    if (!agentLog || agentLog.total === 0) {
      return '<div class="empty-state"><div class="empty-state-text">비용 데이터 없음</div></div>';
    }
    const avgCost = agentLog.cost / agentLog.total;
    const agent = this.registry.agents[agentName] || {};
    const costMatrix = this.registry.modelCostMatrix || {};
    let html = `
    <div class="cost-summary-grid">
      <div class="cost-stat"><div class="cost-stat-value">$${agentLog.cost.toFixed(3)}</div><div class="cost-stat-label">총 비용</div></div>
      <div class="cost-stat"><div class="cost-stat-value">${agentLog.total}</div><div class="cost-stat-label">총 활동</div></div>
      <div class="cost-stat"><div class="cost-stat-value">$${avgCost.toFixed(3)}</div><div class="cost-stat-label">건당 평균</div></div>
    </div>`;
    // 모델 비교
    html += '<div style="margin-top:16px;font-size:0.75rem;color:var(--text-muted);">모델별 예상 비용 (동일 작업량 기준)</div>';
    ['haiku', 'sonnet', 'opus'].forEach(m => {
      const c = costMatrix[m] || {};
      const est = (c.costPerMillionTokens || 0) * agentLog.total * 0.015; // rough estimate
      const isCurrent = (agent.recommendedModel || 'sonnet') === m;
      html += `<div style="display:flex;justify-content:space-between;padding:4px 0;${isCurrent ? 'font-weight:700;color:var(--text-primary)' : ''}">
        <span>${m}${isCurrent ? ' (현재)' : ''}</span><span>~$${est.toFixed(3)}</span></div>`;
    });
    return html;
  }

  // ============================================================
  // Goals 탑레벨 뷰
  // ============================================================

  renderGoalsView() {
    const container = document.getElementById('project-content');
    if (!container) return;
    let html = '<div class="goals-full-view">';
    html += '<h2 class="view-title">Sprint Goals</h2>';

    const projects = Object.keys(this.registry.projects || {});
    projects.forEach(projName => {
      const sprint = this.goalsData.sprints ? this.goalsData.sprints[projName] : null;
      const mission = this.goalsData.missions ? this.goalsData.missions[projName] : null;
      html += `<div class="goal-project-section">`;
      html += `<div class="goal-project-header">
        <span class="goal-project-title">${this.escapeHtml(projName)}</span>
        ${mission ? `<span class="goal-mission-text">${this.escapeHtml(mission.mission || '')}</span>` : ''}
      </div>`;

      if (sprint && sprint.goals && sprint.goals.length > 0) {
        html += `<div class="sprint-info">${this.escapeHtml(sprint.sprintName || '')} (${sprint.startDate || ''} ~ ${sprint.endDate || ''})</div>`;
        html += '<div class="sprint-goals">';
        sprint.goals.forEach(g => {
          const statusCls = g.status === 'done' ? 'goal-done' : g.status === 'in-progress' ? 'goal-active' : 'goal-todo';
          const priCls = g.priority === 'high' ? 'pri-high' : g.priority === 'low' ? 'pri-low' : 'pri-med';
          html += `<div class="sprint-goal-card ${statusCls}" data-goal-id="${g.id}" data-project="${this.escapeHtml(projName)}">
            <div class="goal-card-top"><span class="goal-id">${g.id}</span><span class="goal-pri ${priCls}">${g.priority}</span></div>
            <div class="goal-card-title">${this.escapeHtml(g.title)}</div>
            <div class="goal-card-status"><select class="goal-status-select" data-goal-id="${g.id}" data-project="${this.escapeHtml(projName)}">
              <option value="todo" ${g.status === 'todo' ? 'selected' : ''}>대기</option>
              <option value="in-progress" ${g.status === 'in-progress' ? 'selected' : ''}>진행중</option>
              <option value="done" ${g.status === 'done' ? 'selected' : ''}>완료</option>
            </select></div>
          </div>`;
        });
        html += `<div class="sprint-goal-card goal-add" data-project="${this.escapeHtml(projName)}"><div class="goal-add-icon">+</div><div class="goal-add-text">목표 추가</div></div>`;
        html += '</div>';
      } else {
        html += `<div class="empty-state" style="padding:12px;"><div class="empty-state-text">목표 없음</div></div>`;
        html += `<div class="sprint-goals"><div class="sprint-goal-card goal-add" data-project="${this.escapeHtml(projName)}"><div class="goal-add-icon">+</div><div class="goal-add-text">목표 추가</div></div></div>`;
      }
      html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
    this.bindGoalEvents();
  }

  // ============================================================
  // Cost 탑레벨 뷰
  // ============================================================

  renderCostView() {
    const container = document.getElementById('project-content');
    if (!container) return;
    let html = '<div class="cost-full-view">';
    html += '<h2 class="view-title">Cost Dashboard</h2>';

    let grandTotal = 0, grandCount = 0;
    const projects = Object.keys(this.registry.projects || {});
    const costMatrix = this.registry.modelCostMatrix || {};

    // 프로젝트별 요약
    html += '<div class="cost-projects-grid">';
    projects.forEach(projName => {
      const logData = this.logsData[projName] || { total: 0, cost: 0 };
      grandTotal += logData.cost || 0;
      grandCount += logData.total || 0;
      html += `<div class="cost-project-card">
        <div class="cost-project-name">${this.escapeHtml(projName)}</div>
        <div class="cost-project-value">$${(logData.cost || 0).toFixed(3)}</div>
        <div class="cost-project-count">${logData.total || 0}건</div>
      </div>`;
    });
    html += '</div>';

    // 총계
    html += `<div class="cost-total-bar"><span>총 추정 비용</span><span class="cost-total-value">$${grandTotal.toFixed(3)}</span><span>${grandCount}건</span></div>`;

    // 모델별 비용 가이드
    html += '<div class="cost-model-guide"><h3>모델 비용 가이드</h3>';
    ['haiku', 'sonnet', 'opus'].forEach(m => {
      const c = costMatrix[m] || {};
      html += `<div class="cost-model-row">
        <span class="agent-model-icon model-${m}" style="padding:2px 8px;">${m}</span>
        <span>Input: $${(c.inputCostPerMillion || 0).toFixed(2)}/M</span>
        <span>Output: $${(c.outputCostPerMillion || 0).toFixed(2)}/M</span>
        <span style="color:var(--text-muted);">${this.escapeHtml(c.recommendedFor || '')}</span>
      </div>`;
    });
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }

  // ============================================================
  // Goal Event Bindings
  // ============================================================

  bindGoalEvents() {
    // 상태 변경 select
    document.querySelectorAll('.goal-status-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const goalId = e.target.dataset.goalId;
        const project = e.target.dataset.project;
        try {
          await fetch(`/api/goals/sprint/${encodeURIComponent(project)}/${encodeURIComponent(goalId)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: e.target.value })
          });
          await this.loadGoals();
          this.renderMainView();
        } catch (err) { console.error('Goal update failed:', err); }
      });
    });

    // 목표 추가 버튼
    document.querySelectorAll('.goal-add').forEach(el => {
      el.addEventListener('click', async () => {
        const project = el.dataset.project;
        const title = prompt('새 목표 제목:');
        if (!title) return;
        const priority = prompt('우선순위 (high/medium/low):', 'medium') || 'medium';
        try {
          await fetch(`/api/goals/sprint/${encodeURIComponent(project)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, priority })
          });
          await this.loadGoals();
          this.renderMainView();
        } catch (err) { console.error('Goal add failed:', err); }
      });
    });
  }

  // ============================================================
  // Agent Profile Sections (Legacy - kept for compatibility)
  // ============================================================

  renderMetrics(agentScore, agent) {
    const metrics = agentScore ? agentScore.metrics : null;
    if (!metrics) {
      return '<div class="empty-state"><div class="empty-state-text">No metrics data available</div></div>';
    }

    const metricDefs = [
      { key: 'successRate', label: 'Success Rate', max: 100, suffix: '%', weight: 300, color: '#4CAF50' },
      { key: 'qualityScore', label: 'Quality Score', max: 100, suffix: '%', weight: 250, color: '#c44dff' },
      { key: 'responseTime', label: 'Response Time', max: 100, suffix: '%', weight: 150, color: '#00d4ff' },
      { key: 'userSatisfaction', label: 'User Satisfaction', max: 5, suffix: '/5', weight: 200, color: '#ff6b9d' },
      { key: 'consistency', label: 'Consistency', max: 100, suffix: '%', weight: 100, color: '#ffd700' }
    ];

    let html = '';
    metricDefs.forEach(def => {
      const val = metrics[def.key] !== undefined ? metrics[def.key] : 0;
      const displayVal = def.key === 'userSatisfaction' ? val.toFixed(1) : val;
      const pct = (val / def.max) * 100;

      html += `
      <div class="metric-row">
        <span class="metric-label" style="width:130px;">${def.label}</span>
        <div class="metric-bar-wrap">
          ${this.createProgressBar(val, def.max, def.color)}
        </div>
        <span class="metric-value" style="width:60px;text-align:right;color:${def.color};">${displayVal}${def.suffix}</span>
      </div>`;
    });

    // Weighted score breakdown
    html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-color);">';
    html += '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">Weighted Score Breakdown</div>';
    metricDefs.forEach(def => {
      const val = metrics[def.key] !== undefined ? metrics[def.key] : 0;
      const weighted = def.key === 'userSatisfaction'
        ? Math.round((val / 5) * def.weight)
        : Math.round((val / 100) * def.weight);
      html += `
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;padding:2px 0;color:var(--text-secondary);">
        <span>${def.label} (weight: ${def.weight})</span>
        <span style="font-weight:700;color:${def.color};">${weighted}</span>
      </div>`;
    });
    html += '</div>';

    return html;
  }

  renderPenalties(agentScore) {
    const penalties = agentScore ? agentScore.penalties : [];
    if (!penalties || penalties.length === 0) {
      return '<div class="empty-state"><div class="empty-state-icon" style="font-size:1.5rem;">--</div><div class="empty-state-text">No penalties recorded</div></div>';
    }

    let html = '';
    penalties.forEach(p => {
      html += `
      <div class="penalty-item">
        <div class="penalty-header">
          <span class="penalty-category">${this.escapeHtml(p.category || 'Unknown')}</span>
          <span class="penalty-points">${p.points > 0 ? '+' : ''}${p.points || 0}</span>
        </div>
        <div class="penalty-desc">${this.escapeHtml(p.description || '')}</div>
        <div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;">
          Level ${p.level || 1} | ${this.formatDate(p.date)}
        </div>
      </div>`;
    });
    return html;
  }

  renderImprovementMissions(agentScore) {
    const missions = agentScore ? agentScore.improvementMissions : [];
    if (!missions || missions.length === 0) {
      return '<div class="empty-state"><div class="empty-state-icon" style="font-size:1.5rem;">--</div><div class="empty-state-text">No active improvement missions</div></div>';
    }

    let html = '';
    missions.forEach(m => {
      const progress = m.completedSuccesses || 0;
      const required = m.requiredSuccesses || 5;
      const pct = Math.round((progress / required) * 100);

      html += `
      <div class="mission-item">
        <div class="mission-header">
          <span class="mission-name">${this.escapeHtml(m.name || 'Recovery Mission')}</span>
          <span class="mission-progress">${progress}/${required}</span>
        </div>
        ${this.createProgressBar(progress, required, '#00d4ff')}
        <div class="mission-desc mt-8">${this.escapeHtml(m.description || '')}</div>
        <div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;">
          Recovery: +${m.recoveryPoints || 0} pts | Deadline: ${this.formatDate(m.deadline)}
        </div>
      </div>`;
    });
    return html;
  }

  renderRecentTasks(agentScore) {
    const tasks = agentScore ? agentScore.recentTasks : [];
    if (!tasks || tasks.length === 0) {
      return '<div class="empty-state"><div class="empty-state-icon" style="font-size:1.5rem;">--</div><div class="empty-state-text">No recent tasks</div></div>';
    }

    let html = '';
    const displayTasks = tasks.slice(0, 10);
    displayTasks.forEach(t => {
      const changeClass = (t.scoreChange || 0) >= 0 ? 'positive' : 'negative';
      const changePrefix = (t.scoreChange || 0) >= 0 ? '+' : '';
      html += `
      <div class="task-item">
        <div class="task-status ${t.status || 'success'}"></div>
        <div class="task-info">
          <div class="task-name">${this.escapeHtml(t.name || 'Unknown task')}</div>
          <div class="task-date">${this.formatDate(t.date)}</div>
        </div>
        <span class="task-score-change ${changeClass}">${changePrefix}${t.scoreChange || 0}</span>
      </div>`;
    });
    return html;
  }

  renderModelSettings(agent, agentScore, projectName, agentName) {
    const currentModel = agentScore ? (agentScore.currentModel || agentScore.model) : agent.recommendedModel;
    const costMatrix = this.registry.modelCostMatrix || {};

    const models = [
      { key: 'opus', name: 'Opus', desc: 'Complex architecture, creative design', icon: '\u26a1' },
      { key: 'sonnet', name: 'Sonnet', desc: 'General implementation, reviews', icon: '\u266b' },
      { key: 'haiku', name: 'Haiku', desc: 'Simple tasks, quick feedback', icon: '\u2744' }
    ];

    let html = '<div class="model-radio-group">';
    models.forEach(m => {
      const cost = costMatrix[m.key] || {};
      const selected = currentModel === m.key;
      html += `
      <label class="model-radio-item ${selected ? 'selected' : ''}">
        <input type="radio" name="agent-model" value="${m.key}" ${selected ? 'checked' : ''}>
        <div class="model-radio-label">
          <div class="model-radio-name">${m.icon} ${m.name}</div>
          <div class="model-radio-desc">${m.desc}</div>
        </div>
        <span class="model-radio-cost">$${(cost.costPerMillionTokens || 0).toFixed(2)}/M</span>
      </label>`;
    });
    html += '</div>';

    html += `
    <div class="model-save-section">
      <input type="text" id="model-change-reason" placeholder="Reason for change (optional)">
      <button class="btn btn-primary btn-small"
              onclick="window.dashboard.saveModelChange('${this.escapeHtml(projectName)}','${this.escapeHtml(agentName)}')">
        Save
      </button>
    </div>`;

    // Recommended model info
    html += `
    <div style="margin-top:14px;padding:10px;background:var(--bg-card);border-radius:var(--radius-sm);font-size:0.75rem;color:var(--text-muted);">
      <strong>Recommended:</strong> ${agent.recommendedModel || 'sonnet'} - ${this.escapeHtml(agent.modelRationale || '')}
      <br><strong>Alternatives:</strong> ${(agent.alternativeModels || []).join(', ') || 'none'}
    </div>`;

    return html;
  }

  renderDevelopmentMemory(agentScore, agent) {
    const memory = agentScore ? agentScore.developmentMemory : null;
    if (!memory) {
      return '<div class="empty-state"><div class="empty-state-text">No development memory available</div></div>';
    }

    let html = '';

    // Expertise
    html += '<div class="memory-section">';
    html += '<div class="memory-section-title">Expertise</div>';
    const expertise = memory.expertise || agent.expertise || [];
    if (expertise.length > 0) {
      expertise.forEach(e => {
        html += `<span class="memory-tag">${this.escapeHtml(e)}</span>`;
      });
    } else {
      html += '<div style="font-size:0.75rem;color:var(--text-muted);">No expertise recorded</div>';
    }
    html += '</div>';

    // Work History
    html += '<div class="memory-section">';
    html += '<div class="memory-section-title">Work History</div>';
    const workHistory = memory.workHistory || [];
    if (workHistory.length > 0) {
      workHistory.forEach(entry => {
        html += `<div class="memory-entry">${this.escapeHtml(typeof entry === 'string' ? entry : JSON.stringify(entry))}</div>`;
      });
    } else {
      html += '<div style="font-size:0.75rem;color:var(--text-muted);">No work history</div>';
    }
    html += '</div>';

    // Fix Patterns
    html += '<div class="memory-section">';
    html += '<div class="memory-section-title">Fix Patterns</div>';
    const fixPatterns = memory.fixPatterns || [];
    if (fixPatterns.length > 0) {
      fixPatterns.forEach(pattern => {
        html += `<div class="memory-entry">${this.escapeHtml(typeof pattern === 'string' ? pattern : JSON.stringify(pattern))}</div>`;
      });
    } else {
      html += '<div style="font-size:0.75rem;color:var(--text-muted);">No fix patterns recorded</div>';
    }
    html += '</div>';

    // Learning Notes
    html += '<div class="memory-section">';
    html += '<div class="memory-section-title">Learning Notes</div>';
    const learningNotes = memory.learningNotes || [];
    if (learningNotes.length > 0) {
      learningNotes.forEach(note => {
        html += `<div class="memory-entry">${this.escapeHtml(typeof note === 'string' ? note : JSON.stringify(note))}</div>`;
      });
    } else {
      html += '<div style="font-size:0.75rem;color:var(--text-muted);">No learning notes</div>';
    }
    html += '</div>';

    return html;
  }

  renderSkillsManager(agentScore, agent, projectName, agentName) {
    const skills = agentScore ? (agentScore.externalSkills || []) : [];
    const expertise = agent.expertise || [];

    let html = '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;">Core Expertise (from registry)</div>';
    html += '<div class="skill-list">';
    expertise.forEach(s => {
      html += `<span class="skill-tag" style="opacity:0.7;">${this.escapeHtml(s)}</span>`;
    });
    html += '</div>';

    html += '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;margin-top:14px;">External Skills (editable)</div>';
    html += '<div class="skill-list" id="external-skills-list">';
    skills.forEach((s, idx) => {
      html += `
      <span class="skill-tag">
        ${this.escapeHtml(s)}
        <span class="skill-remove" onclick="window.dashboard.removeSkill('${this.escapeHtml(projectName)}','${this.escapeHtml(agentName)}',${idx})">&times;</span>
      </span>`;
    });
    html += '</div>';

    html += `
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button class="btn btn-secondary btn-small"
              onclick="window.dashboard.openAddSkillModal('${this.escapeHtml(projectName)}','${this.escapeHtml(agentName)}')">
        + Add Skill
      </button>
    </div>`;

    return html;
  }

  // ============================================================
  // Rendering - Overrides Tab
  // ============================================================

  renderOverridesTab(agent, agentName, projectName) {
    const overlay = this.projectOverlays[projectName] || { agents: {}, globalOverrides: {} };
    const agentOverlay = (overlay.agents && overlay.agents[agentName]) || {};

    let html = '';

    // Global overrides section
    html += `<div class="global-override-section">
      <div class="global-override-title">Global Overrides (${this.escapeHtml(projectName)})</div>
      <div class="override-field">
        <span class="override-field-label">Additional Context</span>
        <div class="override-field-value">
          <textarea id="ovr-global-ctx" placeholder="All agents in this project...">${this.escapeHtml((overlay.globalOverrides && overlay.globalOverrides.additionalContext) || '')}</textarea>
        </div>
      </div>
    </div>`;

    // Per-agent overrides
    html += `<div class="override-section">
      <div class="override-section-title">${this.escapeHtml(agentName)} Overrides</div>`;

    // Model override
    html += `<div class="override-field">
      <span class="override-field-label">Model</span>
      <div class="override-field-value">
        <select id="ovr-model">
          <option value="">Base (${agent.recommendedModel})</option>
          <option value="opus" ${agentOverlay.modelOverride === 'opus' ? 'selected' : ''}>Opus</option>
          <option value="sonnet" ${agentOverlay.modelOverride === 'sonnet' ? 'selected' : ''}>Sonnet</option>
          <option value="haiku" ${agentOverlay.modelOverride === 'haiku' ? 'selected' : ''}>Haiku</option>
        </select>
        ${agentOverlay.modelOverride ? '<span class="diff-indicator diff-changed">changed</span>' : ''}
      </div>
    </div>`;

    // Role override
    html += `<div class="override-field">
      <span class="override-field-label">Role</span>
      <div class="override-field-value">
        <input type="text" id="ovr-role" value="${this.escapeHtml(agentOverlay.roleOverride || '')}" placeholder="Base: ${this.escapeHtml(agent.role)}">
        ${agentOverlay.roleOverride ? '<span class="diff-indicator diff-changed">changed</span>' : ''}
        <div class="override-base-value">Base: ${this.escapeHtml(agent.role)}</div>
      </div>
    </div>`;

    // Expertise override
    const currentExpertise = agentOverlay.expertiseOverride
      ? agentOverlay.expertiseOverride.join(', ')
      : (agentOverlay.expertiseAppend ? agentOverlay.expertiseAppend.join(', ') : '');
    const expertiseMode = agentOverlay.expertiseOverride ? 'replace' : (agentOverlay.expertiseAppend ? 'append' : 'none');

    html += `<div class="override-field">
      <span class="override-field-label">Expertise</span>
      <div class="override-field-value">
        <select id="ovr-expertise-mode" style="margin-bottom:6px;">
          <option value="none" ${expertiseMode === 'none' ? 'selected' : ''}>No override (use base)</option>
          <option value="replace" ${expertiseMode === 'replace' ? 'selected' : ''}>Replace all</option>
          <option value="append" ${expertiseMode === 'append' ? 'selected' : ''}>Append to base</option>
        </select>
        <input type="text" id="ovr-expertise" value="${this.escapeHtml(currentExpertise)}" placeholder="Comma-separated (e.g. Prisma, Supabase)">
        ${expertiseMode !== 'none' ? '<span class="diff-indicator diff-changed">changed</span>' : ''}
        <div class="override-base-value">Base: ${this.escapeHtml(agent.expertise.join(', '))}</div>
      </div>
    </div>`;

    // Additional context
    html += `<div class="override-field">
      <span class="override-field-label">Agent Context</span>
      <div class="override-field-value">
        <textarea id="ovr-ctx" placeholder="Project-specific context for this agent...">${this.escapeHtml(agentOverlay.additionalContext || '')}</textarea>
        ${agentOverlay.additionalContext ? '<span class="diff-indicator diff-added">set</span>' : ''}
      </div>
    </div>`;

    // Template patches
    html += `<div class="override-field">
      <span class="override-field-label">Prepend</span>
      <div class="override-field-value">
        <textarea id="ovr-prepend" placeholder="Content prepended to generated output...">${this.escapeHtml((agentOverlay.templatePatches && agentOverlay.templatePatches.prepend) || '')}</textarea>
      </div>
    </div>`;

    html += `<div class="override-field">
      <span class="override-field-label">Append</span>
      <div class="override-field-value">
        <textarea id="ovr-append" placeholder="Content appended to generated output...">${this.escapeHtml((agentOverlay.templatePatches && agentOverlay.templatePatches.append) || '')}</textarea>
      </div>
    </div>`;

    html += '</div>';

    // Actions
    html += `<div class="override-actions">
      <button class="btn btn-primary btn-small" id="btn-save-overlay"
              onclick="window.dashboard.saveOverlay('${this.escapeHtml(projectName)}','${this.escapeHtml(agentName)}')">
        Save Overrides
      </button>
      <button class="btn btn-secondary btn-small"
              onclick="window.dashboard.clearAgentOverlay('${this.escapeHtml(projectName)}','${this.escapeHtml(agentName)}')">
        Clear Agent Overrides
      </button>
    </div>`;

    return html;
  }

  async saveOverlay(projectName, agentName) {
    const overlay = this.projectOverlays[projectName] || {
      version: '1.0.0',
      project: projectName,
      agents: {},
      globalOverrides: {}
    };

    // Read form values
    const model = document.getElementById('ovr-model')?.value || '';
    const role = document.getElementById('ovr-role')?.value?.trim() || '';
    const expertiseMode = document.getElementById('ovr-expertise-mode')?.value || 'none';
    const expertiseRaw = document.getElementById('ovr-expertise')?.value?.trim() || '';
    const ctx = document.getElementById('ovr-ctx')?.value?.trim() || '';
    const prepend = document.getElementById('ovr-prepend')?.value?.trim() || '';
    const append = document.getElementById('ovr-append')?.value?.trim() || '';
    const globalCtx = document.getElementById('ovr-global-ctx')?.value?.trim() || '';

    // Build agent overlay
    const agentOverlay = {};
    if (model) agentOverlay.modelOverride = model;
    if (role) agentOverlay.roleOverride = role;
    if (expertiseMode === 'replace' && expertiseRaw) {
      agentOverlay.expertiseOverride = expertiseRaw.split(',').map(s => s.trim()).filter(Boolean);
    } else if (expertiseMode === 'append' && expertiseRaw) {
      agentOverlay.expertiseAppend = expertiseRaw.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (ctx) agentOverlay.additionalContext = ctx;
    if (prepend || append) {
      agentOverlay.templatePatches = {};
      if (prepend) agentOverlay.templatePatches.prepend = prepend;
      if (append) agentOverlay.templatePatches.append = append;
    }

    // Update overlay
    if (!overlay.agents) overlay.agents = {};
    if (Object.keys(agentOverlay).length > 0) {
      overlay.agents[agentName] = agentOverlay;
    } else {
      delete overlay.agents[agentName];
    }

    // Global overrides
    if (!overlay.globalOverrides) overlay.globalOverrides = {};
    if (globalCtx) {
      overlay.globalOverrides.additionalContext = globalCtx;
    } else {
      delete overlay.globalOverrides.additionalContext;
    }

    overlay.version = '1.0.0';
    overlay.project = projectName;

    try {
      const btnEl = document.getElementById('btn-save-overlay');
      if (btnEl) { btnEl.textContent = 'Saving...'; btnEl.disabled = true; }

      const res = await fetch(`/api/overlays/${encodeURIComponent(projectName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overlay)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Save failed');
      }

      this.projectOverlays[projectName] = overlay;
      this.showToast(`Overlay saved for ${projectName}`, 'success');

      // Re-render kanban to update OVR badges
      if (this.currentProject === projectName) {
        this.renderProjectView(projectName);
      }
    } catch (error) {
      this.showToast(`Save failed: ${error.message}`, 'error');
    } finally {
      const btnEl = document.getElementById('btn-save-overlay');
      if (btnEl) { btnEl.textContent = 'Save Overrides'; btnEl.disabled = false; }
    }
  }

  async clearAgentOverlay(projectName, agentName) {
    const overlay = this.projectOverlays[projectName];
    if (!overlay || !overlay.agents || !overlay.agents[agentName]) {
      this.showToast('No overrides to clear', 'info');
      return;
    }

    delete overlay.agents[agentName];

    try {
      const res = await fetch(`/api/overlays/${encodeURIComponent(projectName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overlay)
      });

      if (!res.ok) throw new Error('Clear failed');

      this.projectOverlays[projectName] = overlay;
      this.showToast(`Overrides cleared for ${agentName}`, 'success');
      this.renderAgentModal(agentName, projectName);

      if (this.currentProject === projectName) {
        this.renderProjectView(projectName);
      }
    } catch (error) {
      this.showToast(`Clear failed: ${error.message}`, 'error');
    }
  }

  // ============================================================
  // Rendering - Prompt Tab & Template Editor
  // ============================================================

  renderPromptTab(agent, agentName) {
    const templateFile = agent.templateFile || `${agentName}-${agent.command}.md`;
    return `
    <div class="prompt-tab-content">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div>
          <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);">Template: ${this.escapeHtml(templateFile)}</div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">Variables: {{AGENT_NAME}}, {{PROJECT_NAME}}, {{TECH_STACK}}, {{AGENT_MATRIX}}</div>
        </div>
        <button class="btn btn-primary btn-small"
                onclick="window.dashboard.showPromptEditor('${this.escapeHtml(agentName)}')">
          Open Editor
        </button>
      </div>
      <div id="prompt-preview-area" style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:14px;max-height:300px;overflow-y:auto;">
        <div style="color:var(--text-muted);font-size:0.78rem;">Click "Open Editor" to load and edit the template.</div>
      </div>
    </div>`;
  }

  async loadTemplate(agentFileName) {
    const res = await fetch(`/api/templates/${encodeURIComponent(agentFileName)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to load template');
    }
    return await res.json();
  }

  async saveTemplate(agentFileName, content) {
    const res = await fetch(`/api/templates/${encodeURIComponent(agentFileName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to save template');
    }
    return await res.json();
  }

  async showPromptEditor(agentName) {
    const agent = this.registry.agents[agentName];
    if (!agent) {
      this.showToast(`Agent "${agentName}" not found`, 'error');
      return;
    }

    const templateFileName = (agent.templateFile || `${agentName}-${agent.command}.md`).replace('.md', '');

    try {
      const { content } = await this.loadTemplate(templateFileName);

      // Close the agent modal first
      this.closeModal('modal-agent');

      // Show the template editor modal
      const titleEl = document.getElementById('modal-template-title');
      titleEl.textContent = `${agentName} - Template Editor`;

      const body = document.getElementById('modal-template-body');
      body.innerHTML = `
        <div class="editor-toolbar">
          <button id="btn-save-template" class="btn btn-primary btn-small">Save & Regenerate</button>
          <button id="btn-toggle-preview" class="btn btn-secondary btn-small">Preview</button>
          <span class="editor-info">Markdown | Variables: {{AGENT_NAME}}, {{PROJECT_NAME}}, {{TECH_STACK}}</span>
        </div>
        <div class="editor-split-container">
          <textarea id="template-editor" class="template-editor">${this.escapeHtml(content)}</textarea>
          <div id="template-preview-pane" class="preview-pane" style="display:none;"></div>
        </div>`;

      document.getElementById('modal-template').style.display = 'flex';

      // Bind save event
      document.getElementById('btn-save-template').onclick = async () => {
        const newContent = document.getElementById('template-editor').value;
        if (!confirm('All projects using this agent will be updated. Continue?')) {
          return;
        }
        try {
          document.getElementById('btn-save-template').textContent = 'Saving...';
          document.getElementById('btn-save-template').disabled = true;

          const result = await this.saveTemplate(templateFileName, newContent);

          let msg = 'Saved!';
          if (result.updated && result.updated.length > 0) {
            msg += ` Updated: ${result.updated.join(', ')}`;
          }
          if (result.errors && result.errors.length > 0) {
            msg += ` Errors: ${result.errors.map(e => e.project).join(', ')}`;
          }
          if (result.backup) {
            msg += ` (backup: ${result.backup})`;
          }

          this.showToast(msg, result.errors && result.errors.length > 0 ? 'error' : 'success');
        } catch (error) {
          this.showToast(`Save failed: ${error.message}`, 'error');
        } finally {
          document.getElementById('btn-save-template').textContent = 'Save & Regenerate';
          document.getElementById('btn-save-template').disabled = false;
        }
      };

      // Bind preview toggle
      let previewVisible = false;
      document.getElementById('btn-toggle-preview').onclick = () => {
        const previewPane = document.getElementById('template-preview-pane');
        const editor = document.getElementById('template-editor');
        previewVisible = !previewVisible;
        if (previewVisible) {
          const mdContent = document.getElementById('template-editor').value;
          previewPane.innerHTML = this.markdownToHtml(mdContent);
          previewPane.style.display = 'block';
          editor.style.flex = '1';
        } else {
          previewPane.style.display = 'none';
          editor.style.flex = '1';
        }
      };

    } catch (error) {
      this.showToast(`Failed to load template: ${error.message}`, 'error');
    }
  }

  markdownToHtml(markdown) {
    return markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*([^*]+)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code style="background:var(--bg-input);padding:1px 4px;border-radius:3px;">$1</code>')
      .replace(/^- (.*$)/gim, '<li style="margin-left:20px;">$1</li>')
      .replace(/^(\d+)\. (.*$)/gim, '<li style="margin-left:20px;">$2</li>')
      .replace(/\{\{([^}]+)\}\}/g, '<span style="color:var(--cyan);font-weight:700;">{{$1}}</span>')
      .replace(/\n/gim, '<br>');
  }

  // ============================================================
  // Rendering - New Project Modal
  // ============================================================

  renderNewProjectModal() {
    const body = document.getElementById('modal-new-project-body');
    body.innerHTML = `
    <form id="new-project-form">
      <div class="form-group">
        <label class="form-label">Project Name (key)</label>
        <input class="form-input" type="text" id="np-name" placeholder="e.g. my-app" required>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input class="form-input" type="text" id="np-desc" placeholder="e.g. Shopping Web App">
      </div>
      <div class="form-group">
        <label class="form-label">Path</label>
        <input class="form-input" type="text" id="np-path" placeholder="e.g. my-app">
      </div>
      <div class="form-group">
        <label class="form-label">Tech Stack (comma separated)</label>
        <input class="form-input" type="text" id="np-tech" placeholder="e.g. React, Node.js, PostgreSQL">
      </div>
      <div class="form-group">
        <label class="form-label">Active Agents</label>
        <div id="np-agents-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
          ${Object.entries(this.registry.agents || {}).map(([name, agent]) => {
            return `<label style="display:flex;align-items:center;gap:4px;font-size:0.78rem;padding:4px 8px;background:var(--bg-input);border-radius:var(--radius-sm);cursor:pointer;">
              <input type="checkbox" value="${this.escapeHtml(name)}" checked>
              ${this.escapeHtml(name)} (${this.escapeHtml(agent.nameEn || '')})
            </label>`;
          }).join('')}
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button type="button" class="btn btn-secondary" data-close="modal-new-project">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Project</button>
      </div>
    </form>`;

    document.getElementById('modal-new-project').style.display = 'flex';

    document.getElementById('new-project-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleNewProjectSubmit();
    });
  }

  // ============================================================
  // Drag & Drop
  // ============================================================

  initDragAndDrop() {
    const cards = document.querySelectorAll('.agent-card[draggable="true"]');
    const columns = document.querySelectorAll('.kanban-column-body');

    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        this.draggedAgent = card.dataset.agent;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.agent);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        this.draggedAgent = null;
        document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
      });
    });

    columns.forEach(col => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.closest('.kanban-column').classList.add('drag-over');
      });

      col.addEventListener('dragleave', (e) => {
        if (!col.contains(e.relatedTarget)) {
          col.closest('.kanban-column').classList.remove('drag-over');
        }
      });

      col.addEventListener('drop', (e) => {
        e.preventDefault();
        const agentName = e.dataTransfer.getData('text/plain');
        const newSquad = col.dataset.squad;
        col.closest('.kanban-column').classList.remove('drag-over');
        if (agentName && newSquad) {
          this.moveAgentToSquad(agentName, newSquad);
        }
      });
    });
  }

  moveAgentToSquad(agentName, newSquad) {
    const agent = this.registry.agents[agentName];
    if (!agent) return;

    const oldSquad = agent.squad;
    if (oldSquad === newSquad) return;

    agent.squad = newSquad;

    // Re-render kanban
    if (this.currentProject) {
      this.renderProjectView(this.currentProject);
    }

    this.showToast(`${agentName} moved to ${newSquad}`, 'success');
  }

  // ============================================================
  // Actions
  // ============================================================

  saveModelChange(projectName, agentName) {
    const selected = document.querySelector('input[name="agent-model"]:checked');
    if (!selected) return;

    const newModel = selected.value;
    const reason = document.getElementById('model-change-reason')?.value || '';

    const scores = this.projectScores[projectName];
    if (scores && scores.agents && scores.agents[agentName]) {
      scores.agents[agentName].currentModel = newModel;
    }

    // Create downloadable JSON to persist the change
    const changeLog = {
      timestamp: new Date().toISOString(),
      project: projectName,
      agent: agentName,
      newModel: newModel,
      reason: reason,
      scores: scores
    };

    this.downloadJson(`agent-scores-${projectName}.json`, scores);
    this.showToast(`${agentName} model changed to ${newModel}`, 'success');
  }

  addSkill(projectName, agentName, skill) {
    if (!skill || !skill.trim()) return;

    const scores = this.projectScores[projectName];
    if (scores && scores.agents && scores.agents[agentName]) {
      if (!scores.agents[agentName].externalSkills) {
        scores.agents[agentName].externalSkills = [];
      }
      scores.agents[agentName].externalSkills.push(skill.trim());
    }

    // Re-render the agent modal
    this.closeModal('modal-add-skill');
    this.renderAgentModal(agentName, projectName);
    this.showToast(`Skill "${skill}" added to ${agentName}`, 'success');
  }

  removeSkill(projectName, agentName, index) {
    const scores = this.projectScores[projectName];
    if (scores && scores.agents && scores.agents[agentName]) {
      const skills = scores.agents[agentName].externalSkills || [];
      if (index >= 0 && index < skills.length) {
        const removed = skills.splice(index, 1);
        this.renderAgentModal(agentName, projectName);
        this.showToast(`Skill removed from ${agentName}`, 'info');
      }
    }
  }

  openAddSkillModal(projectName, agentName) {
    const body = document.getElementById('modal-add-skill-body');
    body.innerHTML = `
    <form id="add-skill-form">
      <div class="form-group">
        <label class="form-label">Skill Name</label>
        <input class="form-input" type="text" id="new-skill-name" placeholder="e.g. Docker, GraphQL" required>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
        <button type="button" class="btn btn-secondary" data-close="modal-add-skill">Cancel</button>
        <button type="submit" class="btn btn-primary">Add</button>
      </div>
    </form>`;

    document.getElementById('modal-add-skill').style.display = 'flex';

    document.getElementById('add-skill-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const skillName = document.getElementById('new-skill-name').value;
      this.addSkill(projectName, agentName, skillName);
    });
  }

  addProject(projectData) {
    if (!projectData.name) return;

    this.registry.projects[projectData.name] = {
      path: projectData.path || projectData.name,
      techStack: projectData.techStack || [],
      activeAgents: projectData.activeAgents || [],
      disabledAgents: [],
      customizations: {},
      description: projectData.description || projectData.name
    };

    // Generate fallback scores for the new project
    this.projectScores[projectData.name] = this.generateFallbackScores(projectData.name);

    this.closeModal('modal-new-project');
    this.currentView = projectData.name;
    this.renderMainView();
    this.showToast(`Project "${projectData.name}" created`, 'success');

    // Offer download of updated registry
    this.downloadJson('registry.json', this.registry);
  }

  handleNewProjectSubmit() {
    const name = document.getElementById('np-name')?.value?.trim();
    const desc = document.getElementById('np-desc')?.value?.trim();
    const path = document.getElementById('np-path')?.value?.trim();
    const tech = document.getElementById('np-tech')?.value?.trim();

    const checkboxes = document.querySelectorAll('#np-agents-list input[type="checkbox"]:checked');
    const activeAgents = Array.from(checkboxes).map(cb => cb.value);

    if (!name) {
      this.showToast('Project name is required', 'error');
      return;
    }

    this.addProject({
      name,
      description: desc || name,
      path: path || name,
      techStack: tech ? tech.split(',').map(s => s.trim()).filter(Boolean) : [],
      activeAgents
    });
  }

  // ============================================================
  // Event Binding
  // ============================================================

  bindGlobalEvents() {
    // Refresh button
    document.getElementById('btn-refresh')?.addEventListener('click', () => {
      this.refreshData();
    });

    // New project button
    document.getElementById('btn-new-project')?.addEventListener('click', () => {
      this.renderNewProjectModal();
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        if (modalId) this.closeModal(modalId);
      });
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.style.display = 'none';
        }
      });
    });

    // Keyboard escape to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => {
          m.style.display = 'none';
        });
      }
    });
  }

  bindViewEvents() {
    // Project tabs
    document.querySelectorAll('.project-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        this.currentView = view;
        document.querySelectorAll('.project-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (view === 'overview') {
          document.getElementById('project-content').innerHTML = '';
        } else {
          this.renderProjectView(view);
        }
      });
    });

    // Agent cards (top performers, warnings)
    document.querySelectorAll('.performer-card, .warning-item').forEach(el => {
      el.addEventListener('click', () => {
        const agent = el.dataset.agent;
        const project = el.dataset.project;
        if (agent && project) {
          this.renderAgentModal(agent, project);
        }
      });
    });

    // Agent cards in kanban
    this.bindKanbanCardEvents();
  }

  bindKanbanCardEvents() {
    document.querySelectorAll('.agent-card').forEach(card => {
      let startX, startY;
      card.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startY = e.clientY;
      });
      card.addEventListener('mouseup', (e) => {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        // Only open modal if mouse didn't move (not a drag)
        if (dx < 5 && dy < 5) {
          const agent = card.dataset.agent;
          const project = card.dataset.project;
          if (agent && project) {
            this.renderAgentModal(agent, project);
          }
        }
      });
    });
  }

  bindModalTabEvents() {
    document.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabKey = tab.dataset.modalTab;

        // Update tab active state
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update panel active state
        document.querySelectorAll('.modal-tab-content').forEach(p => p.classList.remove('active'));
        const panel = document.querySelector(`[data-tab-panel="${tabKey}"]`);
        if (panel) panel.classList.add('active');
      });
    });

    // Model radio visual update
    document.querySelectorAll('.model-radio-item input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.model-radio-item').forEach(item => item.classList.remove('selected'));
        radio.closest('.model-radio-item').classList.add('selected');
      });
    });

    // Close buttons inside modal body
    document.querySelectorAll('.modal-body [data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeModal(btn.dataset.close);
      });
    });
  }

  // ============================================================
  // Utilities
  // ============================================================

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
  }

  showToast(message, type = 'info') {
    const existing = document.querySelectorAll('.toast');
    existing.forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async refreshData() {
    this.showToast('Refreshing data...', 'info');
    await this.loadAllData();
    this.renderMainView();
    this.showToast('Data refreshed', 'success');
  }

  startAutoRefresh() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(() => {
      this.loadAllData().then(() => {
        // Only re-render project view if one is active, to avoid disrupting overview navigation
        if (this.currentView !== 'overview' && document.getElementById('project-content')?.innerHTML) {
          this.renderProjectView(this.currentView);
        }
      });
    }, 30000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

// ============================================================
// Initialize Dashboard
// ============================================================
window.dashboard = new AgentDashboard();

/**
 * ==========================================================
 * Express Server for Local Development (run via Node.js)
 * ==========================================================
 *
 * Option 1 - One-liner:
 * node -e "const e=require('express'),a=e();a.use(e.static('C:/Users/dosik/.claude/agents/dashboard'));a.use('/data',e.static('C:/Users/dosik/.claude/agents'));a.use('/projects',e.static('C:/Users/dosik'));a.listen(3456,()=>console.log('Dashboard: http://localhost:3456'))"
 *
 * Option 2 - Using serve.js:
 * Create a file serve.js with:
 *
 *   const express = require('express');
 *   const app = express();
 *   const PORT = 3456;
 *
 *   // Serve dashboard static files
 *   app.use(express.static('C:/Users/dosik/.claude/agents/dashboard'));
 *
 *   // Serve agent data (registry, scoring, etc.)
 *   app.use('/data', express.static('C:/Users/dosik/.claude/agents'));
 *
 *   // Serve project directories (for agent-scores.json)
 *   app.use('/projects', express.static('C:/Users/dosik'));
 *
 *   app.listen(PORT, () => {
 *     console.log(`K-pop Agent Hub Dashboard: http://localhost:${PORT}`);
 *   });
 *
 * Then run: node serve.js
 *
 * Option 3 - Without Express (Python):
 * cd C:/Users/dosik/.claude/agents/dashboard && python -m http.server 3456
 * (Note: /data and /projects routes will not work with this method)
 * ==========================================================
 */
