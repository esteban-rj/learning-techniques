import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleDeck, scheduleCard, dueCards, loadWorkspace, INTERVALS, localDay } from '../public/study.js';
const now = '2026-11-16T15:00:00.000Z';
test('Leitner cards promote, demote, and stay within all five boxes', () => {
  let card = sampleDeck().cards[0];
  const original = { ...card };
  card = scheduleCard(card, true, now);
  assert.deepEqual(original, { ...original, box: 1, reviews: 0, dueAt: null });
  assert.equal(card.box, 2);
  assert.equal(card.dueAt, '2026-11-18T15:00:00.000Z');
  for (let i = 0; i < 10; i++) card = scheduleCard(card, true, now);
  assert.equal(card.box, 5);
  for (let i = 0; i < 10; i++) card = scheduleCard(card, false, now);
  assert.equal(card.box, 1);
  assert.equal(card.dueAt, '2026-11-17T15:00:00.000Z');
  assert.deepEqual(INTERVALS, [1, 2, 4, 9, 14]);
});
test('only actually scheduled and currently due cards enter a due review', () => {
  const deck = sampleDeck();
  deck.cards[0].dueAt = now;
  deck.cards[1].dueAt = '2026-11-17T15:00:00.000Z';
  assert.equal(dueCards([deck], new Date(now)).length, 1);
  assert.equal(dueCards([deck], new Date('2026-11-18')).length, 2);
});
test('workspace survives a reload while corrupt records and blocked storage recover gracefully', () => {
  const deck = sampleDeck();
  const state = { version: 1, decks: [deck], history: [] };
  assert.deepEqual(loadWorkspace({ getItem: () => JSON.stringify(state) }), state);
  assert.equal(loadWorkspace({ getItem: () => '{invalid' }).decks.length, 0);
  assert.equal(loadWorkspace({ getItem: () => { throw new Error('blocked'); } }).decks.length, 0);
  assert.equal(loadWorkspace({ getItem: () => JSON.stringify({ ...state, decks: [{ ...deck, cards: [null] }] }) }).decks.length, 0);
});
test('local date keys use calendar dates rather than UTC truncation', () => {
  const date = new Date(2026, 10, 16, 23, 50);
  assert.equal(localDay(date), '2026-11-16');
});
