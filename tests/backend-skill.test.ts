/**
 * @fileoverview Tests for BackendSkill (Node.js / Backend platform skill)
 * TDD cycle — Red-Green-Refactor
 */

import { loadSkill } from '../src/plugins';

describe('BackendSkill', () => {
  let BackendSkill: any;

  beforeAll(async () => {
    const mod = await import('../src/plugins/backend');
    BackendSkill = mod.BackendSkill;
  });

  it('displayName equals "Node.js / Backend"', () => {
    const skill = new BackendSkill();
    expect(skill.displayName).toBe('Node.js / Backend');
  });

  it('getPromptContext() returns object with all required non-empty fields', () => {
    const skill = new BackendSkill();
    const ctx = skill.getPromptContext({ title: 'Test Feature', repo: 'org/repo' });

    expect(ctx.specSystem).toBeTruthy();
    expect(ctx.implementerSystem).toBeTruthy();
    expect(ctx.reviewerSystem).toBeTruthy();
    expect(ctx.filePatterns).toBeDefined();
    expect(Object.keys(ctx.filePatterns).length).toBeGreaterThan(0);
    expect(ctx.forbidden).toBeDefined();
  });

  it('getPromptContext().reviewerSystem contains "TypeScript"', () => {
    const skill = new BackendSkill();
    const ctx = skill.getPromptContext({ title: 'Test Feature', repo: 'org/repo' });

    expect(ctx.reviewerSystem).toContain('TypeScript');
  });

  it('loadSkill("backend") resolves to an instance with displayName === "Node.js / Backend"', async () => {
    const skill = await loadSkill('backend');
    expect(skill.displayName).toBe('Node.js / Backend');
  });
});
