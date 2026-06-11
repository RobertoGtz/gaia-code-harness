/**
 * @fileoverview Reviewer Agent (backward-compatible re-export)
 * @description Re-exports FlutterReviewerAgent as ReviewerAgent for backward compatibility.
 *              New code should use getAgentsForPlatform() from './registry' instead.
 */

import { FlutterReviewerAgent } from './flutter';

export { FlutterReviewerAgent as ReviewerAgent } from './flutter';
