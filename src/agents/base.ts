/**
 * @fileoverview Base Agent class for the Gaia Code Harness
 * @description Abstract base class that all specialized agents must extend
 * @module agents/base
 */

import { AgentContext, AgentResult } from '../types';

/**
 * Abstract base class for all agents in the harness.
 * Agents are the core processing units that perform specific tasks
 * in the code generation pipeline.
 *
 * @abstract
 * @example
 * class SpecAuthorAgent extends BaseAgent {
 *   name = 'SpecAuthor';
 *
 *   async execute(context: AgentContext): Promise<AgentResult> {
 *     // Implementation here
 *   }
 * }
 */
export abstract class BaseAgent {
  /**
   * Agent identifier used for logging and metrics
   * @abstract
   */
  abstract name: string;

  /**
   * Execute the agent's primary task.
   * This is the main entry point called by the Leader orchestrator.
   *
   * @param context - Execution context containing job, workspace path, and relevant files
   * @returns Promise resolving to the agent result with success/failure status
   * @abstract
   */
  abstract execute(context: AgentContext): Promise<AgentResult>;

  /**
   * Log a message with the agent's name prefix.
   * All log output is captured in the job's progress logs for debugging.
   *
   * @param message - The message to log
   * @protected
   */
  protected log(message: string): void {
    console.log(`[${this.name}] ${message}`);
  }
}
