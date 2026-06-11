/**
 * @fileoverview SpecAuthor Agent (backward-compatible re-export)
 * @description Re-exports FlutterSpecAuthorAgent as SpecAuthorAgent for backward compatibility.
 *              New code should use getAgentsForPlatform() from './registry' instead.
 */

import { FlutterSpecAuthorAgent } from './flutter';

export { FlutterSpecAuthorAgent as SpecAuthorAgent } from './flutter';
