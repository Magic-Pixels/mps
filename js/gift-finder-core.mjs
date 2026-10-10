// Pure functions shared by the page and its tests. No location service or API key.
const EUROPE = new Set('AL AD AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM TR UA VA XK'.split(' '));
const TIMEZONES = {
  'Europe/Rome':'IT','Europe/Vatican':'VA','Europe/San_Marino':'SM',
  'Europe/London':'GB','Europe/Belfast':'GB','Europe/Jersey':'JE','Europe/Guernsey':'GG','Europe/Isle_of_Man':'IM',
  'Europe/Berlin':'DE','Europe/Busingen':'DE','Europe/Paris':'FR','Europe/Monaco':'MC',
  'Europe/Madrid':'ES','Atlantic/Canary':'ES','Africa/Ceuta':'ES','Europe/Amsterdam':'NL',
  'Europe/Brussels':'BE','Europe/Vienna':'AT','Europe/Zurich':'CH','Europe/Vaduz':'LI',
  'Europe/Dublin':'IE','Europe/Lisbon':'PT','Atlantic/Madeira':'PT','Atlantic/Azores':'PT',
  'Europe/Warsaw':'PL','Europe/Stockholm':'SE','Europe/Oslo':'NO','Europe/Copenhagen':'DK',
  'Europe/Helsinki':'FI','Europe/Mariehamn':'AX','Europe/Prague':'CZ','Europe/Bratislava':'SK',
  'Europe/Budapest':'HU','Europe/Bucharest':'RO','Europe/Sofia':'BG','Europe/Athens':'GR',
  'Europe/Tallinn':'EE','Europe/Riga':'LV','Europe/Vilnius':'LT','Europe/Ljubljana':'SI',
  'Europe/Zagreb':'HR','Europe/Belgrade':'RS','Europe/Sarajevo':'BA','Europe/Skopje':'MK',
  'Europe/Podgorica':'ME','Europe/Tirane':'AL','Europe/Malta':'MT','Europe/Andorra':'AD',
  'Europe/Gibraltar':'GI','Europe/Kyiv':'UA','Europe/Kiev':'UA','Europe/Chisinau':'MD',
  'Europe/Minsk':'BY','Europe/Moscow':'RU','Europe/Kaliningrad':'RU',
  'Europe/Istanbul':'TR','Asia/Istanbul':'TR','Asia/Nicosia':'CY','Europe/Nicosia':'CY',
  'Atlantic/Reykjavik':'IS','Atlantic/Faroe':'FO','Atlantic/Faeroe':'FO',
  'America/New_York':'US','America/Chicago':'US','America/Denver':'US','America/Los_Angeles':'US',
  'America/Phoenix':'US','America/Anchorage':'US','America/Adak':'US','Pacific/Honolulu':'US',
  'America/Detroit':'US','America/Boise':'US','America/Juneau':'US','America/Nome':'US',
  'America/Sitka':'US','America/Metlakatla':'US','America/Yakutat':'US',
  'US/Eastern':'US','US/Central':'US','US/Mountain':'US','US/Pacific':'US','US/Alaska':'US','US/Hawaii':'US'
};
const AMAZON = {US:'amazon.com',GB:'amazon.co.uk',DE:'amazon.de',FR:'amazon.fr',IT:'amazon.it',ES:'amazon.es',NL:'amazon.nl',BE:'amazon.com.be',IE:'amazon.ie',PL:'amazon.pl',SE:'amazon.se'};
// Storefront rotation IDs from eBay's Creating an EPN Tracking Link documentation.
const EBAY = {
  US:['ebay.com','711-53200-19255-0'], GB:['ebay.co.uk','710-53481-19255-0'],
  DE:['ebay.de','707-53477-19255-0'], FR:['ebay.fr','709-53476-19255-0'],
  IT:['ebay.it','724-53478-19255-0'], ES:['ebay.es','1185-53479-19255-0'],
  AT:['ebay.at','5221-53469-19255-0'], BE:['ebay.be','1553-53471-19255-0'],
  CH:['ebay.ch','5222-53480-19255-0'], IE:['ebay.ie','5282-53468-19255-0'],
  NL:['ebay.nl','1346-53482-19255-0'], PL:['ebay.pl','4908-226936-19255-0']
};

export function inferMarket(timeZone = '', languages = []) {
  let country = TIMEZONES[timeZone];
  if (/^America\/(Indiana|Kentucky|North_Dakota)\//.test(timeZone)) country = 'US';
  // A known non-target timezone must not become US just because English is installed.
  const genericZone = !timeZone || /^(UTC|GMT|Etc\/)/.test(timeZone);
  if (!country && (genericZone || timeZone.startsWith('Europe/'))) {
    for (const language of languages) {
      try {
        const region = new Intl.Locale(language).region;
        if ((genericZone && region === 'US') || EUROPE.has(region)) { country = region; break; }
      } catch { /* Invalid browser locale: continue to the next one. */ }
    }
  }
  const region = country === 'US' ? 'US' : EUROPE.has(country) || timeZone.startsWith('Europe/') ? 'Europe' : 'unknown';
  return {region, country: country || '', currency: country === 'US' ? 'USD' : country === 'GB' ? 'GBP' : region === 'Europe' ? 'EUR' : null};
}

export function sanitizeState(input, catalog) {
  return {
    person: catalog.recipients.some(x => x.id === input.person) ? input.person : '',
    interest: catalog.interests.some(x => x.id === input.interest) ? input.interest : '',
    budget: [...catalog.budgets.map(String), 'any'].includes(String(input.budget)) ? String(input.budget) : '',
    savedOnly: input.savedOnly === true
  };
}

export function parseState(hash, catalog) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state = sanitizeState(Object.fromEntries(params), catalog);
  const validIDs = new Set(catalog.items.map(x => x.id));
  const shortlist = [...new Set((params.get('list') || '').split(','))].filter(id => validIDs.has(id)).slice(0,30);
  return {state, shortlist};
}

export function stateHash(state, shortlist = []) {
  const params = new URLSearchParams();
  for (const key of ['person','interest','budget']) if (state[key]) params.set(key,state[key]);
  if (shortlist.length) params.set('list',shortlist.join(','));
  return params.size ? `#${params}` : '';
}

export function selectIdeas(catalog, state, saved = [], shortlist = []) {
  const limit = state.budget && state.budget !== 'any' ? Number(state.budget) : Infinity;
  const matches = catalog.items.filter(item =>
    (!state.person || state.person === 'anyone' || item.recipients.includes(state.person)) &&
    (!state.interest || state.interest === 'any' || item.interest === state.interest) &&
    item.budget <= limit && (!state.savedOnly || saved.includes(item.id)) &&
    (!shortlist.length || shortlist.includes(item.id))
  );
  // Interleave interests so the first screen isn't dominated by one kind of gift.
  const groups = new Map();
  for (const item of matches) { if(!groups.has(item.interest)) groups.set(item.interest,[]); groups.get(item.interest).push(item); }
  const ordered = [];
  while ([...groups.values()].some(group => group.length)) for (const group of groups.values()) if (group.length) ordered.push(group.shift());
  return ordered;
}

function safeURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export function merchantLink(item, market, affiliates = {}, budget = '') {
  // Exact, approved product links are country-specific; never assume EU-wide shipping.
  const product = affiliates.productLinks?.[item.id]?.[market.country];
  if (product && safeURL(product.url) && typeof product.merchant === 'string' && product.merchant.trim()) {
    return {url:safeURL(product.url),label:`View at ${product.merchant}`,affiliate:product.affiliate === true,kind:'product'};
  }
  if (item.merchant === 'ebay') {
    const country = EBAY[market.country] ? market.country : market.region === 'Europe' ? 'IE' : 'US';
    const [domain, rotation] = EBAY[country];
    const url = new URL(`https://www.${domain}/sch/i.html`);
    url.searchParams.set('_nkw',item.query);
    url.searchParams.set('LH_BIN','1');
    // Do not send EUR budget limits to marketplaces displaying CHF or PLN.
    if (budget && budget !== 'any' && Number(budget) > 0 && !['CH','PL'].includes(country) && market.currency) url.searchParams.set('_udhi',String(Number(budget)));
    const campaign = String(affiliates.ebayCampaign || '');
    if (/^\d{10}$/.test(campaign)) {
      for (const [key,value] of Object.entries({mkevt:'1',mkcid:'1',mkrid:rotation,campid:campaign,toolid:'10001',customid:`gift_${item.id}_${country}`})) url.searchParams.set(key,value);
    }
    return {url:url.href,label:`Explore on eBay ${country}`,affiliate:url.searchParams.has('campid'),kind:'search'};
  }
  if (item.merchant === 'amazon' && AMAZON[market.country]) {
    const url = new URL(`https://www.${AMAZON[market.country]}/s`);
    url.searchParams.set('k', item.query);
    const tag = affiliates.amazonTags?.[market.country];
    if (typeof tag === 'string' && /^[a-zA-Z0-9_-]+$/.test(tag)) url.searchParams.set('tag',tag);
    return {url:url.href,label:`Explore on Amazon${market.country === 'US' ? '' : ` ${market.country}`}`,affiliate:url.searchParams.has('tag'),kind:'search'};
  }
  const approved = affiliates.etsySearchLinks?.[item.id]?.[market.country];
  if (safeURL(approved)) return {url:safeURL(approved),label:'Explore on Etsy',affiliate:true,kind:'search'};
  const url = new URL('https://www.etsy.com/search');
  url.searchParams.set('q',item.query);
  return {url:url.href,label:'Explore on Etsy',affiliate:false,kind:'search'};
}

export function formatBudget(value, market) {
  return new Intl.NumberFormat('en', {style:'currency',currency:market.currency || 'USD',maximumFractionDigits:0}).format(value);
}
