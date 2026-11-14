import {inferMarket, parseState, stateHash, sanitizeState, selectIdeas, merchantLink, formatBudget} from './gift-finder-core.mjs';

const root = document.querySelector('[data-gift-finder]');
if (root) initialize();

function initialize() {
  const $ = selector => root.querySelector(selector);
  let catalog, affiliates;
  try {
    catalog = JSON.parse($('#gift-catalog').textContent);
    affiliates = JSON.parse($('#gift-affiliates').textContent);
    if (!Array.isArray(catalog.items)) return;
  } catch { return; } // The complete, server-rendered list remains usable.

  const storageKey = 'magic-pixels-gift-saves-v1';
  let market;
  try { market = inferMarket(Intl.DateTimeFormat().resolvedOptions().timeZone,navigator.languages || [navigator.language]); }
  catch { market = inferMarket(); }
  // Recompute on arrival (travel/browser setting changes), remember for this visit only.
  try { sessionStorage.setItem('magic-pixels-gift-market-v1',JSON.stringify(market)); } catch { /* Storage may be blocked. */ }
  let {state,shortlist} = parseState(location.hash,catalog);
  let saved = [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) saved = [...new Set(stored)].filter(id => catalog.items.some(item => item.id === id)).slice(0,30);
  } catch { /* Saving still works in memory for this visit. */ }
  let visibleLimit = 6;
  let completionTracked = false;
  const cards = new Map();

  function track(event, details = {}) {
    // Honor the existing site's analytics consent integration.
    try { if (typeof window.gtag === 'function') window.gtag('event',event,{gift_region:market.region,...details}); } catch { /* Analytics must not block shopping. */ }
  }
  function feedback(message) { $('#gift-feedback').textContent = message; }
  function writeURL() {
    try { history.replaceState(null,'',location.pathname + location.search + stateHash(state,shortlist)); } catch { /* Sandboxed embeds may deny history writes. */ }
  }
  function persistSaved() {
    try { localStorage.setItem(storageKey,JSON.stringify(saved)); return true; } catch { return false; }
  }
  function setBudgetCopy() {
    const currency = market.currency || 'USD';
    $('#gift-budget-note').textContent = `Budget bands are planning guidance in ${currency}, not live prices or currency conversions. Links explore retailer options; confirm the price, shipping and delivery date with the seller.${market.region === 'unknown' ? ' Your location could not be estimated.' : ''}`;
    root.querySelectorAll('[data-filter="budget"] [data-value]').forEach(button => {
      if (button.dataset.value !== 'any') button.textContent = `Up to ${formatBudget(Number(button.dataset.value),market)}`;
    });
  }

  for (const item of catalog.items) {
    const card = [...root.querySelectorAll('[data-idea]')].find(node => node.dataset.idea === item.id);
    if (!card) continue;
    const save = document.createElement('button');
    save.className = 'gift-save'; save.type = 'button'; save.dataset.save = item.id;
    save.setAttribute('aria-label',`Save ${item.category}`); save.setAttribute('aria-pressed','false'); save.textContent = '♡';
    card.querySelector('.gift-card-art').append(save);
    // Decorative artwork is hidden from AT, but the save action must not be.
    card.querySelector('.gift-card-art').removeAttribute('aria-hidden');
    card.querySelector('svg').setAttribute('aria-hidden','true');
    const link = card.querySelector('.gift-shop-link');
    link.addEventListener('click', () => track(link.dataset.affiliate === 'true' ? 'affiliate_click' : 'gift_merchant_click',{product_id:item.id,product_category:'gift',gift_link_type:link.dataset.linkKind}));
    save.addEventListener('click', () => {
      const wasSaved = saved.includes(item.id);
      saved = wasSaved ? saved.filter(id => id !== item.id) : [...saved,item.id];
      const persisted = persistSaved();
      render();
      if (save.isConnected) save.focus({preventScroll:true}); else $('#gift-saved').focus({preventScroll:true});
      feedback(wasSaved ? 'Removed from your saved ideas.' : persisted ? 'Saved in this browser.' : 'Saved for this visit. Your browser does not allow storage.');
      if (!wasSaved) track('gift_save',{product_id:item.id});
    });
    cards.set(item.id,card);
  }

  function render() {
    const results = selectIdeas(catalog,state,saved,shortlist);
    const visible = results.slice(0,visibleLimit);
    const selections = [state.person,state.interest,state.budget].filter(Boolean).length;
    root.querySelectorAll('[data-filter]').forEach(group => group.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed',String(state[group.dataset.filter] === button.dataset.value))));
    $('#gift-step-count').textContent = `${selections} of 3 choices`;
    $('#gift-results-title').textContent = state.savedOnly ? 'Your saved ideas.' : shortlist.length ? 'A shortlist, shared with you.' : selections === 3 ? 'A little more like them.' : 'Good places to start.';
    const labels = [catalog.recipients.find(x=>x.id===state.person)?.label,catalog.interests.find(x=>x.id===state.interest)?.label,state.budget && state.budget !== 'any' ? `Up to ${formatBudget(Number(state.budget),market)}` : ''].filter(Boolean);
    $('#gift-summary').textContent = selections || state.savedOnly || shortlist.length
      ? `${results.length} ${results.length === 1 ? 'idea' : 'ideas'}${labels.length ? ` · ${labels.join(' · ')}` : ''}`
      : '';
    $('#gift-saved-count').textContent = String(saved.length);
    $('#gift-saved').setAttribute('aria-pressed',String(state.savedOnly));
    $('#gift-share').disabled = results.length === 0;
    $('#gift-shared-clear').hidden = !shortlist.length;
    $('#gift-empty').hidden = results.length > 0;
    $('#gift-empty-message').textContent = state.savedOnly ? 'Save an idea using its heart button. If you have already saved gifts, try clearing the current filters.' : 'Try a different interest or a wider budget. We won’t stretch your choices without asking.';
    $('#gift-more').hidden = visible.length >= results.length;
    $('#gift-more').textContent = `Show ${Math.min(6,results.length-visible.length)} more ideas`;
    const nodes = [];
    let hasAmazon = false;
    for (const item of visible) {
      const card = cards.get(item.id);
      if (!card) continue;
      const button = card.querySelector('[data-save]');
      const isSaved = saved.includes(item.id);
      button.textContent = isSaved ? '♥' : '♡';
      button.setAttribute('aria-pressed',String(isSaved));
      button.setAttribute('aria-label',`${isSaved ? 'Unsave' : 'Save'} ${item.category}`);
      const destination = merchantLink(item,market,affiliates,state.budget);
      const link = card.querySelector('.gift-shop-link');
      link.href = destination.url; link.textContent = `${destination.label} ↗`;
      link.setAttribute('aria-label',`${destination.label}: ${item.category} (opens in a new tab)`);
      link.rel = `noopener${destination.affiliate ? ' sponsored' : ''}`;
      link.dataset.affiliate = String(destination.affiliate); link.dataset.linkKind = destination.kind;
      hasAmazon ||= destination.affiliate && /amazon\./.test(destination.url);
      card.querySelector('.gift-budget').textContent = `Budget guide: up to ${formatBudget(item.budget,market)}`;
      nodes.push(card);
    }
    $('#gift-amazon-disclosure').hidden = !hasAmazon;
    $('#gift-grid').replaceChildren(...nodes);
    if (selections === 3 && !completionTracked) { track('gift_finder_complete',{gift_recipient:state.person,gift_interest:state.interest,gift_budget:state.budget,result_count:results.length}); completionTracked = true; }
  }

  function reset() {
    state = sanitizeState({},catalog); shortlist = []; visibleLimit = 6; completionTracked = false;
    writeURL(); render(); feedback('All gift ideas are ready to explore.');
    $('#gift-reset').focus({preventScroll:true});
  }
  root.querySelectorAll('[data-filter]').forEach(group => group.addEventListener('click',event => {
    const button = event.target.closest('button[data-value]'); if (!button) return;
    state[group.dataset.filter] = button.dataset.value;
    visibleLimit = 6; writeURL(); render(); feedback('');
    track('gift_filter',{gift_filter:group.dataset.filter,gift_value:button.dataset.value});
    if ([state.person,state.interest,state.budget].every(Boolean) && window.matchMedia('(max-width: 1000px)').matches) {
      $('.gift-results').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    }
  }));
  $('#gift-reset').addEventListener('click',reset);
  $('#gift-empty-reset').addEventListener('click',reset);
  $('#gift-shared-clear').addEventListener('click',reset);
  $('#gift-saved').addEventListener('click',()=>{state.savedOnly=!state.savedOnly;visibleLimit=6;render();});
  $('#gift-more').addEventListener('click',()=>{const previous=visibleLimit;visibleLimit+=6;render();const next=$('#gift-grid').children[previous]?.querySelector('[data-save]');next?.focus({preventScroll:true});});

  $('#gift-share').addEventListener('click',async () => {
    const results = selectIdeas(catalog,state,saved,shortlist).slice(0,visibleLimit);
    if (!results.length) return;
    const url = new URL(location.pathname,location.origin);
    url.hash = stateHash(state,results.map(item=>item.id));
    const title = 'A few thoughtful gift ideas · Magic Pixels';
    try {
      if (navigator.share) { await navigator.share({title,text:'Which of these feels most like them?',url:url.href}); feedback('Shortlist shared.'); }
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url.href); feedback('Shortlist link copied.'); }
      else throw new Error('Use manual copy');
      track('gift_share',{item_count:results.length});
    } catch (error) {
      if (error.name === 'AbortError') return;
      $('#gift-share-fallback').hidden = false; $('#gift-share-url').value = url.href;
      $('#gift-share-url').focus(); $('#gift-share-url').select(); feedback('Your link is ready to copy below.');
    }
  });
  $('#gift-share-close').addEventListener('click',()=>{$('#gift-share-fallback').hidden=true;$('#gift-share').focus();});
  window.addEventListener('hashchange',()=>{({state,shortlist}=parseState(location.hash,catalog));visibleLimit=6;render();});
  window.addEventListener('storage',event=>{
    if (event.key !== storageKey) return;
    try { const next=JSON.parse(event.newValue || '[]');if(Array.isArray(next)) saved=[...new Set(next)].filter(id=>cards.has(id)).slice(0,30);render(); } catch { /* Ignore malformed values. */ }
  });
  setBudgetCopy(); render();
  for (const selector of ['#gift-controls','#gift-toolbar','#gift-step-count']) $(selector).hidden=false;
}
