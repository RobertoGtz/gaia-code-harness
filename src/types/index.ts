/**
 * @fileoverview Core TypeScript types and interfaces for Gaia Code Harness
 * @description Defines the domain model including job lifecycle, specs, tasks, and API contracts
 * @module types
 */

/**
 * Represents the current state of a code generation job in the state machine.
 * The job transitions through these states from creation to completion.
 * 
 * @example
 * 'pending' → 'spec_generating' → 'spec_ready' → 'spec_approved' → 'implementing' → 'reviewing' → 'pr_created' → 'done'
 */
export type JobStatus = 
  | 'pending'
  | 'fetching_jira'
  | 'spec_generating'
  | 'spec_ready'
  | 'spec_approved'
  | 'implementing'
  | 'reviewing'
  | 'pr_created'
  | 'done'
  // ── Granular error states ────────────────────────────────────
  | 'failed'        // Generic / unknown failure (always retryable)
  | 'env_error'     // Platform toolchain missing (flutter/xcode/gradle not found)
  | 'repo_error'    // Repo access failed (clone, push, permissions)
  | 'build_error'   // Dependency resolution failed (pub get, gradle sync, spm)
  | 'test_error'    // Tests or lint failed after implementation
  | 'review_error'  // PR creation or reviewer validation failed
  | 'spec_error';   // LLM could not produce a valid spec

/**
 * Machine-readable error category — matches granular JobStatus error states.
 * Used in AgentResult and ErrorContext to allow the Leader to route
 * to the correct error state without string-parsing.
 */
export type ErrorCode =
  | 'ENV_ERROR'
  | 'REPO_ERROR'
  | 'BUILD_ERROR'
  | 'TEST_ERROR'
  | 'REVIEW_ERROR'
  | 'SPEC_ERROR'
  | 'UNKNOWN';

/**
 * Structured error context persisted in the DB alongside the job.
 * Visible via GET /jobs/:id for observability and debugging.
 */
export interface ErrorContext {
  /** Machine-readable error category */
  code: ErrorCode;
  /** Job status at the time the error occurred */
  stage: JobStatus;
  /** Human-readable error message */
  message: string;
  /** Raw stack trace or tool output (trimmed to 2000 chars) */
  detail?: string;
  /** ISO timestamp of the failure */
  timestamp: string;
  /** How many retries have been attempted for this stage */
  retryCount: number;
}

/**
 * Supported target platforms for code generation.
 * Determines which toolchain and conventions to use.
 */
export type Platform = 'flutter' | 'flutter_web' | 'ios' | 'android' | 'backend';

/**
 * Single acceptance criterion in EARS format (Easy Approach to Requirements Syntax).
 * EARS format: "WHEN [condition] THEN [action]"
 * 
 * @example
 * {
 *   id: 'ac-1',
 *   text: 'WHEN user opens home screen THEN display promotional banner',
 *   testable: true
 * }
 */
export interface AcceptanceCriterion {
  /** Unique identifier for this criterion */
  id: string;
  /** Requirement text in EARS format: "WHEN ... THEN ..." */
  text: string;
  /** Whether this criterion can be automatically tested */
  testable: boolean;
}

/**
 * Core data structure representing a code generation request.
 * Contains all information needed to process a job from requirements to PR.
 * 
 * @example
 * {
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   title: 'Add promotional banner',
 *   platform: 'flutter',
 *   repo: 'rpp-pyme-multiplatform',
 *   status: 'pending',
 *   acceptanceCriteria: [...],
 *   maxFilesToTouch: 5,
 *   requireTests: true
 * }
 */
export interface CodeGenerationJob {
  /** Unique identifier (UUID) */
  id: string;
  /** Associated Jira ticket ID (e.g., 'RPP-1234') */
  jiraTicketId?: string;
  /** Associated Jira epic ID */
  jiraEpicId?: string;
  /** Initiative or feature group identifier */
  initiativeId: string;
  /** Human-readable title of the feature */
  title: string;
  /** Target platform for code generation */
  platform: Platform;
  /** Repository name (e.g., 'rpp-pyme-multiplatform') */
  repo: string;
  /** Module within monorepo (e.g., 'pay_multiplatform_home_web') */
  module?: string;
  /** Git branch to target (default: 'develop') */
  targetBranch: string;
  /** Detailed description of the feature */
  description?: string;
  /** List of acceptance criteria in EARS format */
  acceptanceCriteria: AcceptanceCriterion[];
  /** URL to Figma design file */
  figmaUrl?: string;
  /** Technical constraints (e.g., 'Must work offline') */
  technicalConstraints?: string[];
  /** Maximum number of files the agent can modify (safety limit) */
  maxFilesToTouch: number;
  /** Whether tests are required for this job */
  requireTests: boolean;
  
  /** Current state in the state machine */
  status: JobStatus;
  /** Name of the currently executing agent */
  currentAgent?: string;
  /** Chronological log of progress messages */
  progressLogs: string[];
  
  /** Generated technical specification (output) */
  spec?: TechnicalSpec;
  /** Git branch name created (output) */
  branchName?: string;
  /** URL to created Pull Request (output) */
  prUrl?: string;
  /** Pull Request ID (output) */
  prId?: string;
  
  /** When the job was created */
  createdAt: Date;
  /** When the job was last updated */
  updatedAt: Date;
  /** Structured error context — set when job enters an error state */
  errorContext?: ErrorContext;
}

export interface TechnicalSpec {
  requirements: {
    id: string;
    content: string;
    sourceAcId?: string;
  }[];
  design: {
    affectedFiles: string[];
    newFiles: string[];
    architectureDecisions: string[];
    uiComponents?: string[];
  };
  tasks: ImplementationTask[];
  risks: string[];
}

export interface ImplementationTask {
  id: string;
  description: string;
  filePath?: string;
  type: 'create' | 'modify' | 'test' | 'refactor';
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  dependsOn?: string[];
}

export interface FileChange {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  originalContent?: string;
  newContent: string;
  diff: string;
}

export interface TestResult {
  passed: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface AgentContext {
  job: CodeGenerationJob;
  workspacePath: string;
  relevantFiles?: string[];
  memory?: Record<string, any>;
}

export interface AgentResult {
  success: boolean;
  output: string;
  spec?: TechnicalSpec;
  changes?: FileChange[];
  testResults?: TestResult[];
  prUrl?: string;
  prId?: string;
  branchName?: string;
  nextStatus?: JobStatus;
  error?: string;
  /** Machine-readable error category — used by Leader to pick the right error state */
  errorCode?: ErrorCode;
}

// Request/Response para API
export interface CreateJobRequest {
  jiraTicketId?: string;
  jiraEpicId?: string;
  // Flat fields — can be sent directly without wrapping in fullContext
  title?: string;
  platform?: Platform;
  repo?: string;
  module?: string;
  targetBranch?: string;
  description?: string;
  figmaUrl?: string;
  acceptanceCriteria?: Array<string | { id: string; text: string; priority?: string }>;
  fullContext?: {
    title: string;
    description?: string;
    acceptanceCriteria: string[];
    figmaUrl?: string;
    platform: Platform;
    repo: string;
    module?: string;
    targetBranch?: string;
  };
}

export interface ApproveSpecRequest {
  approved: boolean;
  feedback?: string;
}
