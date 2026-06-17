/**
 * @fileoverview JobNotifier interface
 * @description All notifier implementations (Slack, GitHub Checks, generic webhook)
 *              implement this interface. leader.ts depends only on this abstraction.
 */

import { JobStatus } from '../types';

export interface JobEvent {
  jobId:      string;
  event:      JobEventType;
  status:     JobStatus;
  title:      string;
  platform:   string;
  timestamp:  string;           // ISO-8601
  prUrl?:     string;
  error?:     string;
  mutationScore?: number;       // 0-100
  specUrl?:   string;           // path to project-spec.md or feature file
  repoUrl?:   string;
  tddMode?:   boolean;
}

export type JobEventType =
  | 'job.created'
  | 'job.spec_ready'
  | 'job.implementing'
  | 'job.reviewing'
  | 'job.mutation_testing'
  | 'job.pr_created'
  | 'job.done'
  | 'job.failed'
  | 'job.progress';

/**
 * Minimal interface every notifier must implement.
 * Failures are swallowed — notifiers must never crash the pipeline.
 */
export interface JobNotifier {
  /** Called on every job state transition. Must not throw. */
  notify(event: JobEvent): Promise<void>;
}

/** No-op notifier used when no notification target is configured. */
export class NullNotifier implements JobNotifier {
  async notify(_event: JobEvent): Promise<void> {}
}
