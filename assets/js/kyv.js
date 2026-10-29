/* Know Your Vaccine - shared flow for mobile and desktop.
   Layout differences live in mobile.css / desktop.css; this file owns behaviour only.
   Data: window.KYV = { site: {...}, content: {...} } baked by src/build_site.py from config/.

   Flow: About (for whom + age + gender, one screen) -> Health -> Contact -> Plan.
   Vaccine names are never shown upfront: plan cards and explore cards are face-down
   (a hook line only) and the user taps to reveal each one.

   Every answer and every reveal/click is saved to Google Sheets through the Apps Script
   web app in apps_script/Code.gs: one row per session in "responses" (upserted) and one
   row per action in "events". Health answers go ONLY to the sheet, never to dataLayer/pixels. */
(function () {
  'use strict';
  var K = window.KYV || {}, S = K.site || {}, C = K.content || {};
  var VACCINES = C.vaccines || [], BY_ID = {};
  VACCINES.forEach(function (v) { BY_ID[v.id] = v; });

  /* ---------------- helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function rupees(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function labelOf(list, id) { for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i].label; return ''; }
  function withSrc(url) { return url + (url.indexOf('?') > -1 ? '&' : '?') + 'src=' + encodeURIComponent(S.src || 'knowyourvaccine'); }
  function store(kind, key, val) {
    try {
      var st = kind === 'local' ? window.localStorage : window.sessionStorage;
      if (val !== undefined) { st.setItem(key, val); return val; }
      return st.getItem(key) || '';
    } catch (e) { return val || ''; }
  }
  function uid(prefix) {
    return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  }
  var isDesktop = window.matchMedia && window.matchMedia('(min-width: 820px) and (pointer: fine)').matches;

  var ICONS = {
    lungs: '<path d="M12 4v8"/><path d="M12 12c-1.5 0-3-1-3-3V7"/><path d="M12 12c1.5 0 3-1 3-3V7"/><path d="M9 7C6 7 4 11 4 15c0 2 1 4 3 4s3-1 3-3v-4"/><path d="M15 7c3 0 5 4 5 8 0 2-1 4-3 4s-3-1-3-3v-4"/>',
    ribbon: '<path d="M12 3a4 4 0 0 0-4 4c0 3 4 7 4 7s4-4 4-7a4 4 0 0 0-4-4z"/><path d="M9.5 12 6 21l3-1.5L11 21l1-4"/><path d="M14.5 12 18 21l-3-1.5L13 21l-1-4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    drop: '<path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
    liver: '<path d="M4 9c0-3 3-5 7-5 5 0 9 2 9 6 0 5-5 9-9 10-2 0-3-2-3-4s-4-2-4-7z"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    brain: '<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 2V5a2 2 0 0 0-3-2z"/><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 2"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.shield) + '</svg>';
  }

  /* ---------------- attribution ---------------- */
  function param(n) {
    var m = location.search.match(new RegExp('[?&]' + n + '=([^&]*)'));
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  function cookie(n) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function keep(key, v) { return v ? store('local', key, v) : store('local', key); }
  var ATTR = {
    utm_source: param('utm_source'), utm_medium: param('utm_medium'), utm_campaign: param('utm_campaign'),
    utm_term: param('utm_term'), utm_content: param('utm_content'),
    gclid: keep('kyv_gclid', param('gclid')), wbraid: keep('kyv_wbraid', param('wbraid')), gbraid: keep('kyv_gbraid', param('gbraid'))
  };
  (function () {
    var fbclid = param('fbclid'), fbc = cookie('_fbc');
    if (!fbc && fbclid) fbc = 'fb.1.' + Date.now() + '.' + fbclid;
    ATTR.fbc = keep('kyv_fbc', fbc);
  })();

  /* ---------------- tracking ---------------- */
  window.dataLayer = window.dataLayer || [];
  function dl(event, p) {
    var o = { event: event, page_type: 'know_your_vaccine' };
    if (p) for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
    window.dataLayer.push(o);
  }

  /* ---------------- state ---------------- */
  var state = {
    session_id: store('session', 'kyv_sid') || store('session', 'kyv_sid', uid('S-')),
    lead_id: '', step: 'about', for_whom: '', age: '', gender: '', flags: [],
    name: '', phone: '', consent: true, plan: [], revealed: [], explored: [], booked: [],
    doctor_click: false, family_of: '', started_at: 0, status: 'started'
  };
  var started = false;
  function markStart() {
    if (started) return; started = true; state.started_at = Date.now();
    dl('kyv_start');
  }

  /* ---------------- Google Sheets sync ---------------- */
  function snapshot(event, detail) {
    var must = state.plan.filter(function (r) { return r.tier === 'must'; }).map(function (r) { return r.id; });
    var maybe = state.plan.filter(function (r) { return r.tier === 'maybe'; }).map(function (r) { return r.id; });
    var p = {
      key: S.sheets_key || '', event: event, event_detail: detail || '',
      session_id: state.session_id, lead_id: state.lead_id, family_of: state.family_of, status: state.status,
      for_whom: labelOf(C.for_whom, state.for_whom), age_group: labelOf(C.ages, state.age),
      gender: labelOf(C.genders, state.gender),
      conditions: state.flags.map(function (f) { return labelOf(C.flags, f); }).join(', '),
      name: state.name, phone: state.phone, consent: state.consent ? 'yes' : 'no',
      recommended_must: must.map(function (id) { return BY_ID[id].name; }).join(', '),
      recommended_maybe: maybe.map(function (id) { return BY_ID[id].name; }).join(', '),
      plan_value: must.reduce(function (s, id) { return s + BY_ID[id].price; }, 0),
      revealed: state.revealed.map(function (id) { return BY_ID[id].name; }).join(', '),
      explored: state.explored.map(function (id) { return BY_ID[id].name; }).join(', '),
      book_clicks: state.booked.map(function (id) { return BY_ID[id].name; }).join(', '),
      doctor_click: state.doctor_click ? 'yes' : 'no',
      device: isDesktop ? 'desktop' : 'mweb', page_url: location.href, referrer: document.referrer,
      user_agent: navigator.userAgent, elapsed_ms: state.started_at ? Date.now() - state.started_at : 0,
      honeypot: ($('#kyv-hp') || {}).value || ''
    };
    for (var k in ATTR) if (Object.prototype.hasOwnProperty.call(ATTR, k)) p[k] = ATTR[k] || '';
    p.fbp = cookie('_fbp') || '';
    return p;
  }
  // text/plain keeps the request CORS-simple (no preflight), which Apps Script web apps need.
  function sync(event, detail, opts) {
    if (!S.sheets_webhook_url) { if (window.console) console.info('[kyv] sheet sync skipped (no webhook):', event); return Promise.resolve(null); }
    var body = JSON.stringify(snapshot(event, detail));
    if (opts && opts.beacon && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(S.sheets_webhook_url, new Blob([body], { type: 'text/plain;charset=utf-8' }))) return Promise.resolve(null); } catch (e) {}
    }
    var tries = (opts && opts.retries) || 1;
    function attempt(n) {
      return fetch(S.sheets_webhook_url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, keepalive: true })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d || d.ok !== true) throw new Error('not ok'); return d; })
        .catch(function (e) {
          if (n > 1) return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return attempt(n - 1); });
          throw e;
        });
    }
    return attempt(tries).catch(function () { return null; });
  }

  /* ---------------- rules engine (indicative) ---------------- */
  function flagVisible(f) {
    if (!f.show) return true;
    if (f.show === 'not_baby') return state.age !== 'baby';
    if (f.show === 'female_18_49') return state.gender === 'female' && (state.age === 'young' || state.age === 'adult');
    return true;
  }
  function recommend() {
    var a = state.age, out = [];
    function has(x) { return state.flags.indexOf(x) > -1; }
    function add(id, tier, reason) { if (BY_ID[id]) out.push({ id: id, tier: tier, reason: reason }); }
    var adult = ['young', 'adult', 'mid', 'senior'].indexOf(a) > -1;
    var chronic = has('diabetes') || has('heartlung') || has('immuno');
    var preg = has('pregnant');
    var foodRisk = has('travel') || has('outside_food');

    var fr;
    if (preg) fr = 'Recommended during pregnancy. It protects you and passes protection on to your newborn.';
    else if (chronic) fr = 'Flu can make diabetes, heart and lung conditions worse. A yearly dose lowers that risk.';
    else if (a === 'mid' || a === 'senior') fr = 'After 50, flu is more likely to lead to complications like pneumonia. Take one dose every year.';
    else if (a === 'baby') fr = 'Young children are among the most vulnerable to flu. It can be given from 6 months of age.';
    else if (a === 'kid' || a === 'teen') fr = 'Children catch and spread flu easily at school. A yearly dose keeps them protected.';
    else fr = 'Flu strains change every season, so one dose a year keeps your protection current.';
    add('flu', 'must', fr);

    if (!preg) {
      if (a === 'teen') add('hpv', 'must', 'Best given between 9 and 14 years, with fewer doses and the strongest protection.');
      else if (a === 'young') add('hpv', 'must', 'Catch-up vaccination is recommended up to 26 years if not taken yet.');
      else if (a === 'adult') add('hpv', 'maybe', 'Adults up to 45 may still benefit. Worth discussing with a doctor.');
    }

    if (a === 'baby') add('pneumo', 'must', 'Part of the routine childhood schedule. Protects against pneumonia and meningitis.');
    else if (a === 'mid' || a === 'senior') add('pneumo', 'must', 'Pneumonia risk rises after 50, so this is recommended for your age group.');
    else if (chronic) add('pneumo', 'must', 'Diabetes, heart or lung conditions and weak immunity raise the risk of serious pneumonia.');
    else if (a === 'kid') add('pneumo', 'maybe', 'A catch-up for children under 5 who missed their doses.');

    if (a === 'baby') add('typhoid', 'must', 'Recommended from 6 months of age. Typhoid spreads through contaminated food and water.');
    else if (a === 'kid') add('typhoid', 'must', 'Children eating outside food are at higher risk, and protection lasts for years.');
    else if (a === 'teen') add('typhoid', 'maybe', 'A catch-up dose if not vaccinated as a child.');
    else if (foodRisk) add('typhoid', 'maybe', 'Worth taking if you travel or eat outside food often.');

    if (a === 'baby') add('hepa', 'must', 'Recommended from 12 months of age to protect against this liver infection.');
    else if (a === 'kid') add('hepa', 'must', 'Protects against a liver infection spread through food and water. A catch-up if missed.');
    else if (a === 'teen') add('hepa', 'maybe', 'A catch-up dose if not vaccinated in childhood.');
    else if (foodRisk) add('hepa', 'maybe', 'Recommended for travellers and anyone who eats outside food often.');

    if (!preg) {
      if (a === 'mid' || a === 'senior') add('shingles', 'must', 'Shingles risk rises sharply after 50 and it can leave long-lasting nerve pain.');
      else if (adult && has('immuno')) add('shingles', 'maybe', 'Adults 18+ with weak immunity are at higher risk of shingles.');
    }

    if (has('travel')) add('mening', 'maybe', 'Required for Hajj/Umrah and advised for hostel stays and some international travel.');
    else if (a === 'teen') add('mening', 'maybe', 'Advised for teens heading to hostels or college.');
    else if (has('immuno') && a !== 'baby') add('mening', 'maybe', 'People with weak immunity may need extra protection. Ask a doctor.');

    out.sort(function (x, y) { return (x.tier === 'must' ? 0 : 1) - (y.tier === 'must' ? 0 : 1); });
    return out;
  }

  /* ---------------- finder rendering ---------------- */
  var finder = $('#kyv-finder');
  var STEPS = ['about', 'health', 'contact'];

  function chips(group, list, selected, multi) {
    return '<div class="kyv-chips" role="' + (multi ? 'group' : 'radiogroup') + '" data-group="' + group + '">' +
      list.map(function (o) {
        var on = multi ? selected.indexOf(o.id) > -1 : selected === o.id;
        return '<button type="button" class="kyv-chip' + (on ? ' is-on' : '') + (o.sub ? ' has-sub' : '') + '" role="' + (multi ? 'checkbox' : 'radio') +
          '" aria-checked="' + on + '" data-group="' + group + '" data-val="' + esc(o.id) + '">' +
          '<span>' + esc(o.label) + '</span>' + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</button>';
      }).join('') + '</div>';
  }
  function frame(step, inner) {
    var idx = STEPS.indexOf(step), cfg = (C.steps || {})[step] || {};
    return '<div class="kyv-step" data-step="' + step + '">' +
      '<div class="kyv-meta"><span class="kyv-count">Step ' + (idx + 1) + ' of ' + STEPS.length + '</span>' +
      (idx > 0 ? '<button type="button" class="kyv-back" data-act="back">&#8249; Back</button>' : '') + '</div>' +
      '<div class="kyv-progress" aria-hidden="true"><span style="width:' + Math.round(((idx + 1) / STEPS.length) * 100) + '%"></span></div>' +
      '<h2 class="kyv-q">' + esc(cfg.title) + '</h2>' + (cfg.hint ? '<p class="kyv-hint">' + esc(cfg.hint) + '</p>' : '') +
      inner + '</div>';
  }
  function renderAbout() {
    var c = C.steps.about, ok = state.age && state.gender && state.for_whom;
    return frame('about',
      '<div class="kyv-field"><div class="kyv-label">' + esc(c.for_label) + '</div>' + chips('for_whom', C.for_whom, state.for_whom) + '</div>' +
      '<div class="kyv-field"><div class="kyv-label">' + esc(c.age_label) + '</div>' + chips('age', C.ages, state.age) + '</div>' +
      '<div class="kyv-field"><div class="kyv-label">' + esc(c.gender_label) + '</div>' + chips('gender', C.genders, state.gender) + '</div>' +
      '<button type="button" class="kyv-cta" data-act="next"' + (ok ? '' : ' disabled') + '>' + esc(c.cta) + '</button>' +
      '<p class="kyv-err" id="kyv-about-err" hidden>Please choose who it is for, age and gender.</p>');
  }
  function renderHealth() {
    var vis = (C.flags || []).filter(flagVisible);
    state.flags = state.flags.filter(function (f) { return vis.some(function (v) { return v.id === f; }); });
    return frame('health', chips('flags', vis, state.flags, true) +
      '<button type="button" class="kyv-cta" data-act="next"' + (state.flags.length ? '' : ' disabled') + '>' + esc(C.steps.health.cta) + '</button>');
  }
  function renderContact() {
    var c = C.steps.contact;
    return frame('contact',
      '<form class="kyv-form" id="kyv-form" novalidate>' +
      '<label class="kyv-input"><span>Full name</span><input id="kyv-name" name="name" type="text" autocomplete="name" maxlength="60" value="' + esc(state.name) + '" placeholder="Enter your name"></label>' +
      '<p class="kyv-ferr" id="kyv-name-error">Please enter your name</p>' +
      '<label class="kyv-input"><span>Mobile number</span><div class="kyv-phone"><b>+91</b><input id="kyv-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" value="' + esc(state.phone) + '" placeholder="10-digit mobile number"></div></label>' +
      '<p class="kyv-ferr" id="kyv-phone-error">Please enter a valid 10-digit mobile number</p>' +
      '<input type="text" id="kyv-hp" name="company" tabindex="-1" autocomplete="off" class="kyv-hp" aria-hidden="true">' +
      '<label class="kyv-consent"><input type="checkbox" id="kyv-consent"' + (state.consent ? ' checked' : '') + '><span>' + esc(c.consent) + '</span></label>' +
      '<button type="submit" class="kyv-cta">' + esc(c.cta) + '</button>' +
      (S.allow_skip_contact ? '<button type="button" class="kyv-link" data-act="skip">Skip and see my plan</button>' : '') +
      '<p class="kyv-privacy">' + esc(c.privacy) + '</p></form>');
  }
  function renderDone() {
    var must = state.plan.filter(function (r) { return r.tier === 'must'; }).length;
    var maybe = state.plan.length - must;
    return '<div class="kyv-step kyv-done">' +
      '<div class="kyv-done-tick" aria-hidden="true">' + icon('shield') + '</div>' +
      '<h2 class="kyv-q">Your plan is ready' + (state.name ? ', ' + esc(state.name.split(' ')[0]) : '') + '</h2>' +
      '<p class="kyv-hint">' + labelOf(C.for_whom, state.for_whom) + ', ' + labelOf(C.ages, state.age) + ': <b>' + must + ' recommended</b>' +
      (maybe ? ' and <b>' + maybe + ' to discuss</b>' : '') + '. Reveal each vaccine below.</p>' +
      '<a class="kyv-cta" href="#kyv-plan" data-act="toplan">See my vaccines</a>' +
      '<div class="kyv-done-links"><button type="button" class="kyv-link" data-act="family">Check for a family member</button>' +
      '<button type="button" class="kyv-link" data-act="restart">Start over</button></div></div>';
  }
  function render() {
    if (!finder) return;
    var html = state.step === 'about' ? renderAbout() : state.step === 'health' ? renderHealth()
      : state.step === 'contact' ? renderContact() : renderDone();
    finder.innerHTML = html;
    finder.classList.toggle('is-done', state.step === 'done');
    if (state.step === 'contact') wireForm();
  }

  /* ---------------- plan (results) ---------------- */
  function planCard(r) {
    var v = BY_ID[r.id], open = state.revealed.indexOf(r.id) > -1;
    var pill = r.tier === 'must' ? '<span class="kyv-pill is-must">Recommended</span>' : '<span class="kyv-pill is-maybe">Ask a doctor</span>';
    if (!open) {
      return '<button type="button" class="kyv-vcard is-hidden" data-act="reveal" data-id="' + v.id + '" aria-label="Reveal vaccine: ' + esc(v.hook) + '">' +
        '<span class="kyv-vicon">' + icon(v.icon) + '</span><span class="kyv-vbody">' + pill +
        '<span class="kyv-vhook">' + esc(v.hook) + '</span><span class="kyv-vtap">Tap to reveal</span></span>' +
        '<span class="kyv-vq" aria-hidden="true">?</span></button>';
    }
    return '<article class="kyv-vcard is-open" data-id="' + v.id + '">' +
      '<div class="kyv-vtop"><span class="kyv-vicon">' + icon(v.icon) + '</span><div class="kyv-vbody">' + pill +
      '<h3 class="kyv-vname">' + esc(v.name) + '</h3></div></div>' +
      '<p class="kyv-vwhy">' + esc(r.reason) + '</p>' +
      '<dl class="kyv-vfacts"><div><dt>Protects against</dt><dd>' + esc(v.protects) + '</dd></div><div><dt>Doses</dt><dd>' + esc(v.doses) + '</dd></div></dl>' +
      '<div class="kyv-vfoot"><span class="kyv-price">Starts at <b>' + rupees(v.price) + '</b></span>' +
      '<a class="kyv-book" href="' + esc(withSrc(v.url)) + '" data-act="book" data-id="' + v.id + '" data-from="plan">Book at home</a></div></article>';
  }
  function renderPlan() {
    var sec = $('#kyv-plan'); if (!sec) return;
    var must = state.plan.filter(function (r) { return r.tier === 'must'; });
    var maybe = state.plan.filter(function (r) { return r.tier === 'maybe'; });
    var hidden = state.plan.filter(function (r) { return state.revealed.indexOf(r.id) < 0; }).length;
    var total = must.reduce(function (s, r) { return s + BY_ID[r.id].price; }, 0);
    sec.innerHTML = '<div class="kyv-wrap">' +
      '<div class="kyv-plan-head"><h2 class="kyv-h2">Your vaccine plan</h2>' +
      '<p class="kyv-sub">' + esc(labelOf(C.for_whom, state.for_whom)) + ', ' + esc(labelOf(C.ages, state.age)) + ', ' + esc(labelOf(C.genders, state.gender)) + '</p>' +
      (hidden ? '<button type="button" class="kyv-link" data-act="revealall">Reveal all ' + hidden + '</button>' : '') + '</div>' +
      (must.length ? '<h3 class="kyv-h3">Recommended for you <span>' + must.length + '</span></h3><div class="kyv-grid">' + must.map(planCard).join('') + '</div>' : '') +
      (maybe.length ? '<h3 class="kyv-h3">Worth asking a doctor <span>' + maybe.length + '</span></h3><div class="kyv-grid">' + maybe.map(planCard).join('') + '</div>' : '') +
      '<div class="kyv-plan-foot"><div><span class="kyv-sub">Recommended plan starts at</span><b class="kyv-total">' + rupees(total) + '</b></div>' +
      '<a class="kyv-cta kyv-cta-sm" href="' + esc(withSrc(C.doctor.url)) + '" data-act="doctor">' + esc(C.doctor.cta) + '</a></div>' +
      '<p class="kyv-note">' + esc(C.disclaimer) + '</p></div>';
    sec.hidden = false;
    renderExplore();
  }

  /* ---------------- explore (face-down library) ---------------- */
  function exploreCard(v) {
    var open = state.explored.indexOf(v.id) > -1 || state.revealed.indexOf(v.id) > -1;
    var inPlan = state.plan.some(function (r) { return r.id === v.id; });
    var tag = inPlan ? '<span class="kyv-pill is-must">In your plan</span>' : '';
    if (!open) {
      return '<button type="button" class="kyv-ecard is-hidden" data-act="explore" data-id="' + v.id + '">' +
        '<span class="kyv-vicon">' + icon(v.icon) + '</span>' + tag +
        '<span class="kyv-vhook">' + esc(v.hook) + '</span><span class="kyv-eteaser">' + esc(v.teaser) + '</span>' +
        '<span class="kyv-vtap">Tap to reveal &#8250;</span></button>';
    }
    return '<article class="kyv-ecard is-open" data-id="' + v.id + '">' +
      '<span class="kyv-vicon">' + icon(v.icon) + '</span>' + tag +
      '<h3 class="kyv-vname">' + esc(v.name) + '</h3>' +
      '<dl class="kyv-vfacts"><div><dt>Protects against</dt><dd>' + esc(v.protects) + '</dd></div>' +
      '<div><dt>Who needs it</dt><dd>' + esc(v.who) + '</dd></div><div><dt>Doses</dt><dd>' + esc(v.doses) + '</dd></div></dl>' +
      '<div class="kyv-vfoot"><span class="kyv-price">Starts at <b>' + rupees(v.price) + '</b></span>' +
      '<a class="kyv-book" href="' + esc(withSrc(v.url)) + '" data-act="book" data-id="' + v.id + '" data-from="explore">Book at home</a></div></article>';
  }
  function renderExplore() {
    var g = $('#kyv-explore-grid'); if (g) g.innerHTML = VACCINES.map(exploreCard).join('');
  }

  /* ---------------- step transitions ---------------- */
  function go(step) {
    state.step = step; render();
    if (finder && step !== 'about') {
      var top = finder.getBoundingClientRect().top + window.pageYOffset - 72;
      if (Math.abs(window.pageYOffset - top) > 40) window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }
  function finish() {
    state.plan = recommend();
    state.status = state.lead_id ? (state.family_of ? 'family_plan' : 'lead') : 'skipped_contact';
    go('done');
    renderPlan();
    dl('kyv_plan_view', { must_count: state.plan.filter(function (r) { return r.tier === 'must'; }).length, total_count: state.plan.length });
    setTimeout(function () { var p = $('#kyv-plan'); if (p) window.scrollTo({ top: p.getBoundingClientRect().top + window.pageYOffset - 64, behavior: 'smooth' }); }, 250);
  }

  function isValidPhone(v) {
    if (!/^[6-9][0-9]{9}$/.test(v) || /^(\d)\1{9}$/.test(v)) return false;
    var asc = true, desc = true;
    for (var i = 1; i < v.length; i++) {
      var d = +v.charAt(i), p = +v.charAt(i - 1);
      if (d !== (p + 1) % 10) asc = false;
      if (d !== (p + 9) % 10) desc = false;
    }
    return !(asc || desc);
  }
  function fieldErr(id, on) {
    var i = $('#' + id), e = $('#' + id + '-error');
    if (i) i.classList.toggle('is-invalid', on);
    if (e) e.classList.toggle('is-show', on);
  }
  function wireForm() {
    var form = $('#kyv-form'), phone = $('#kyv-phone'), name = $('#kyv-name');
    phone.addEventListener('input', function () {
      var d = phone.value.replace(/\D/g, '');
      if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
      else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
      d = d.slice(0, 10); if (phone.value !== d) phone.value = d;
      fieldErr('kyv-phone', false);
    });
    name.addEventListener('input', function () { fieldErr('kyv-name', false); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var n = name.value.trim(), p = phone.value.trim();
      var nOk = n.length >= 2 && /[a-zA-Zऀ-ॿ]/.test(n), pOk = isValidPhone(p);
      fieldErr('kyv-name', !nOk); fieldErr('kyv-phone', !pOk);
      if (!nOk) { name.focus(); return; }
      if (!pOk) { phone.focus(); return; }
      state.name = n; state.phone = p; state.consent = $('#kyv-consent').checked;
      state.lead_id = uid('KYV-');
      state.plan = recommend();
      state.status = 'lead';
      var must = state.plan.filter(function (r) { return r.tier === 'must'; });
      var value = must.reduce(function (s, r) { return s + BY_ID[r.id].price; }, 0);
      // Ad platforms get the conversion and phone (Enhanced Conversions) but never the health answers.
      dl('generate_lead', { lead_id: state.lead_id, form_name: 'know_your_vaccine', value: value, currency: 'INR',
        user_data: { phone_number: '+91' + p } });
      if (window.fbq) window.fbq('track', 'Lead', { content_name: 'Know Your Vaccine', value: value, currency: 'INR' }, { eventID: state.lead_id });
      sync('lead_submitted', '', { retries: 3 }).then(function (d) { if (d) cleverTap(p); });
      finish();
    });
  }
  function cleverTap(mobile) {
    if (!window.clevertap) return;
    var e164 = '+91' + mobile;
    window.clevertap.onUserLogin.push({ Site: { Identity: e164, Phone: e164 } });
    window.clevertap.event.push('Lead Submitted', { source: 'p_leadgen', element_unique_name: 'kyv_finder_form', source_url: location.href, lead_status: 'success' });
  }

  /* ---------------- events ---------------- */
  function onChip(btn) {
    var g = btn.getAttribute('data-group'), v = btn.getAttribute('data-val');
    markStart();
    if (g === 'flags') {
      if (v === 'none') state.flags = state.flags.indexOf('none') > -1 ? [] : ['none'];
      else {
        state.flags = state.flags.filter(function (f) { return f !== 'none'; });
        var i = state.flags.indexOf(v); if (i > -1) state.flags.splice(i, 1); else state.flags.push(v);
      }
    } else {
      state[g] = v;
      // A child cannot be under "self" with a baby age etc. - no hard rule, just keep answers as given.
    }
    render();
  }
  function onNext() {
    if (state.step === 'about') {
      if (!(state.age && state.gender && state.for_whom)) { var e = $('#kyv-about-err'); if (e) e.hidden = false; return; }
      state.status = 'about_done';
      dl('kyv_step', { step: 'about', step_number: 1 });
      sync('about_completed');
      go('health');
    } else if (state.step === 'health') {
      if (!state.flags.length) return;
      state.status = 'health_done';
      dl('kyv_step', { step: 'health', step_number: 2 });
      sync('health_completed');
      if (state.lead_id) { finish(); sync('family_plan_viewed'); }
      else go('contact');
    }
  }
  function onBack() {
    var i = STEPS.indexOf(state.step);
    if (i > 0) go(STEPS[i - 1]);
  }
  function resetAnswers(family) {
    var prev = state;
    state = {
      session_id: store('session', 'kyv_sid', uid('S-')), lead_id: '', step: 'about', for_whom: '', age: '', gender: '', flags: [],
      name: '', phone: '', consent: true, plan: [], revealed: [], explored: [], booked: [],
      doctor_click: false, family_of: '', started_at: Date.now(), status: 'started'
    };
    if (family && prev.lead_id) {
      state.family_of = prev.lead_id; state.lead_id = uid('KYV-');
      state.name = prev.name; state.phone = prev.phone; state.consent = prev.consent;
    }
    var p = $('#kyv-plan'); if (p) { p.hidden = true; p.innerHTML = ''; }
    renderExplore();
    go('about');
    var top = finder.getBoundingClientRect().top + window.pageYOffset - 72;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }
  function reveal(id, kind) {
    var list = kind === 'explore' ? state.explored : state.revealed;
    if (list.indexOf(id) < 0) list.push(id);
    dl(kind === 'explore' ? 'kyv_explore_reveal' : 'kyv_plan_reveal', { vaccine: id });
    sync(kind === 'explore' ? 'explore_reveal' : 'plan_reveal', id);
    if (kind === 'explore') renderExplore(); else renderPlan();
    var el = $('[data-id="' + id + '"].is-open', kind === 'explore' ? $('#kyv-explore-grid') : $('#kyv-plan'));
    if (el) { el.classList.add('is-flip'); setTimeout(function () { el.classList.remove('is-flip'); }, 400); }
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-act], .kyv-chip') : null;
    if (!t) return;
    if (t.classList.contains('kyv-chip')) { onChip(t); return; }
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
    if (act === 'next') onNext();
    else if (act === 'back') onBack();
    else if (act === 'skip') { state.status = 'skipped_contact'; dl('kyv_skip_contact'); sync('contact_skipped'); finish(); }
    else if (act === 'reveal') { markStart(); reveal(id, 'plan'); }
    else if (act === 'explore') { markStart(); reveal(id, 'explore'); }
    else if (act === 'revealall') {
      state.plan.forEach(function (r) { if (state.revealed.indexOf(r.id) < 0) state.revealed.push(r.id); });
      dl('kyv_plan_reveal_all'); sync('plan_reveal_all'); renderPlan(); renderExplore();
    }
    else if (act === 'book') {
      if (state.booked.indexOf(id) < 0) state.booked.push(id);
      var v = BY_ID[id];
      dl('order_now_click', { vaccine: id, source: t.getAttribute('data-from'), value: v ? v.price : 0, currency: 'INR' });
      sync('book_click', id + ':' + t.getAttribute('data-from'), { beacon: true });
    }
    else if (act === 'doctor') { state.doctor_click = true; dl('talk_to_doctor_click'); sync('doctor_click', t.getAttribute('data-from') || 'plan', { beacon: true }); }
    else if (act === 'restart') { dl('kyv_restart'); resetAnswers(false); }
    else if (act === 'family') { dl('kyv_family_check'); resetAnswers(true); }
    else if (act === 'toplan') {
      e.preventDefault(); var p = $('#kyv-plan');
      if (p) window.scrollTo({ top: p.getBoundingClientRect().top + window.pageYOffset - 64, behavior: 'smooth' });
    }
    else if (act === 'startcheck') {
      e.preventDefault(); markStart(); dl('kyv_sticky_click');
      window.scrollTo({ top: finder.getBoundingClientRect().top + window.pageYOffset - 72, behavior: 'smooth' });
    }
  });

  /* ---------------- chrome: nav, sticky bar ---------------- */
  (function nav() {
    var burger = $('.pe-burger'), menu = $('#pe-topnav');
    if (burger && menu) burger.addEventListener('click', function () {
      var open = menu.classList.toggle('open'); burger.setAttribute('aria-expanded', open);
    });
    $all('.pe-nav-btn').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var item = b.parentNode, was = item.classList.contains('open');
        $all('.pe-nav-item.open').forEach(function (x) { x.classList.remove('open'); x.firstChild.setAttribute('aria-expanded', 'false'); });
        if (!was) { item.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
      });
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.pe-nav-item')) $all('.pe-nav-item.open').forEach(function (x) { x.classList.remove('open'); });
    });
  })();
  (function sticky() {
    var bar = $('#kyv-sticky'); if (!bar || !finder || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (en) {
      var show = !en[0].isIntersecting && state.step !== 'done';
      bar.classList.toggle('is-show', show);
    }, { threshold: 0 }).observe(finder);
  })();

  render();
  renderExplore();
})();
