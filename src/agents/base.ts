/**
 * @fileoverview Base Agent class for the Gaia Code Harness
 * @description Abstract base class that all specialized agents must extend
 * @module agents/base
 */

import { AgentContext, AgentResult } from '../types';

// ─── ANSI color helpers ────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  // foreground
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
};

const AGENT_COLOR: Record<string, string> = {
  SpecAuthor:      C.cyan,
  Implementer:     C.blue,
  Reviewer:        C.magenta,
  MutationTester:  C.yellow,
};

function timestamp(): string {
  return `${C.gray}${new Date().toLocaleTimeString('en-GB')}${C.reset}`;
}

/**
 * Abstract base class for all agents in the harness.
 * Agents are the core processing units that perform specific tasks
 * in the code generation pipeline.
 *
 * @abstract
 */
export abstract class BaseAgent {
  abstract name: string;
  abstract execute(context: AgentContext): Promise<AgentResult>;

  private get color(): string {
    return AGENT_COLOR[this.name] ?? C.white;
  }

  private get tag(): string {
    return `${this.color}${C.bold}[${this.name}]${C.reset}`;
  }

  protected log(message: string): void {
    console.log(`${timestamp()} ${this.tag} ${message}`);
  }

  protected logStep(step: string): void {
    console.log(`${timestamp()} ${this.tag} ${C.bold}${C.white}▶ ${step}${C.reset}`);
  }

  protected logSuccess(message: string): void {
    console.log(`${timestamp()} ${this.tag} ${C.green}✔ ${message}${C.reset}`);
  }

  protected logWarn(message: string): void {
    console.log(`${timestamp()} ${this.tag} ${C.yellow}⚠ ${message}${C.reset}`);
  }

  protected logError(message: string): void {
    console.error(`${timestamp()} ${this.tag} ${C.red}✖ ${message}${C.reset}`);
  }

  protected logJSON(label: string, data: unknown): void {
    const pretty = JSON.stringify(data, null, 2)
      .split('\n')
      .map((l, i) => i === 0 ? l : `       ${l}`)
      .join('\n');
    console.log(`${timestamp()} ${this.tag} ${C.gray}${label}:${C.reset}\n       ${pretty}`);
  }
}
