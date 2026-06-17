/**
 * @fileoverview Agent Registry - Factory for platform-agnostic agents
 * @description All platforms share the same three generic agents.
 *              Platform-specific logic lives in src/skills/{platform}/.
 */

import { BaseAgent } from './base';
import { Platform } from '../types';
import { SpecAuthorAgent } from './spec-author';
import { ImplementerAgent } from './implementer';
import { ReviewerAgent } from './reviewer';

/**
 * Set of agents for a specific platform.
 */
export interface PlatformAgents {
  specAuthor: BaseAgent;
  implementer: BaseAgent;
  reviewer: BaseAgent;
}

// Single shared instances — agents are stateless, safe to reuse across platforms
const specAuthor = new SpecAuthorAgent();
const implementer = new ImplementerAgent();
const reviewer = new ReviewerAgent();

const SUPPORTED_PLATFORMS: Platform[] = ['flutter', 'flutter_web', 'ios', 'android'];

/**
 * Get the set of agents for a given platform.
 *
 * @param platform - Target platform from the job
 * @returns PlatformAgents with specAuthor, implementer, and reviewer
 * @throws Error if platform is not supported
 *
 * @example
 * const agents = getAgentsForPlatform('flutter');
 * const result = await agents.specAuthor.execute(context);
 */
export function getAgentsForPlatform(platform: Platform): PlatformAgents {
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `Platform "${platform}" is not supported. Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')}`
    );
  }
  // All platforms use the same generic agents — skill loaded at runtime inside each agent
  return { specAuthor, implementer, reviewer };
}

/**
 * List all currently supported platforms.
 */
export function getSupportedPlatforms(): string[] {
  return [...SUPPORTED_PLATFORMS];
}
