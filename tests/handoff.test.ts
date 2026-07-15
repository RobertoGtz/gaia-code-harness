import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { BaseAgent } from '../src/agents/base';
import { AgentContext, AgentResult } from '../src/types';

class TestAgent extends BaseAgent {
  name = 'TestAgent';
  async execute(context: AgentContext): Promise<AgentResult> {
    return { success: true, output: 'ok' };
  }
  async write(context: AgentContext, content: string): Promise<void> {
    await this.writeHandoff(context.workspacePath, content);
  }
  async read(context: AgentContext): Promise<string> {
    return this.readHandoff(context.workspacePath);
  }
}

describe('BaseAgent handoff artifact', () => {
  let tmpDir: string;
  let agent: TestAgent;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gaia-handoff-'));
    agent = new TestAgent();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes and reads handoff.md in the workspace', async () => {
    const context = { job: { id: 'job-1' } as any, workspacePath: tmpDir };
    await agent.write(context, '# Handoff\nNext agent should do X.');
    const content = await agent.read(context);
    expect(content).toContain('Next agent should do X.');
  });

  it('returns empty string when no handoff exists', async () => {
    const context = { job: { id: 'job-1' } as any, workspacePath: tmpDir };
    const content = await agent.read(context);
    expect(content).toBe('');
  });
});
