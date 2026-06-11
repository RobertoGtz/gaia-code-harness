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
  version: string;
  description?: string;
  agents: {
    specAuthor?: string;
    implementer?: string;
    reviewer?: string;
  };
  config?: {
    maxFilesToTouch?: number;
    customRules?: string[];
    patterns?: {
      component?: string;
      screen?: string;
      test?: string;
    };
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
    
    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      this.manifest = JSON.parse(manifestContent);
      if (this.manifest?.name) {
        console.log(`[PluginLoader] Loaded manifest for: ${this.manifest.name}`);
      }
    } catch (error) {
      console.log(`[PluginLoader] No custom agents found in ${this.gaiaPath}`);
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
