#!/usr/bin/env node
/**
 * migrate-overlays.js - Convert agent-config.json customizations to overlay format
 * Usage: node migrate-overlays.js [--dry-run]
 *
 * Reads each project's .claude/agent-config.json and converts customizations
 * into overlays/<project>.json format.
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..');
const BASE_DIR = path.join(__dirname, '..', '..', '..');
const OVERLAYS_DIR = path.join(AGENTS_DIR, 'overlays');

const dryRun = process.argv.includes('--dry-run');

function loadRegistry() {
  return JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'registry.json'), 'utf8'));
}

function loadExistingOverlay(projectName) {
  const overlayPath = path.join(OVERLAYS_DIR, `${projectName}.json`);
  if (fs.existsSync(overlayPath)) {
    return JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
  }
  return null;
}

function loadProjectConfig(projectPath) {
  const configPath = path.join(projectPath, '.claude', 'agent-config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return null;
}

function migrateProject(projectName, project) {
  const projectPath = path.join(BASE_DIR, project.path || projectName);
  const config = loadProjectConfig(projectPath);

  // Start from existing overlay or create new one
  const overlay = loadExistingOverlay(projectName) || {
    version: '1.0.0',
    project: projectName,
    lastUpdated: new Date().toISOString().split('T')[0],
    agents: {},
    globalOverrides: {}
  };

  let migratedCount = 0;

  // Migrate from agent-config.json customizations
  if (config && config.customizations) {
    Object.entries(config.customizations).forEach(([agentName, customization]) => {
      if (!customization || Object.keys(customization).length === 0) return;

      // Skip if already migrated to overlay
      if (overlay.agents[agentName] && Object.keys(overlay.agents[agentName]).length > 0) {
        console.log(`  ⏭️  ${agentName}: 이미 overlay에 존재 (건너뜀)`);
        return;
      }

      const agentOverride = {};

      // expertise → expertiseOverride
      if (customization.expertise && Array.isArray(customization.expertise)) {
        agentOverride.expertiseOverride = customization.expertise;
      }

      // additionalContext → additionalContext
      if (customization.additionalContext) {
        agentOverride.additionalContext = customization.additionalContext;
      }

      // role → roleOverride
      if (customization.role) {
        agentOverride.roleOverride = customization.role;
      }

      if (Object.keys(agentOverride).length > 0) {
        overlay.agents[agentName] = agentOverride;
        migratedCount++;
        console.log(`  ✅ ${agentName}: ${Object.keys(agentOverride).join(', ')}`);
      }
    });
  }

  // Migrate modelOverrides from agent-config.json
  if (config && config.modelOverrides) {
    Object.entries(config.modelOverrides).forEach(([agentName, model]) => {
      if (!overlay.agents[agentName]) {
        overlay.agents[agentName] = {};
      }
      if (!overlay.agents[agentName].modelOverride) {
        overlay.agents[agentName].modelOverride = model;
        migratedCount++;
        console.log(`  ✅ ${agentName}: modelOverride → ${model}`);
      }
    });
  }

  // Migrate from registry.projects[].customizations (legacy)
  if (project.customizations) {
    Object.entries(project.customizations).forEach(([agentName, customization]) => {
      if (!customization || Object.keys(customization).length === 0) return;
      if (overlay.agents[agentName] && Object.keys(overlay.agents[agentName]).length > 0) return;

      const agentOverride = {};
      if (customization.expertise) agentOverride.expertiseOverride = customization.expertise;
      if (customization.additionalContext) agentOverride.additionalContext = customization.additionalContext;
      if (customization.role) agentOverride.roleOverride = customization.role;

      if (Object.keys(agentOverride).length > 0) {
        overlay.agents[agentName] = agentOverride;
        migratedCount++;
        console.log(`  ✅ ${agentName} (from registry): ${Object.keys(agentOverride).join(', ')}`);
      }
    });
  }

  overlay.lastUpdated = new Date().toISOString().split('T')[0];

  return { overlay, migratedCount };
}

function main() {
  console.log(`\n🔄 Overlay 마이그레이션${dryRun ? ' (DRY RUN)' : ''}\n`);

  const registry = loadRegistry();

  if (!fs.existsSync(OVERLAYS_DIR)) {
    fs.mkdirSync(OVERLAYS_DIR, { recursive: true });
  }

  let totalMigrated = 0;

  Object.entries(registry.projects).forEach(([projectName, project]) => {
    console.log(`📋 ${projectName}:`);

    const { overlay, migratedCount } = migrateProject(projectName, project);
    totalMigrated += migratedCount;

    if (migratedCount === 0) {
      console.log(`  ℹ️  마이그레이션할 항목 없음`);
    }

    if (!dryRun) {
      const overlayPath = path.join(OVERLAYS_DIR, `${projectName}.json`);
      fs.writeFileSync(overlayPath, JSON.stringify(overlay, null, 2), 'utf8');
      console.log(`  💾 저장: ${overlayPath}`);
    }

    console.log('');
  });

  console.log(`\n✅ 마이그레이션 완료: ${totalMigrated}개 항목 변환${dryRun ? ' (실제 쓰기 없음)' : ''}\n`);
}

main();
