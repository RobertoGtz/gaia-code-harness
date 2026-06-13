/**
 * @fileoverview Agent Registry - Factory for platform-specific agents
 * @description Selects the correct SpecAuthor, Implementer, and Reviewer
 *              agents based on the job's target platform.
 */

import { BaseAgent } from './base';
import { Platform } from '../types';
import { FlutterSpecAuthorAgent, FlutterImplementerAgent, FlutterReviewerAgent } from './flutter';
import { FlutterWebSpecAuthorAgent, FlutterWebImplementerAgent, FlutterWebReviewerAgent } from './flutter_web';
import { IosSpecAuthorAgent, IosImplementerAgent, IosReviewerAgent } from './ios';
import { AndroidSpecAuthorAgent, AndroidImplementerAgent, AndroidReviewerAgent } from './android';

/**
 * Set of agents for a specific platform.
 */
export interface PlatformAgents {
  specAuthor: BaseAgent;
  implementer: BaseAgent;
  reviewer: BaseAgent;
}

/**
 * Registry mapping platforms to their agent constructors.
 * Add new platforms here as they are implemented.
 */
const platformRegistry: Record<string, () => PlatformAgents> = {
  flutter: () => ({
    specAuthor: new FlutterSpecAuthorAgent(),
    implementer: new FlutterImplementerAgent(),
    reviewer: new FlutterReviewerAgent(),
  }),
  flutter_web: () => ({
    specAuthor: new FlutterWebSpecAuthorAgent(),
    implementer: new FlutterWebImplementerAgent(),
    reviewer: new FlutterWebReviewerAgent(),
  }),
  ios: () => ({
    specAuthor: new IosSpecAuthorAgent(),
    implementer: new IosImplementerAgent(),
    reviewer: new IosReviewerAgent(),
  }),
  android: () => ({
    specAuthor: new AndroidSpecAuthorAgent(),
    implementer: new AndroidImplementerAgent(),
    reviewer: new AndroidReviewerAgent(),
  }),
};

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
  const factory = platformRegistry[platform];
  if (!factory) {
    const supported = Object.keys(platformRegistry).join(', ');
    throw new Error(
      `Platform "${platform}" is not supported. Supported platforms: ${supported}`
    );
  }
  return factory();
}

/**
 * List all currently supported platforms.
 */
export function getSupportedPlatforms(): string[] {
  return Object.keys(platformRegistry);
}
