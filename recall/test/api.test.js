import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../server/api.js';
import { SAMPLE_NOTES } from '../public/study.js';

const deck = { title: 'Learning science', summary: 'Practice learning.', cards: Array.from({ length: 5 }, (_, i) => ({ question: `Question ${i + 1}?`, answer: `Answer ${i + 1}.` })) };
const feedback = { strengths: ['Clear language.'], gaps: ['Explain the review intervals.'], simplerExplanation: 'Revisit an idea after a break.' };
const payload = { provider: 'openai', apiKey: 'test-key-not-a-real-secret', notes: SAMPLE_NOTES };
function request(data = payload, path = '/api/generate', headers = {}) { return new Request(`http://localhost:3000${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', ...headers }, body: JSON.stringify(data) }); }
const openai = (data = deck) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] }));
const gemini = (data = deck) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }] }));

test('OpenAI generates a validated deck using Responses API and disables storage', async () => {
  let captured;
  const response = await handleApi(request(), async (url, options) => { captured = { url, ...options, body: JSON.parse(options.body) }; return openai(); });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), deck);
  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.equal(captured.headers.Authorization, `Bearer ${payload.apiKey}`);
  assert.equal(captured.body.store, false);
  assert.equal(captured.body.model, 'gpt-5-mini');
  assert.equal(captured.body.reasoning.effort, 'low');
  assert.equal(captured.body.text.format.strict, true);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(captured.body.input, /Retrieval practice/);
});
test('Gemini sends key in a header, notes in contents, and the JSON schema', async () => {
  let captured;
  const response = await handleApi(request({ ...payload, provider: 'gemini' }), async (url, options) => { captured = { url, ...options, body: JSON.parse(options.body) }; return gemini(); });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), deck);
  assert.match(captured.url, /gemini-2\.5-flash:generateContent$/);
  assert.ok(!captured.url.includes(payload.apiKey));
  assert.equal(captured.headers['x-goog-api-key'], payload.apiKey);
  assert.equal(captured.body.generationConfig.responseMimeType, 'application/json');
  assert.ok(captured.body.generationConfig.responseJsonSchema.properties.cards);
});
for (const provider of ['openai', 'gemini']) {
  test(`${provider} evaluates a Feynman explanation with the feedback schema`, async () => {
    const response = await handleApi(request({ ...payload, provider, explanation: 'Retrieval practice is remembering an answer before opening your notes.' }, '/api/feedback'), async () => provider === 'openai' ? openai(feedback) : gemini(feedback));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), feedback);
  });
}
for (const [name, value] of [['null payload', null], ['unknown provider', { ...payload, provider: '__proto__' }], ['missing key', { ...payload, apiKey: '' }], ['key with newline', { ...payload, apiKey: 'secret\nkey' }], ['short notes', { ...payload, notes: 'short' }], ['oversize notes', { ...payload, notes: 'x'.repeat(30001) }], ['model URL injection', { ...payload, model: '../../other?key=stolen' }]]) {
  test(`rejects ${name} before contacting a provider`, async () => {
    const response = await handleApi(request(value), () => { assert.fail('Provider must not be called'); });
    assert.equal(response.status, 400);
  });
}
test('rejects cross-origin requests', async () => {
  const response = await handleApi(request(payload, '/api/generate', { Origin: 'https://another.example' }), () => assert.fail('Provider must not be called'));
  assert.equal(response.status, 403);
});
test('limits body size independently of a Content-Length header', async () => {
  const response = await handleApi(request({ ...payload, notes: 'x'.repeat(100001) }), () => assert.fail('Provider must not be called'));
  assert.equal(response.status, 413);
});
test('rejects invalid JSON, wrong methods, wrong content types, and unknown routes', async () => {
  assert.equal((await handleApi(new Request('http://localhost:3000/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }))).status, 400);
  assert.equal((await handleApi(new Request('http://localhost:3000/api/generate'))).status, 405);
  assert.equal((await handleApi(request(payload, '/api/generate', { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await handleApi(request(payload, '/api/other'))).status, 404);
});
test('provider errors are actionable and do not expose provider response or key', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const response = await handleApi(request(), async () => new Response(`secret upstream detail ${payload.apiKey}`, { status }));
    assert.equal(response.status, status === 429 ? 429 : 502);
    const body = await response.text();
    assert.ok(!body.includes(payload.apiKey));
    assert.ok(!body.includes('secret upstream'));
  }
});
test('rejects incomplete, refusal, malformed, and semantically invalid provider output', async () => {
  const outputs = [
    new Response(JSON.stringify({ status: 'incomplete', output: [] })),
    new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No.' }] }] })),
    new Response('not json'), openai({ ...deck, cards: [] }), openai({ ...deck, cards: [null, null, null, null, null] }),
  ];
  for (const output of outputs) assert.equal((await handleApi(request(), async () => output)).status, 502);
  assert.equal((await handleApi(request({ ...payload, provider: 'gemini' }), async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS' }] })))).status, 502);
});
test('cancelled request returns a recoverable timeout error', async () => {
  const controller = new AbortController(); controller.abort();
  const req = new Request(request(), { signal: controller.signal });
  const response = await handleApi(req, async () => { throw new DOMException('Aborted', 'AbortError'); });
  assert.equal(response.status, 504);
});
