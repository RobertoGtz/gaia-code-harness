/**
 * Unit tests for LLM utility functions (src/tools/llm.ts).
 * Tests extractJSON only — callLLM requires a real API key.
 */
import { extractJSON } from '../src/tools/llm';

describe('extractJSON', () => {
  it('parses plain JSON string', () => {
    const result = extractJSON<{ x: number }>('{"x": 42}');
    expect(result.x).toBe(42);
  });

  it('extracts JSON from ```json ... ``` fence', () => {
    const text = '```json\n{"key": "value"}\n```';
    const result = extractJSON<{ key: string }>(text);
    expect(result.key).toBe('value');
  });

  it('extracts JSON from ``` ... ``` fence (no language tag)', () => {
    const text = '```\n{"a": true}\n```';
    const result = extractJSON<{ a: boolean }>(text);
    expect(result.a).toBe(true);
  });

  it('handles fenced JSON with surrounding text', () => {
    const text = 'Here is the spec:\n```json\n{"title": "Banner"}\n```\nEnd.';
    const result = extractJSON<{ title: string }>(text);
    expect(result.title).toBe('Banner');
  });

  it('parses arrays', () => {
    const result = extractJSON<string[]>('["a", "b", "c"]');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('parses nested objects', () => {
    const result = extractJSON<{ spec: { tasks: string[] } }>(
      '{"spec": {"tasks": ["t1", "t2"]}}'
    );
    expect(result.spec.tasks).toHaveLength(2);
  });

  it('throws SyntaxError on invalid JSON', () => {
    expect(() => extractJSON('not json at all')).toThrow(SyntaxError);
  });

  it('throws SyntaxError on empty fenced block', () => {
    expect(() => extractJSON('```json\n\n```')).toThrow();
  });
});
