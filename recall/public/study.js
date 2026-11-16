export const STORAGE_KEY = 'recall.workspace.v1';
export const INTERVALS = [1, 2, 4, 9, 14];
export const METHODS = {
  retrieval: { title: 'Retrieval practice', short: 'Recall it', icon: 'cards', color: 'clay', tag: 'BRING IT TO MIND', description: 'Close your notes. Find out what you really know by bringing it back to mind.', time: '5–10 min', action: 'Practice recalling' },
  feynman: { title: 'Feynman technique', short: 'Explain it', icon: 'chat', color: 'sage', tag: 'MAKE IT SIMPLE', description: 'Understand it deeply by explaining it simply. Teach it in your own words.', time: '10–15 min', action: 'Start explaining' },
  spaced: { title: 'Spaced repetition', short: 'Revisit it', icon: 'calendar', color: 'ochre', tag: 'MAKE IT LAST', description: 'Come back at the right time. Build a little practice into lasting knowledge.', time: '5–10 min', action: 'Build a review habit' },
};
export const SAMPLE_NOTES = 'Retrieval practice means bringing information to mind without looking at your notes. After trying to recall an answer, compare it with the original material and correct any gaps. Spaced practice spreads study sessions over time instead of cramming them together. The Feynman technique asks you to explain an idea in everyday language, identify gaps in your understanding, revisit the source, and simplify your explanation. In a Leitner flashcard system, every card starts in box 1. A correct answer moves it up one box, while an incorrect answer moves it down one box, with box 1 as the minimum. This app uses review intervals of 1, 2, 4, 9, and 14 days for boxes 1 through 5. These are practical intervals from the USAHS article, not an individually optimized schedule.';
export function sampleDeck() {
  return { id: crypto.randomUUID(), title: 'The science of learning', summary: 'A small introduction to remembering more of what you learn.', notes: SAMPLE_NOTES, method: 'retrieval', sample: true, createdAt: new Date().toISOString(), cards: [
    { question: 'What does retrieval practice ask you to do before checking your notes?', answer: 'Bring the information to mind without looking at your notes, then compare your answer with the source and correct any gaps.' },
    { question: 'How does spaced practice differ from cramming?', answer: 'Spaced practice distributes learning across multiple sessions over time. Cramming concentrates that practice into a short period.' },
    { question: 'What are the main steps of the Feynman technique?', answer: 'Explain the idea simply, identify gaps, revisit the original material, and simplify your explanation.' },
    { question: 'In this Leitner system, what happens when you recall a card correctly or incorrectly?', answer: 'A correct answer moves the card up one box, to a maximum of box 5. An incorrect answer moves it down one box, to a minimum of box 1.' },
    { question: 'Which review intervals does this app use for Leitner boxes 1 through 5?', answer: '1, 2, 4, 9, and 14 days. These are practical example intervals, not a personalized optimum.' },
  ].map(card => ({ ...card, id: crypto.randomUUID(), box: 1, dueAt: null, reviews: 0 })) };
}
export function localDay(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function addDays(iso, days) { const date = new Date(iso); date.setDate(date.getDate() + days); return date.toISOString(); }
export function scheduleCard(card, correct, now = new Date().toISOString()) {
  const box = correct ? Math.min(5, card.box + 1) : Math.max(1, card.box - 1);
  return { ...card, box, reviews: card.reviews + 1, dueAt: addDays(now, INTERVALS[box - 1]) };
}
export function dueCards(decks, now = new Date()) { return decks.flatMap(deck => deck.cards.filter(card => card.dueAt && new Date(card.dueAt) <= now).map(card => ({ deck, card }))); }
export function loadWorkspace(storage) {
  try {
    storage ??= globalThis.localStorage;
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    if (value?.version === 1 && Array.isArray(value.decks) && Array.isArray(value.history)) {
      const decks = value.decks.filter(deck => deck && typeof deck.id === 'string' && typeof deck.title === 'string' && typeof deck.notes === 'string' && Object.hasOwn(METHODS, deck.method) && Array.isArray(deck.cards) && deck.cards.length > 0 && deck.cards.every(card => card && typeof card.id === 'string' && typeof card.question === 'string' && typeof card.answer === 'string' && Number.isInteger(card.box) && card.box >= 1 && card.box <= 5 && Number.isInteger(card.reviews) && card.reviews >= 0 && (card.dueAt === null || (typeof card.dueAt === 'string' && Number.isFinite(Date.parse(card.dueAt))))));
      return { version: 1, decks, history: value.history.filter(h => h && typeof h.deckId === 'string' && typeof h.finishedAt === 'string' && Number.isFinite(Date.parse(h.finishedAt)) && Number.isInteger(h.cards) && h.cards >= 0) };
    }
  } catch { /* A new workspace also works when storage is unavailable. */ }
  return { version: 1, decks: [], history: [] };
}
