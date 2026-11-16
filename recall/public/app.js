import { METHODS, STORAGE_KEY, INTERVALS, sampleDeck, scheduleCard, dueCards, loadWorkspace, localDay } from './study.js';
import { SOURCES, TECHNIQUES, MAIN_SOURCE } from './sources.js';

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M12 5v16m0-16C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-3-1-7-2-10 1Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 5h2m6 0h2"/>',
  leaf: '<path d="M20 3C7 2 2 8 5 15s15 6 15-12ZM4 21 15 10"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>',
  'arrow-left': '<path d="M20 12H4m6-6-6 6 6 6"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM21 2v4m-2-2h4"/>',
  cards: '<rect x="6" y="6" width="14" height="15" rx="2"/><path d="M15 3H5a2 2 0 0 0-2 2v11m7-4h6m-6 4h4"/>',
  chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 1.5-6A8 8 0 0 1 11 3h2a8 8 0 0 1 8 8Z"/><path d="M7 9h9M7 13h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  shield: '<path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
};
function icon(name, className = '') { return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`; }
function hydrateIcons() { document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); el.removeAttribute('data-icon'); }); }
let workspace = loadWorkspace();
let connection = { provider: 'openai', apiKey: '', model: 'gpt-5-mini' };
let session = null;
let requestController = null;
let feedbackController = null;
let deleteId = null;
let toastTimer;
const providerNames = { openai: 'OpenAI', gemini: 'Gemini' };
const modelDefaults = { openai: 'gpt-5-mini', gemini: 'gemini-2.5-flash' };
const dateLabel = (date, options = { month: 'short', day: 'numeric' }) => new Date(date).toLocaleDateString(undefined, options);
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4500); }
function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); } catch { toast('Device storage is unavailable or full. Keep this tab open to retain your progress.'); } updateCounts(); }
function updateCounts() { $('#library-count').textContent = workspace.decks.length; const due = dueCards(workspace.decks).length; $('#due-count').textContent = due || ''; }
function setPage(page, title) {
  $('#page-label').textContent = title;
  document.querySelectorAll('[data-nav]').forEach(el => { const active = el.dataset.nav === page; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
}
function sectionHeading(eyebrow, title, description) { return `<div class="page-heading"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>`; }
function deckRow(deck, { sample = false, schedule = false } = {}) {
  const method = METHODS[deck.method];
  const due = dueCards([deck]).length;
  return `<div class="deck-row"><span class="deck-icon ${method.color}">${icon(method.icon)}</span><div class="deck-info"><strong>${esc(deck.title)}</strong><span>${sample || deck.sample ? '<span class="sample-label">SAMPLE</span> ' : ''}${esc(method.title)}<span class="dot-separator">·</span>${deck.method === 'feynman' ? 'Reflection' : `${deck.cards.length} ${deck.cards.length === 1 ? 'card' : 'cards'}`}</span></div>${schedule ? `<span class="due-pill">${due} due</span>` : `<span class="deck-date">${sample ? 'Ready to explore' : dateLabel(deck.createdAt)}</span>`}<button class="icon-button row-arrow" data-action="${sample ? 'sample' : schedule ? 'review' : 'study'}" data-id="${esc(deck.id)}" aria-label="${sample ? 'Try sample session' : 'Study ' + esc(deck.title)}">${icon('arrow-right')}</button></div>`;
}
const growthArt = `<svg class="hero-art" viewBox="0 0 330 235" fill="none" aria-hidden="true"><ellipse cx="177" cy="199" rx="107" ry="10" fill="#eceae3"/><path d="m86 171 76-22 89 22-78 24-87-24Z" fill="#f0e5d7" stroke="#74785f" stroke-width="1.2"/><path d="M86 171v12l87 25 78-26v-11M173 195v13M92 179l78 23m9 0 66-22" stroke="#74785f" stroke-width="1.2"/><path d="m104 157 69-20 65 18-66 21-68-19Z" fill="#f9f7f0" stroke="#74785f" stroke-width="1.2"/><path d="M104 157v10l68 20 66-22v-10m-66 21v11" stroke="#74785f" stroke-width="1.2"/><path d="M174 154V72c-2-19 2-36 12-49" stroke="#66765c" stroke-width="2"/><path d="M174 113c-36 3-52-15-51-38 27-1 51 10 51 38Z" fill="#d5dec9" stroke="#66765c" stroke-width="1.3"/><path d="M175 89c33 1 51-17 48-42-24 1-45 14-48 42Z" fill="#e4e8d9" stroke="#66765c" stroke-width="1.3"/><path d="m131 84 42 28m41-55-38 31" stroke="#66765c" stroke-width="1.2"/><path d="M186 25c-16 6-29-2-26-13 12-5 24 1 26 13Z" fill="#c6d0b8" stroke="#66765c" stroke-width="1.2"/><path d="M244 100h16m-8-8v16M105 44v10m-5-5h10" stroke="#b68a56" stroke-width="1.4"/><circle cx="102" cy="122" r="3" fill="#b68a56"/><path d="M258 133c20-2 31-13 23-24-7-9-17-3-13 4" stroke="#b68a56" stroke-width="1.2" stroke-dasharray="3 4"/></svg>`;
function renderHome() {
  setPage('home', 'Study space');
  const totalCards = workspace.history.reduce((sum, h) => sum + h.cards, 0);
  const recent = [...workspace.decks].reverse().slice(0, 3);
  $('#main').innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="tiny-dot"></span>LEARN WITH INTENTION</div><h1>A little practice.<br>A lasting <em>difference.</em></h1><p>Turn what you’re learning into what you know.<br>Science-backed techniques. A space to make them yours.</p><div class="hero-actions"><button class="button primary" data-action="new">${icon('plus')}New study session</button><button class="text-button" data-action="sample">Try a sample session${icon('arrow-right')}</button></div></div><div class="hero-illustration">${growthArt}<span>Good things take a little practice.</span></div></section>
    <section class="stats-strip" aria-label="Your study progress"><div>${icon('check')}<span><strong>${workspace.history.length}</strong><span>Sessions completed</span></span></div><div>${icon('cards')}<span><strong>${totalCards}</strong><span>Cards practiced</span></span></div><div>${icon('calendar')}<span><strong>${dueCards(workspace.decks).length}</strong><span>Reviews due today</span></span><a class="stat-link" href="#schedule" aria-label="View review schedule">${icon('arrow-up-right')}</a></div></section>
    <section class="techniques-section"><div class="section-header"><div><span class="eyebrow">FIND YOUR FLOW</span><h2>How would you like to learn?</h2></div><a class="subtle-link" href="#resources">Explore the techniques${icon('arrow-up-right')}</a></div><div class="technique-grid">${Object.entries(METHODS).map(([key, method], index) => `<article class="technique-card ${method.color}"><div class="technique-card-top"><span class="method-icon">${icon(method.icon)}</span><span class="card-number">0${index + 1}</span></div><span class="eyebrow">${method.tag}</span><h3>${method.title}</h3><p>${method.description}</p><div class="technique-card-bottom"><span>${icon('clock')}${method.time}</span><button class="icon-button" data-action="new" data-method="${key}" aria-label="${method.action}">${icon('arrow-up-right')}</button></div></article>`).join('')}</div></section>
    <section class="home-bottom"><div class="recent-section"><div class="section-header"><h2>Your learning, in motion</h2><a class="subtle-link" href="#library">View library${icon('arrow-right')}</a></div><p class="section-caption">${recent.length ? 'Pick up an idea and keep it growing.' : 'Every great habit starts with a first session.'}</p><div class="recent-list">${recent.length ? recent.map(deck => deckRow(deck)).join('') : deckRow(sampleDeck(), { sample: true })}</div>${!recent.length ? '<p class="first-step-note">Your study sets will find a home here. Ready when you are.</p>' : ''}</div><aside class="insight-card"><span class="eyebrow">A NOTE TO REMEMBER</span><span class="insight-sparkle">✳</span><h3>A little forgetting<br>is part of learning.</h3><p>Revisit an idea after a break. The effort of recalling it gives you another chance to strengthen the connection.</p><a href="#resources" class="subtle-link">The science behind it${icon('arrow-up-right')}</a></aside></section>`;
}
function renderLibrary(query = '') {
  setPage('library', 'My library');
  const decks = [...workspace.decks].reverse().filter(d => `${d.title} ${METHODS[d.method].title}`.toLowerCase().includes(query.toLowerCase()));
  $('#main').innerHTML = `${sectionHeading('YOUR GROWING COLLECTION', 'A home for your ideas.', 'Return to your notes, revisit a question, and keep the connections growing.')}<div class="toolbar"><div class="search-input">${icon('search')}<input id="library-search" type="search" aria-label="Search your library" placeholder="Find a study set…" value="${esc(query)}"></div><div class="toolbar-actions">${workspace.decks.length ? `<button class="button secondary" data-action="export">${icon('download')}Export</button>` : ''}<button class="button primary" data-action="new">${icon('plus')}New study set</button></div></div><div class="library-list">${decks.length ? decks.map(deck => `<article class="library-card">${deckRow(deck)}<p>${esc(deck.summary)}</p><div class="library-card-bottom"><span>${deck.method === 'feynman' ? (deck.lastExplanation ? 'Reflection saved' : 'Ready to explain') : `${deck.cards.filter(c => c.reviews > 0).length} of ${deck.cards.length} cards practiced`}</span><div><button class="text-button" data-action="study" data-id="${esc(deck.id)}">Open study set${icon('arrow-right')}</button><button class="icon-button" data-action="delete" data-id="${esc(deck.id)}" aria-label="Delete ${esc(deck.title)}">${icon('trash')}</button></div></div></article>`).join('') : `<div class="empty-state">${icon('book')}<h2>${query ? 'No matching ideas yet.' : 'Your next idea belongs here.'}</h2><p>${query ? 'Try a different title or technique.' : 'Create a study set from your notes, or explore a sample to get a feel for it.'}</p><button class="button secondary" data-action="${query ? 'new' : 'sample'}">${query ? 'Create a study set' : 'Explore a sample'}${icon('arrow-right')}</button></div>`}</div>`;
}
function renderSchedule() {
  setPage('schedule', 'Review schedule');
  const now = new Date();
  const due = dueCards(workspace.decks, now);
  const scheduled = workspace.decks.flatMap(deck => deck.cards.filter(c => c.dueAt).map(card => ({ deck, card }))).sort((a, b) => new Date(a.card.dueAt) - new Date(b.card.dueAt));
  const days = Array.from({ length: 7 }, (_, i) => { const day = new Date(now); day.setDate(day.getDate() + i); return { day, count: scheduled.filter(({ card }) => i === 0 ? new Date(card.dueAt) <= now || localDay(new Date(card.dueAt)) === localDay(day) : localDay(new Date(card.dueAt)) === localDay(day)).length }; });
  $('#main').innerHTML = `${sectionHeading('A LITTLE, OFTEN', 'Give your memory some space.', 'A small return visit today makes the next one a little easier.')}<section class="schedule-week"><div class="section-header"><h2>The next seven days</h2><span class="pill">${due.length} due now</span></div><div class="week-grid">${days.map(({ day, count }, i) => `<div class="week-day ${i === 0 ? 'today' : ''}"><span>${i === 0 ? 'Today' : dateLabel(day, { weekday: 'short' })}</span><strong>${day.getDate()}</strong><span class="day-count">${count} ${count === 1 ? 'card' : 'cards'}</span></div>`).join('')}</div></section><section class="schedule-due"><div class="section-header"><h2>Ready for another look</h2><span class="muted">${due.length} cards</span></div>${due.length ? [...new Set(due.map(({ deck }) => deck.id))].map(id => deckRow(workspace.decks.find(d => d.id === id), { schedule: true })).join('') : `<div class="empty-state compact">${icon('calendar')}<h3>${scheduled.length ? 'You’re all caught up.' : 'A habit starts with one session.'}</h3><p>${scheduled.length ? 'Your next review is ' + dateLabel(scheduled[0].card.dueAt, { weekday: 'long', month: 'short', day: 'numeric' }) + '. Come back when your cards are due.' : 'Practice a study set to build your personal review schedule.'}</p><button class="button secondary" data-action="${scheduled.length ? 'library' : 'sample'}">${scheduled.length ? 'Visit your library' : 'Try your first session'}${icon('arrow-right')}</button></div>`}</section><details class="schedule-details"><summary>How your review schedule works</summary><p>Every card starts in Leitner box 1. Mark a recall as “Got it” to move up one box; “Needs practice” moves it down one. Boxes 1–5 use intervals of ${INTERVALS.join(', ')} days. Reviews become due at the time you practiced, using your device’s clock. The calendar also shows cards due later today.</p><p>These intervals come from the <a href="${MAIN_SOURCE}" target="_blank" rel="noopener noreferrer">USAHS article</a> as a practical example. They are not a personalized memory forecast. There are no background notifications.</p>${scheduled.length ? `<div class="upcoming-list">${scheduled.map(({ deck, card }) => `<div><span>${esc(card.question)}</span><small>${esc(deck.title)} · Box ${card.box} · ${dateLabel(card.dueAt)}</small></div>`).join('')}</div>` : ''}</details>`;
}
function renderResources(query = '') {
  setPage('resources', 'Techniques & sources');
  const matches = SOURCES.map((source, index) => ({ source, index })).filter(({ source }) => source.join(' ').toLowerCase().includes(query.toLowerCase()));
  $('#main').innerHTML = `${sectionHeading('ROOTED IN RESEARCH', 'Good habits. Thoughtful foundations.', 'Explore the techniques behind Recall and the resources that inspired this space.')}<a class="primary-source" href="${MAIN_SOURCE}" target="_blank" rel="noopener noreferrer"><span class="source-mark">U</span><div><span class="eyebrow">OUR STARTING POINT · JANUARY 14, 2025</span><h2>10 Study Methods & Tips That Actually Work</h2><p>University of St. Augustine for Health Sciences</p></div>${icon('arrow-up-right')}</a><div class="resource-intro"><p>Recall puts retrieval practice, Feynman explanations, and spaced review into action. The guide below covers all ten techniques from the article, and the reading list preserves all 16 of its numbered references.</p><p>AI-generated questions and feedback should be checked against your notes. Self-ratings reflect your own assessment, not a measured mastery score.</p></div><section><div class="section-header"><h2>Ten ways to approach learning</h2><span class="muted">From the USAHS guide</span></div><div class="technique-guide">${TECHNIQUES.map(([name, description, source], i) => `<details><summary><span class="guide-number">${String(i + 1).padStart(2, '0')}</span>${esc(name)}<span class="details-plus">+</span></summary><div><p>${esc(description)}</p><a href="${SOURCES[source][2]}" target="_blank" rel="noopener noreferrer">Read the linked resource ↗</a></div></details>`).join('')}</div></section><section class="source-section"><div class="section-header"><h2>Keep exploring</h2><span class="muted">All 16 article references</span></div><div class="search-input resource-search">${icon('search')}<input id="source-search" type="search" placeholder="Find a topic or resource…" aria-label="Search sources" value="${esc(query)}"></div><div class="sources-list">${matches.length ? matches.map(({ source: [title, author, url, topic], index }) => `<a href="${url}" target="_blank" rel="noopener noreferrer"><span class="source-number">${String(index + 1).padStart(2, '0')}</span><div><strong>${esc(title)}</strong><small>${esc(author)}<span class="dot-separator">·</span>${esc(topic)}</small></div>${icon('arrow-up-right')}</a>`).join('') : '<p class="muted">No matching resources. Try “memory”, “sleep”, or “retrieval”.</p>'}</div></section>`;
  $('.resource-intro').insertAdjacentHTML('beforeend', '<p>Also linked in the article: <a href="https://www.usa.edu/blog/time-management-techniques/" target="_blank" rel="noopener noreferrer">time management</a>, <a href="https://www.usa.edu/blog/how-laughter-can-relieve-stress/" target="_blank" rel="noopener noreferrer">managing stress</a>, and <a href="https://www.usa.edu/blog/how-to-overcome-test-anxiety/" target="_blank" rel="noopener noreferrer">test anxiety</a>.</p>');
}
function renderPage() {
  session = null;
  feedbackController?.abort();
  const page = location.hash.slice(1);
  if (page === 'library') renderLibrary(); else if (page === 'schedule') renderSchedule(); else if (page === 'resources') renderResources(); else renderHome();
  updateCounts();
}
function navigate(page) { if (location.hash === `#${page}`) renderPage(); else location.hash = page; }
function openSettings() {
  $('#settings-form').elements.provider.value = connection.provider;
  $('#api-key').value = connection.apiKey;
  $('#api-key').type = 'password';
  $('#toggle-key').setAttribute('aria-label', 'Show API key');
  $('#model-id').value = connection.model;
  $('#settings-error').textContent = '';
  $('#disconnect').hidden = !connection.apiKey;
  updateProviderLink();
  $('#settings-dialog').showModal();
}
function updateProviderLink() {
  const provider = $('#settings-form').elements.provider.value;
  $('#key-link').href = provider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://aistudio.google.com/apikey';
  $('#key-link').textContent = `${providerNames[provider]} ↗`;
}
function updateConnection() {
  $('#connection-label').textContent = connection.apiKey ? `${providerNames[connection.provider]} key added` : 'Connect your AI';
  $('#connection-detail').textContent = connection.apiKey ? 'Available in this tab' : 'OpenAI or Gemini';
  $('.connection-dot').classList.toggle('connected', Boolean(connection.apiKey));
  $('#session-connect').hidden = Boolean(connection.apiKey);
  $('#session-provider-hint').textContent = connection.apiKey ? `Questions will be created with ${providerNames[connection.provider]}. Your notes will be shared with this provider.` : 'Connect your AI to create questions, or try the sample notes below. Feynman sessions also work without AI.';
}
function openNew(method = 'retrieval') {
  $('#session-form').reset();
  $('#session-method').value = Object.hasOwn(METHODS, method) ? method : 'retrieval';
  $('#session-error').textContent = '';
  $('#character-count').textContent = '0 / 30,000';
  $('#session-provider-hint').textContent = connection.apiKey ? `Questions will be created with ${providerNames[connection.provider]}. Your notes will be shared with this provider.` : 'Connect your AI to create questions, or try the sample notes below. Feynman sessions also work without AI.';
  $('#session-dialog').showModal();
}
function saveDeck(deck) { workspace.decks.push(deck); persist(); }
function startSample(method) {
  $('#session-dialog').close();
  let deck = workspace.decks.find(d => d.sample);
  if (!deck) { deck = sampleDeck(); saveDeck(deck); }
  startStudy(deck, method || 'retrieval');
}
function startStudy(deck, method = deck.method, onlyDue = false) {
  const cards = onlyDue ? deck.cards.filter(c => c.dueAt && new Date(c.dueAt) <= new Date()) : deck.cards;
  if (!cards.length) { toast('No cards are due in this set yet.'); return; }
  session = { deck, method, cards, index: 0, correct: 0, revealed: false, answer: '', startedAt: Date.now(), phase: 'read', explanation: deck.lastExplanation || '', feedback: null };
  setPage('library', METHODS[method].title);
  renderStudy();
  window.scrollTo({ top: 0 });
  $('#main').focus();
}
function studyHeader() { return `<div class="study-back"><button class="text-button" data-action="library">${icon('arrow-left')}Back to library</button><span class="pill ${METHODS[session.method].color}">${icon(METHODS[session.method].icon)}${METHODS[session.method].title}</span></div><div class="study-heading"><span class="eyebrow">${session.deck.sample ? 'SAMPLE STUDY SET' : 'YOUR STUDY SET'}</span><h1>${esc(session.deck.title)}</h1></div>`; }
function renderStudy() {
  if (session.method === 'feynman') { renderFeynman(); return; }
  const card = session.cards[session.index];
  const percent = (session.index / session.cards.length) * 100;
  $('#main').innerHTML = `${studyHeader()}<div class="study-progress"><span>Question ${session.index + 1} of ${session.cards.length}</span><span>${Math.round(percent)}% complete</span><progress value="${session.index}" max="${session.cards.length}" aria-label="Session progress"></progress></div><section class="practice-card"><span class="eyebrow">FIRST, BRING IT TO MIND</span><h2>${esc(card.question)}</h2><p class="muted">Give it a try before you look. A little effort is part of the practice.</p><label for="recall-answer">Your answer</label><textarea id="recall-answer" rows="4" placeholder="What can you remember?" maxlength="10000" ${session.revealed ? 'readonly' : ''}>${esc(session.answer)}</textarea>${session.revealed ? `<div class="reference-answer"><span class="eyebrow">COMPARE WITH THE REFERENCE</span><p>${esc(card.answer)}</p></div><div class="rating-section"><p>How did your recall compare?</p><div class="rating-buttons"><button class="button secondary" data-action="rate" data-correct="false">${icon('cards')}Needs practice</button><button class="button primary sage-button" data-action="rate" data-correct="true">${icon('check')}Got it</button></div><small>Your self-rating sets this card’s next review.</small></div>` : `<div class="practice-actions"><button class="text-button" data-action="reveal">I couldn’t recall it</button><button class="button primary" data-action="check-answer">Compare answer${icon('arrow-right')}</button></div><p id="recall-error" class="form-error" role="alert"></p>`}</section><p class="study-footnote">${icon('lock')}Your written answer stays on this device. Compare it with the reference and rate your own recall.</p>`;
  if (session.revealed) $('.rating-section').scrollIntoView({ block: 'nearest' });
}
function renderFeynman() {
  const s = session;
  $('#main').innerHTML = `${studyHeader()}<ol class="step-list"><li class="${s.phase === 'read' ? 'current' : 'done'}"><span>1</span>Understand</li><li class="${s.phase === 'explain' ? 'current' : s.phase === 'reflect' ? 'done' : ''}"><span>2</span>Explain</li><li class="${s.phase === 'reflect' ? 'current' : ''}"><span>3</span>Refine</li></ol><section class="practice-card">${s.phase === 'read' ? `<span class="eyebrow">GET TO KNOW THE IDEA</span><h2>Take a moment with your notes.</h2><p class="muted">Read with one question in mind: how would I explain this to someone new?</p><div class="source-notes">${esc(s.deck.notes)}</div><div class="practice-actions"><span class="muted">The notes will be hidden for the next step.</span><button class="button primary" data-action="explain">I’m ready to explain${icon('arrow-right')}</button></div>` : `<span class="eyebrow">${s.phase === 'reflect' ? 'FIND THE GAPS. MAKE IT CLEARER.' : 'TEACH IT IN YOUR OWN WORDS'}</span><h2>Imagine you’re explaining it to a friend.</h2><p class="muted">Use everyday words, an example, or an analogy. Notice where you get stuck.</p><form id="explanation-form"><label for="explanation">Your explanation</label><textarea id="explanation" rows="8" minlength="30" maxlength="10000" placeholder="Here’s how I’d explain it…" required>${esc(s.explanation)}</textarea><p id="feedback-error" class="form-error" role="alert"></p><div class="practice-actions"><button type="button" class="text-button" data-action="compare-notes">Compare with notes</button><button type="submit" class="button primary" id="feedback-button">Get AI feedback${icon('sparkles')}</button></div></form>${s.phase === 'reflect' ? `<div class="feedback-area">${s.feedback ? `<span class="eyebrow">AI COACHING · CHECK AGAINST YOUR NOTES</span><h3>What’s working</h3><ul>${s.feedback.strengths.map(v => `<li>${esc(v)}</li>`).join('')}</ul><h3>Room to refine</h3>${s.feedback.gaps.length ? `<ul>${s.feedback.gaps.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : '<p>No specific gaps were flagged. Check your explanation against the original material.</p>'}<h3>A simpler way to put it</h3><p>${esc(s.feedback.simplerExplanation)}</p>` : '<h3>Look for what you missed.</h3><p>Compare your explanation with the original. Correct any gaps, replace jargon, and refine your explanation above.</p>'}<details open><summary>Your original notes</summary><div class="source-notes">${esc(s.deck.notes)}</div></details><div class="reflection-check"><input type="checkbox" id="reflection-done"><label for="reflection-done">I compared my explanation, corrected gaps, and simplified it.</label></div><button class="button primary" data-action="finish-feynman">Save my reflection${icon('check')}</button><p id="reflection-error" class="form-error" role="alert"></p></div>` : ''}`}</section>`;
}
function finishSession() {
  const s = session;
  workspace.history.push({ deckId: s.deck.id, method: s.method, finishedAt: new Date().toISOString(), cards: s.method === 'feynman' ? 0 : s.cards.length, correct: s.correct, seconds: Math.round((Date.now() - s.startedAt) / 1000) });
  persist();
  const next = s.deck.cards.filter(c => c.dueAt).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0];
  $('#main').innerHTML = `<section class="completion"><span class="completion-mark">${icon('check')}</span><span class="eyebrow">A SMALL STEP THAT STICKS</span><h1>You showed up.<br><em>That’s how it grows.</em></h1><p>${s.method === 'feynman' ? 'You explained an idea, checked the gaps, and made it a little clearer.' : `You practiced ${s.cards.length} questions and gave your memory something to build on.`}</p>${s.method !== 'feynman' ? `<div class="completion-stats"><div><strong>${s.correct} / ${s.cards.length}</strong><span>Self-rated “Got it”</span></div><div><strong>${next ? dateLabel(next.dueAt) : '—'}</strong><span>Next scheduled review</span></div></div>` : ''}<div class="completion-actions"><button class="button primary" data-action="${s.method === 'feynman' ? 'library' : 'schedule'}">${s.method === 'feynman' ? 'Back to your library' : 'See your review schedule'}${icon('arrow-right')}</button><button class="text-button" data-action="home">Return to your study space</button></div></section>`;
  $('#main').focus();
}
async function callAI(endpoint, payload, signal) {
  const response = await fetch(endpoint, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...connection, ...payload }) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The study service could not be reached. Please try again.'); }
  if (!response.ok) throw new Error(data.error || 'Unable to complete this request. Please try again.');
  return data;
}
document.addEventListener('click', event => {
  const navigation = event.target.closest('a[data-nav], a.brand');
  if (navigation) { event.preventDefault(); navigate(navigation.dataset.nav || 'home'); window.scrollTo({ top: 0 }); $('#main').focus(); return; }
  const close = event.target.closest('[data-close]');
  if (close) { $('#' + close.dataset.close).close(); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id, method } = button.dataset;
  if (action === 'settings') openSettings();
  else if (action === 'new') openNew(method);
  else if (action === 'sample') startSample($('#session-dialog').open ? $('#session-method').value : undefined);
  else if (['home', 'library', 'schedule'].includes(action)) { navigate(action); window.scrollTo({ top: 0 }); }
  else if (action === 'study' || action === 'review') { const deck = workspace.decks.find(d => d.id === id); if (deck) startStudy(deck, action === 'review' ? 'spaced' : deck.method, action === 'review'); }
  else if ((action === 'reveal' || action === 'check-answer') && session) {
    session.answer = $('#recall-answer').value.trim();
    if (action === 'check-answer' && session.answer.length < 3) { $('#recall-error').textContent = 'Try writing a short answer, or choose “I couldn’t recall it”.'; $('#recall-answer').focus(); return; }
    session.revealed = true; renderStudy();
  } else if (action === 'rate' && session?.revealed) {
    const card = session.cards[session.index];
    const correct = button.dataset.correct === 'true';
    const index = session.deck.cards.findIndex(c => c.id === card.id);
    session.deck.cards[index] = scheduleCard(card, correct);
    session.correct += Number(correct);
    session.index++; session.answer = ''; session.revealed = false;
    persist();
    if (session.index >= session.cards.length) finishSession(); else { renderStudy(); $('#recall-answer').focus(); }
  } else if (action === 'explain' && session) { session.phase = 'explain'; renderFeynman(); $('#explanation').focus(); }
  else if (action === 'compare-notes' && session) { feedbackController?.abort(); feedbackController = null; session.explanation = $('#explanation').value; session.phase = 'reflect'; renderFeynman(); }
  else if (action === 'finish-feynman' && session) {
    const explanation = $('#explanation').value.trim();
    if (!$('#reflection-done').checked || explanation.length < 30) { $('#reflection-error').textContent = 'Write at least 30 characters and check the reflection box before saving.'; return; }
    session.deck.lastExplanation = explanation; finishSession();
  } else if (action === 'delete') { deleteId = id; $('#confirm-dialog').showModal(); }
  else if (action === 'export') {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `recall-study-sets-${localDay()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Your study sets and progress have been exported.');
  }
});
$('#confirm-delete').addEventListener('click', () => { workspace.decks = workspace.decks.filter(d => d.id !== deleteId); persist(); $('#confirm-dialog').close(); renderLibrary(); toast('Study set removed from this device.'); });
$('#settings-form').addEventListener('change', event => { if (event.target.name === 'provider') { $('#model-id').value = modelDefaults[event.target.value]; updateProviderLink(); } });
$('#toggle-key').addEventListener('click', () => { const visible = $('#api-key').type === 'password'; $('#api-key').type = visible ? 'text' : 'password'; $('#toggle-key').setAttribute('aria-label', visible ? 'Hide API key' : 'Show API key'); });
$('#settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const apiKey = form.get('apiKey').trim();
  if (!apiKey || /\s/.test(apiKey)) { $('#settings-error').textContent = 'Add an API key without spaces or line breaks.'; return; }
  connection = { provider: form.get('provider'), apiKey, model: form.get('model').trim() };
  updateConnection(); $('#settings-dialog').close();
  toast(`${providerNames[connection.provider]} key added for this tab. It will be checked on your first AI request.`);
});
$('#disconnect').addEventListener('click', () => { connection.apiKey = ''; $('#api-key').value = ''; updateConnection(); $('#settings-dialog').close(); toast('AI disconnected. Your study sets are still here.'); });
$('#settings-dialog').addEventListener('close', () => { $('#api-key').value = ''; });
$('#session-dialog').addEventListener('close', () => { requestController?.abort(); });
$('#study-notes').addEventListener('input', event => { $('#character-count').textContent = `${event.target.value.length.toLocaleString()} / 30,000`; });
$('#notes-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!/\.(txt|md)$/i.test(file.name) || file.size > 120000) { $('#session-error').textContent = 'Choose a .txt or .md file under 120 KB.'; event.target.value = ''; return; }
  try { const text = await file.text(); if (text.length > 30000) throw new Error(); $('#study-notes').value = text; $('#study-notes').dispatchEvent(new Event('input')); $('#session-error').textContent = ''; }
  catch { $('#session-error').textContent = 'The file could not be imported. Use a text file with fewer than 30,000 characters.'; }
  event.target.value = '';
});
$('#session-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (requestController) return;
  const method = $('#session-method').value;
  const notes = $('#study-notes').value.trim();
  const topic = $('#session-topic').value.trim();
  $('#session-error').textContent = '';
  if (notes.length < 80) { $('#session-error').textContent = 'Add at least 80 characters of study notes.'; return; }
  if (!connection.apiKey && method !== 'feynman') { $('#session-error').textContent = 'Use “Connect your AI” above to add OpenAI or Gemini. Your notes will stay here while you do.'; return; }
  const button = $('#generate-button');
  button.disabled = true; button.innerHTML = `${icon('sparkles')}Preparing your session…`;
  requestController = new AbortController();
  const controller = requestController;
  try {
    // A Feynman session needs the learner’s own explanation, so no generation is required.
    const generated = method === 'feynman' ? { title: topic || 'An idea worth explaining', summary: 'Read, explain, and refine your understanding.', cards: [{ question: 'How would you explain the main idea in these notes?', answer: notes }] } : await callAI('/api/generate', { notes }, controller.signal);
    if (controller.signal.aborted) return;
    const deck = { ...generated, id: crypto.randomUUID(), title: topic || generated.title, notes, method, createdAt: new Date().toISOString(), cards: generated.cards.map(card => ({ ...card, id: crypto.randomUUID(), box: 1, dueAt: null, reviews: 0 })) };
    saveDeck(deck); requestController = null; $('#session-dialog').close(); startStudy(deck);
  } catch (error) { if (error.name !== 'AbortError') $('#session-error').textContent = error.message; }
  finally { if (requestController === controller) requestController = null; button.disabled = false; button.innerHTML = `Create study session${icon('sparkles')}`; }
});
document.addEventListener('submit', async event => {
  if (event.target.id !== 'explanation-form') return;
  event.preventDefault();
  if (!session || feedbackController) return;
  session.explanation = $('#explanation').value.trim();
  if (!connection.apiKey) { $('#feedback-error').textContent = 'Connect your AI in the sidebar for coaching, or choose “Compare with notes” to reflect yourself.'; return; }
  const current = session;
  const controller = new AbortController(); feedbackController = controller;
  const button = $('#feedback-button'); button.disabled = true; button.textContent = 'Reading your explanation…';
  try { const feedback = await callAI('/api/feedback', { notes: current.deck.notes, explanation: current.explanation }, controller.signal); if (session !== current || controller.signal.aborted) return; current.feedback = feedback; current.phase = 'reflect'; renderFeynman(); }
  catch (error) { if (session === current && error.name !== 'AbortError') $('#feedback-error').textContent = error.message; }
  finally { if (feedbackController === controller) feedbackController = null; if (button.isConnected) { button.disabled = false; button.innerHTML = `Get AI feedback${icon('sparkles')}`; } }
});
document.addEventListener('input', event => {
  if (!['library-search', 'source-search'].includes(event.target.id)) return;
  const { id, value, selectionStart } = event.target;
  if (id === 'library-search') renderLibrary(value); else renderResources(value);
  const input = $('#' + id); input.focus(); if (input.type !== 'search') input.setSelectionRange(selectionStart, selectionStart);
});
window.addEventListener('hashchange', () => { renderPage(); $('#main').focus(); window.scrollTo({ top: 0 }); });
$('#today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
hydrateIcons(); updateConnection(); renderPage();
