/**
 * Unit tests for Jira ADF/AC parsers (no network calls).
 */
import { extractTextFromADF, parseACFromText } from '../src/tools/jira';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual(a: any, b: any, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// Test 1: ADF → plain text
const adf = {
  type: 'doc',
  version: 1,
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Add a settings screen' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'WHEN user taps settings THEN show preferences' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'WHEN user toggles dark mode THEN theme changes' }] },
  ]
};
const text = extractTextFromADF(adf);
assert(text.includes('Add a settings screen'), 'ADF should contain title');
assert(text.includes('WHEN user taps settings'), 'ADF should contain AC');
console.log('Test 1 (ADF parser): PASS');

// Test 2: WHEN/THEN AC parsing
const acs = parseACFromText(text);
assertEqual(acs.length, 2, 'Should find 2 WHEN/THEN ACs');
console.log('Test 2 (WHEN/THEN ACs): PASS', acs);

// Test 3: GIVEN/WHEN/THEN (single-line format supported by regex)
const gwtText = 'Given a logged in user When they click settings Then the settings page loads\nGiven a user on settings When they toggle dark mode Then the theme updates';
const gwtAcs = parseACFromText(gwtText);
assert(gwtAcs.length >= 1, 'Should find GIVEN/WHEN/THEN ACs');
console.log('Test 3 (GIVEN/WHEN/THEN): PASS', gwtAcs);

// Test 4: Bullet ACs
const bulletText = 'Feature requirements:\n- User can see profile picture\n- User can edit display name\n- Dark mode toggle available';
const bulletAcs = parseACFromText(bulletText);
assertEqual(bulletAcs.length, 3, 'Should find 3 bullet ACs');
console.log('Test 4 (Bullet ACs): PASS', bulletAcs);

// Test 5: Edge cases
assertEqual(extractTextFromADF(null), '', 'null ADF → empty');
assertEqual(extractTextFromADF(undefined), '', 'undefined ADF → empty');
assertEqual(parseACFromText('').length, 0, 'empty text → no ACs');
console.log('Test 5 (Edge cases): PASS');

console.log('\nAll parser tests passed! ✅');
