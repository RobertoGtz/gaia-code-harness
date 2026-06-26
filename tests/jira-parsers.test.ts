/**
 * Unit tests for Jira ADF/AC parsers (no network calls).
 */
import { extractTextFromADF, parseACFromText } from '../src/tools/jira';

describe('extractTextFromADF', () => {
  const adf = {
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Add a settings screen' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'WHEN user taps settings THEN show preferences' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'WHEN user toggles dark mode THEN theme changes' }] },
    ],
  };

  it('extracts plain text from ADF paragraphs', () => {
    const text = extractTextFromADF(adf);
    expect(text).toContain('Add a settings screen');
    expect(text).toContain('WHEN user taps settings');
  });

  it('returns empty string for null or undefined input', () => {
    expect(extractTextFromADF(null)).toBe('');
    expect(extractTextFromADF(undefined)).toBe('');
  });
});

describe('parseACFromText', () => {
  it('parses WHEN/THEN acceptance criteria', () => {
    const text = 'Add a settings screen\nWHEN user taps settings THEN show preferences\nWHEN user toggles dark mode THEN theme changes';
    const acs = parseACFromText(text);
    expect(acs.length).toBe(2);
  });

  it('parses GIVEN/WHEN/THEN acceptance criteria', () => {
    const text = 'Given a logged in user When they click settings Then the settings page loads\nGiven a user on settings When they toggle dark mode Then the theme updates';
    const acs = parseACFromText(text);
    expect(acs.length).toBeGreaterThanOrEqual(1);
  });

  it('parses bullet-list acceptance criteria', () => {
    const text = 'Feature requirements:\n- User can see profile picture\n- User can edit display name\n- Dark mode toggle available';
    const acs = parseACFromText(text);
    expect(acs.length).toBe(3);
  });

  it('returns empty array for empty input', () => {
    expect(parseACFromText('').length).toBe(0);
  });
});
