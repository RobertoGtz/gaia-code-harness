/**
 * @fileoverview LLM Client — OpenAI / Anthropic
 * @description Unified LLM interface. Prefers OPENAI_API_KEY, falls back to ANTHROPIC_API_KEY.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type LLMMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export interface LLMResponse {
  text: string;
  provider: 'openai' | 'anthropic';
  model: string;
}

function getProvider(): 'openai' | 'anthropic' | null {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

/**
 * Call the LLM with a list of messages. Returns the assistant response text.
 * Prefers OpenAI when both keys are present.
 */
export async function callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
  const provider = getProvider();

  if (!provider) {
    throw new Error(
      'No LLM API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env'
    );
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
