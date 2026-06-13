/**
 * @fileoverview Plugin Loader for Custom Agents
 * @description Dynamically loads project-specific agents from .gaia/agents/ directories
 * @module harness/plugin-loader
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { BaseAgent } from '../agents/base';
import { CodeGenerationJob, Platform } from '../types';

type AgentFactory = () => BaseAgent;

interface PluginManifest {
  name: string;
  platform?: string;
  version: string;
  description?: string;
  agents?: {
    specAuthor?: string;
    implementer?: string;
    reviewer?: string;
  };
  config?: {
    maxFilesToTouch?: number;
    requireTests?: boolean;
    targetBranch?: string;
    architecture?: string;
    module?: string;
    /** File path patterns per artifact type (supports {Name}/{name} placeholders) */
    patterns?: Record<string, string>;
    /** Naming convention rules */
    naming?: Record<string, string>;
    /** Code style and architecture rules passed as context to agents */
    codeRules?: string[];
    /** Test coverage and naming rules passed as context to agents */
    testRules?: string[];
    /** Files/paths the agent must never modify */
    forbidden?: string[];
    /** Legacy alias for codeRules */
    customRules?: string[];
  };
}

interface AgentResolution {
  agent: BaseAgent;
  source: 'custom' | 'default';
  manifest?: PluginManifest;
}

/**
 * PluginLoader - Dynamic agent loading system
 */
export class PluginLoader {
  private repoPath: string;
  private gaiaPath: string;
  private manifest?: PluginManifest;
  private rulesMarkdown?: string;
  private cache: Map<string, BaseAgent> = new Map();

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.gaiaPath = path.join(repoPath, '.gaia');
  }

  /**
   * Initialize the plugin loader
   * Reads the manifest file if it exists
   */
  async initialize(): Promise<void> {
    const manifestPath = path.join(this.gaiaPath, 'gaia.json');
    const rulesPath    = path.join(this.gaiaPath, 'RULES.md');

    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      this.manifest = JSON.parse(manifestContent);
      if (this.manifest?.name) {
        console.log(`[PluginLoader] Loaded manifest for: ${this.manifest.name}`);
      }
    } catch {
      console.log(`[PluginLoader] No gaia.json found in ${this.gaiaPath}`);
    }

    try {
      this.rulesMarkdown = await fs.readFile(rulesPath, 'utf-8');
      console.log(`[PluginLoader] Loaded RULES.md for: ${this.manifest?.name ?? this.repoPath}`);
    } catch {
      // RULES.md is optional
    }
  }

  /**
   * Load an agent for a specific job
   */
  async loadAgent(
    agentType: 'specAuthor' | 'implementer' | 'reviewer',
    platform: Platform
  ): Promise<AgentResolution> {
    const cacheKey = `${agentType}-${platform}`;
    
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        agent: cached,
        source: 'custom',
        manifest: this.manifest,
      };
    }

    const customAgent = await this.loadCustomAgent(agentType, platform);
    
    if (customAgent) {
      this.cache.set(cacheKey, customAgent);
      return {
        agent: customAgent,
        source: 'custom',
        manifest: this.manifest,
      };
    }

    const defaultAgent = await this.loadDefaultAgent(agentType);
    return {
      agent: defaultAgent,
      source: 'default',
    };
  }

  private async loadCustomAgent(
    agentType: 'specAuthor' | 'implementer' | 'reviewer',
    platform: Platform
  ): Promise<BaseAgent | null> {
    const agentsDir = path.join(this.gaiaPath, 'agents');
    
    const platformSpecificFile = `${platform}-${agentType}.ts`;
    const platformSpecificPath = path.join(agentsDir, platformSpecificFile);
    
    if (await this.fileExists(platformSpecificPath)) {
      console.log(`[PluginLoader] Loading platform-specific agent: ${platformSpecificFile}`);
      return await this.importAgent(platformSpecificPath);
    }

    const genericFile = `${agentType}.ts`;
    const genericPath = path.join(agentsDir, genericFile);
    
    if (await this.fileExists(genericPath)) {
      console.log(`[PluginLoader] Loading custom agent: ${genericFile}`);
      return await this.importAgent(genericPath);
    }

    if (this.manifest?.agents?.[agentType]) {
      const manifestFile = this.manifest.agents[agentType]!;
      const manifestPath = path.join(agentsDir, manifestFile);
      
      if (await this.fileExists(manifestPath)) {
        console.log(`[PluginLoader] Loading manifest-specified agent: ${manifestFile}`);
        return await this.importAgent(manifestPath);
      }
    }

    return null;
  }

  private async loadDefaultAgent(
    agentType: 'specAuthor' | 'implementer' | 'reviewer'
  ): Promise<BaseAgent> {
    switch (agentType) {
      case 'specAuthor':
        const { SpecAuthorAgent } = await import('../agents/spec-author');
        return new SpecAuthorAgent();
      
      case 'implementer':
        const { ImplementerAgent } = await import('../agents/implementer');
        return new ImplementerAgent();
      
      case 'reviewer':
        const { ReviewerAgent } = await import('../agents/reviewer');
        return new ReviewerAgent();
      
      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }
  }

  private async importAgent(filePath: string): Promise<BaseAgent> {
    try {
      const module = await import(filePath);
      const AgentClass = module.default || module[Object.keys(module)[0]];
      return new AgentClass();
    } catch (error) {
      console.error(`[PluginLoader] Failed to import agent from ${filePath}:`, error);
      throw new Error(`Failed to load agent: ${error}`);
    }
  }

  getConfig(): PluginManifest['config'] | undefined {
    return this.manifest?.config;
  }

  hasCustomAgents(): boolean {
    return !!this.manifest || this.cache.size > 0;
  }

  /** Returns the raw content of RULES.md if it exists, otherwise undefined. */
  getRulesMarkdown(): string | undefined {
    return this.rulesMarkdown;
  }

  /**
   * Returns all rules as a context string for LLM prompts.
   * Prefers RULES.md (rich prose) and supplements with structured fields from gaia.json.
   */
  getRulesAsContext(): string {
    const sections: string[] = [];

    // Prefer prose rules from RULES.md as primary context
    if (this.rulesMarkdown) {
      sections.push(this.rulesMarkdown.trim());
    }

    // Supplement with structured fields from gaia.json that are not covered by RULES.md
    const cfg = this.manifest?.config;
    if (cfg) {
      const structured: string[] = [];

      if (cfg.patterns && Object.keys(cfg.patterns).length > 0) {
        structured.push('## File Path Patterns');
        for (const [type, pattern] of Object.entries(cfg.patterns)) {
          structured.push(`- ${type}: ${pattern}`);
        }
      }

      if (cfg.naming && Object.keys(cfg.naming).length > 0) {
        structured.push('\n## Naming Conventions');
        for (const [scope, convention] of Object.entries(cfg.naming)) {
          structured.push(`- ${scope}: ${convention}`);
        }
      }

      // Only include these if RULES.md is absent (avoid duplication)
      if (!this.rulesMarkdown) {
        const codeRules = [...(cfg.codeRules ?? []), ...(cfg.customRules ?? [])];
        if (codeRules.length > 0) {
          structured.push('\n## Code Rules (MUST follow)');
          codeRules.forEach(r => structured.push(`- ${r}`));
        }

        if (cfg.testRules && cfg.testRules.length > 0) {
          structured.push('\n## Test Rules (MUST follow)');
          cfg.testRules.forEach(r => structured.push(`- ${r}`));
        }

        if (cfg.forbidden && cfg.forbidden.length > 0) {
          structured.push('\n## Forbidden (NEVER modify these)');
          cfg.forbidden.forEach(r => structured.push(`- ${r}`));
        }
      }

      if (structured.length > 0) {
        sections.push(structured.join('\n'));
      }
    }

    return sections.join('\n\n---\n\n');
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create a plugin loader for a job
 */
export async function createPluginLoader(repoPath: string): Promise<PluginLoader> {
  const loader = new PluginLoader(repoPath);
  await loader.initialize();
  return loader;
}
