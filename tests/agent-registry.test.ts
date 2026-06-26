/**
 * Unit tests for agent registry (src/agents/registry.ts).
 * No LLM calls, no filesystem access.
 */
import {
  getAgentsForPlatform,
  getSupportedPlatforms,
  PlatformAgents,
} from '../src/agents/registry';

describe('agent registry', () => {
  describe('getSupportedPlatforms', () => {
    it('returns an array', () => {
      expect(Array.isArray(getSupportedPlatforms())).toBe(true);
    });

    it('includes flutter, ios, android, flutter_web', () => {
      const platforms = getSupportedPlatforms();
      expect(platforms).toContain('flutter');
      expect(platforms).toContain('flutter_web');
      expect(platforms).toContain('ios');
      expect(platforms).toContain('android');
    });
  });

  describe('getAgentsForPlatform', () => {
    it.each(['flutter', 'flutter_web', 'ios', 'android'] as const)(
      'returns agents for %s',
      (platform) => {
        const agents = getAgentsForPlatform(platform);
        expect(agents.specAuthor).toBeDefined();
        expect(agents.implementer).toBeDefined();
        expect(agents.reviewer).toBeDefined();
        expect(agents.mutationTester).toBeDefined();
      }
    );

    it('returns the same shared instance for the same platform (singleton)', () => {
      const a = getAgentsForPlatform('flutter');
      const b = getAgentsForPlatform('flutter');
      expect(a.specAuthor).toBe(b.specAuthor);
      expect(a.implementer).toBe(b.implementer);
    });

    it('returns the same agents across platforms (platform-agnostic)', () => {
      const flutter = getAgentsForPlatform('flutter');
      const ios     = getAgentsForPlatform('ios');
      expect(flutter.specAuthor).toBe(ios.specAuthor);
      expect(flutter.implementer).toBe(ios.implementer);
    });

    it('throws for unsupported platform', () => {
      expect(() => getAgentsForPlatform('unknown' as any))
        .toThrow(/not supported/i);
    });

    it('error message lists supported platforms', () => {
      try {
        getAgentsForPlatform('cobol' as any);
      } catch (e: any) {
        expect(e.message).toContain('flutter');
        expect(e.message).toContain('ios');
      }
    });
  });
});
