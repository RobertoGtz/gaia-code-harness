/**
 * @fileoverview LLM Client — OpenAI / Anthropic / LiteLLM proxy
 * @description Unified LLM interface. Priority: LLM_BASE_URL proxy > OPENAI_API_KEY > ANTHROPIC_API_KEY.
 * Proxy path uses curl via child_process to bypass Node.js sandbox network restrictions.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export type LLMMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export interface LLMResponse {
  text: string;
  provider: 'openai' | 'anthropic';
  model: string;
}

function getProvider(): 'proxy' | 'openai' | 'anthropic' | null {
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) return 'proxy';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

async function callViaProxy(messages: LLMMessage[]): Promise<LLMResponse> {
  const model = process.env.LLM_MODEL ?? 'us.anthropic.claude-sonnet-4-6';
  const baseURL = process.env.LLM_BASE_URL!;
  const apiKey = process.env.LLM_API_KEY!;
  const url = baseURL.endsWith('/') ? `${baseURL}chat/completions` : `${baseURL}/chat/completions`;

  const body = JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 4096 });

  // Write payload to a temp file to avoid shell-quoting issues with large prompts
  const tmpFile = path.join(os.tmpdir(), `gaia-llm-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, body, 'utf8');

  try {
    const { stdout } = await execFileAsync('curl', [
      '-s', '--max-time', '120',
      '-X', 'POST', url,
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${apiKey}`,
      '-d', `@${tmpFile}`,
    ]);

    const parsed = JSON.parse(stdout) as { choices?: Array<{ message?: { content?: string } }>; error?: { message: string } };

    if (parsed.error) throw new Error(`LiteLLM error: ${parsed.error.message}`);

    const text = parsed.choices?.[0]?.message?.content ?? '';
    return { text, provider: 'openai', model };
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

/**
 * Call the LLM with a list of messages. Returns the assistant response text.
 * Priority: LLM_BASE_URL proxy > OpenAI > Anthropic.
 */
export async function callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
  const provider = getProvider();

  if (!provider) {
    throw new Error(
      'No LLM API key configured. Set LLM_BASE_URL+LLM_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in .env'
    );
  }

  if (provider === 'proxy') {
    return callViaProxy(messages);
  }

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = 'gpt-4o';

    const response = await client.chat.completions.create({
      model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: 0.2,
    });

    return {
      text: response.choices[0].message.content ?? '',
      provider: 'openai',
      model,
    };
  }

  // Anthropic
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = 'claude-3-5-sonnet-20241022';

  const systemMsg = messages.find((m) => m.role === 'system')?.content;
  const userMessages = messages.filter((m) => m.role !== 'system') as Anthropic.MessageParam[];

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemMsg,
    messages: userMessages,
  });

  const block = response.content[0];
  const text = block.type === 'text' ? block.text : '';

  return {
    text,
    provider: 'anthropic',
    model,
  };
}

/**
 * Extract a JSON block from LLM output (handles ```json ... ``` fences).
 */
export function extractJSON<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text.trim();
  return JSON.parse(raw) as T;
}
