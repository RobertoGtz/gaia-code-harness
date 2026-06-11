/**
 * @fileoverview Implementer Agent (backward-compatible re-export)
 * @description Re-exports FlutterImplementerAgent as ImplementerAgent for backward compatibility.
 *              New code should use getAgentsForPlatform() from './registry' instead.
 */

import { FlutterImplementerAgent } from './flutter';

export { FlutterImplementerAgent as ImplementerAgent } from './flutter';
