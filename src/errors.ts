/**
 * @fileoverview Typed error classes for the GAIA harness.
 * Each class maps 1-to-1 with an ErrorCode and a granular JobStatus,
 * so the Leader can route failures to the right state without string-parsing.
 */

import { ErrorCode } from './types';

/** Trim and truncate stderr/stdout for use in error detail fields (max 1500 chars) */
export function trim(s: string, max = 1500): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}\n… (truncated)` : t;
}

export class GaiaError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = 'GaiaError';
  }
}

/** Platform toolchain not installed (flutter, xcode, gradle, etc.) */
export class GaiaEnvError extends GaiaError {
  constructor(message: string, detail?: string) {
    super('ENV_ERROR', message, detail);
    this.name = 'GaiaEnvError';
  }
}

/** Repository access failed: clone, push, auth, permissions */
export class GaiaRepoError extends GaiaError {
  constructor(message: string, detail?: string) {
    super('REPO_ERROR', message, detail);
    this.name = 'GaiaRepoError';
  }
}

/** Dependency resolution failed: pub get, gradle sync, swift package resolve */
export class GaiaBuildError extends GaiaError {
  constructor(message: string, detail?: string) {
    super('BUILD_ERROR', message, detail);
    this.name = 'GaiaBuildError';
  }
}

/** Tests or lint failed after implementation */
export class GaiaTestError extends GaiaError {
  constructor(message: string, detail?: string) {
    super('TEST_ERROR', message, detail);
    this.name = 'GaiaTestError';
  }
}

/** PR creation or reviewer validation failed */
export class GaiaReviewError extends GaiaError {
  constructor(message: string, detail?: string) {
    super('REVIEW_ERROR', message, detail);
    this.name = 'GaiaReviewError';
  }
}

/** LLM could not produce a valid spec */
export class GaiaSpecError extends GaiaError {
  constructor(message: string, detail?: string) {
    super('SPEC_ERROR', message, detail);
    this.name = 'GaiaSpecError';
  }
}
