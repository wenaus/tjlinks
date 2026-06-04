var TJAI_API_URL = 'https://etaverse.com/tjai/api/add-bookmark';
var TJAI_JOURNAL_URL = 'https://etaverse.com/tjai/api/add-journal';
var TJAI_HEALTH_URL = 'https://etaverse.com/tjai/api/health';
var TJAI_CURATE_URL = 'https://etaverse.com/tjai/api/picks/curate-page';

// App timezone (IANA name) fetched from server; null until loaded
var appTimezone = null;

// Fetch app timezone from server on startup
fetch(TJAI_HEALTH_URL)
  .then(r => r.json())
  .then(data => {
    if (data.timezone) {
      appTimezone = data.timezone;
      // Re-render event display if already extracted
      if (eventData && eventData.startDate) {
        var dateEl = eventInfo.querySelector('.event-detail');
        if (dateEl) {
          var text = formatEventDate(eventData.startDate);
          if (eventData.locationName) text += ' — ' + eventData.locationName;
          dateEl.innerHTML = text;
        }
      }
    }
  })
  .catch(err => { console.error('Failed to fetch app timezone:', err.message); });

const titleInput = document.getElementById('title');
const urlInput = document.getElementById('url');
const textInput = document.getElementById('text');
const copyButton = document.getElementById('copy');
const copyCleanButton = document.getElementById('copy-clean');
const saveTjaiButton = document.getElementById('save-tjai');
const saveTjaiCleanButton = document.getElementById('save-tjai-clean');
const saveReadmeButton = document.getElementById('save-readme');
const saveReadmeCleanButton = document.getElementById('save-readme-clean');
const curateButton = document.getElementById('curate-picks');
const curateDlButton = document.getElementById('curate-picks-dl');
const apiKeySection = document.getElementById('api-key-section');
const apiKeyInput = document.getElementById('api-key');
const saveKeyButton = document.getElementById('save-key');
const statusEl = document.getElementById('status');

// Auto-resize textarea
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

// Event elements
const eventSection = document.getElementById('event-section');
const eventInfo = document.getElementById('event-info');
const addCalendarButton = document.getElementById('add-calendar');
var eventData = null;

// Extract schema.org Event data from the page (runs as content script).
// Generic: any page advertising an Event in JSON-LD (Indico, Squarespace
// calendars, Eventbrite, etc.) is matched the same way.
function extractEventData() {
  var result = {name: null, startDate: null, endDate: null, locationName: null, zoomUrl: null};

  // Parse JSON-LD, looking for a schema.org Event
  var scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (var i = 0; i < scripts.length; i++) {
    try {
      var ld = JSON.parse(scripts[i].textContent);
      if (ld['@type'] === 'Event') {
        result.name = ld.name || null;
        result.startDate = ld.startDate || null;
        result.endDate = ld.endDate || null;
        if (ld.location) result.locationName = ld.location.name || null;
        break;
      }
    } catch (e) { /* ignore non-JSON / malformed blocks while probing */ }
  }

  // Extract zoom URL from <a> hrefs
  var zoomRegex = /https:\/\/[a-zA-Z0-9.-]*zoom\.us\/j\/\d+(\?pwd=[^\s&"<)\]]+)?/i;
  var links = document.querySelectorAll('a[href*="zoom.us"]');
  for (var j = 0; j < links.length; j++) {
    var match = links[j].href.match(zoomRegex);
    if (match) { result.zoomUrl = match[0]; break; }
  }

  // Fallback: scan body text for zoom URL
  if (!result.zoomUrl) {
    var bodyMatch = document.body.innerText.match(zoomRegex);
    if (bodyMatch) result.zoomUrl = bodyMatch[0];
  }

  return result;
}

// Format ISO date for display in app timezone (from server), fallback to browser local
function formatEventDate(isoStr) {
  var d = new Date(isoStr);
  var opts = appTimezone ? {timeZone: appTimezone} : {};
  return d.toLocaleDateString('en-US', Object.assign({
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  }, opts)) + ' ' + d.toLocaleTimeString('en-US', Object.assign({
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
  }, opts));
}

// Get current tab info
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  const tab = tabs[0];
  titleInput.value = tab.title;
  urlInput.value = tab.url;
  autoResize(titleInput);
  autoResize(urlInput);

  // Probe any page for schema.org Event markup. Stays silent unless a
  // usable Event (name + startDate) is found — no URL gate.
  chrome.scripting.executeScript({
    target: {tabId: tab.id},
    func: extractEventData
  }, (results) => {
    // Silent on pages we can't script (chrome://, store pages, etc.)
    if (chrome.runtime.lastError) return;
    if (!results || !results[0] || !results[0].result) return;
    var data = results[0].result;
    if (!data.name || !data.startDate) return;

    eventData = data;
    eventData.eventUrl = tab.url.split(/[?#]/)[0];

    var html = '<div class="event-title">' + escapeHtml(data.name) + '</div>';
    html += '<div class="event-detail">' + formatEventDate(data.startDate);
    if (data.locationName) html += ' &mdash; ' + escapeHtml(data.locationName);
    html += '</div>';
    if (data.zoomUrl) html += '<div class="event-detail">zoom link found</div>';

    eventInfo.innerHTML = html;
    eventSection.style.display = 'block';
  });
});

// Clean title - remove newlines and extra whitespace
function cleanTitle(title) {
  return title.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function showStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#d00' : '#080';
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Save detected event to tjai calendar
addCalendarButton.addEventListener('click', () => {
  if (!eventData) return;
  chrome.storage.sync.get('tjai_api_key', (data) => {
    if (!data.tjai_api_key) {
      apiKeySection.style.display = 'block';
      apiKeyInput.focus();
      showStatus('Enter API key first', true);
      return;
    }
    postEvent(data.tjai_api_key);
  });
});

function postEvent(apiKey) {
  addCalendarButton.disabled = true;
  addCalendarButton.textContent = 'Saving...';

  var eventTimestamp = new Date(eventData.startDate).getTime() / 1000;

  var body = {
    title: eventData.name,
    event_timestamp: eventTimestamp,
    event_url: eventData.eventUrl,
    source: 'web'
  };
  if (eventData.zoomUrl) body.zoom_url = eventData.zoomUrl;
  if (eventData.locationName) body.location = eventData.locationName;

  fetch(TJAI_JOURNAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify(body)
  })
  .then(r => r.json().then(b => ({status: r.status, body: b})))
  .then(({status: code, body: resp}) => {
    if (code === 200 && resp.status === 'ok') {
      showStatus('Saved: ' + resp.content, false);
      setTimeout(() => window.close(), 3000);
    } else {
      showStatus('Error: ' + (resp.error || 'HTTP ' + code), true);
      addCalendarButton.disabled = false;
      addCalendarButton.textContent = 'Add to tjai calendar';
    }
  })
  .catch(err => {
    showStatus('Error: ' + err.message, true);
    addCalendarButton.disabled = false;
    addCalendarButton.textContent = 'Add to tjai calendar';
  });
}

function buildMarkdown(url) {
  var md = `[${cleanTitle(titleInput.value)}](${url})`;
  var text = textInput.value.trim();
  if (text) md += '   ' + text;
  return md;
}

// Copy with full URL
copyButton.addEventListener('click', () => {
  navigator.clipboard.writeText(buildMarkdown(urlInput.value)).then(() => {
    window.close();
  });
});

// Copy without suffix
copyCleanButton.addEventListener('click', () => {
  navigator.clipboard.writeText(buildMarkdown(urlInput.value.split(/[?#]/)[0])).then(() => {
    window.close();
  });
});

// Save to tjai
function initTjaiSave(truncate, readme) {
  chrome.storage.sync.get('tjai_api_key', (data) => {
    if (!data.tjai_api_key) {
      apiKeySection.style.display = 'block';
      apiKeyInput.focus();
      showStatus('Enter API key first', true);
      return;
    }
    postToTjai(data.tjai_api_key, truncate, readme);
  });
}

saveTjaiButton.addEventListener('click', () => initTjaiSave(false, false));
saveTjaiCleanButton.addEventListener('click', () => initTjaiSave(true, false));
saveReadmeButton.addEventListener('click', () => initTjaiSave(false, true));
saveReadmeCleanButton.addEventListener('click', () => initTjaiSave(true, true));

function postToTjai(apiKey, truncate, readme) {
  var btn = readme
    ? (truncate ? saveReadmeCleanButton : saveReadmeButton)
    : (truncate ? saveTjaiCleanButton : saveTjaiButton);
  var label = btn.textContent;
  var url = truncate ? urlInput.value.split(/[?#]/)[0] : urlInput.value;
  btn.disabled = true;
  btn.textContent = 'Saving...';

  var payload = {
    title: cleanTitle(titleInput.value),
    url: url,
    text: textInput.value.trim()
  };
  if (readme) payload.readme = true;

  fetch(TJAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify(payload)
  })
  .then(r => r.json().then(body => ({status: r.status, body})))
  .then(({status: code, body}) => {
    if (code === 200 && body.status === 'duplicate') {
      if (body.updated) {
        showStatus('Updated: ' + body.content, false);
        setTimeout(() => window.close(), 3000);
      } else {
        showStatus('Already saved: ' + body.content, true);
        btn.disabled = false;
        btn.textContent = label;
      }
    } else if (code === 200 && body.status === 'ok') {
      var msg = 'Saved: ' + body.content;
      if (body.auto_tags && body.auto_tags.length) msg += ' [' + body.auto_tags.join(', ') + ']';
      showStatus(msg, false);
      setTimeout(() => window.close(), 3000);
    } else {
      showStatus('Error: ' + (body.error || 'HTTP ' + code), true);
      btn.disabled = false;
      btn.textContent = label;
    }
  })
  .catch(err => {
    showStatus('Error: ' + err.message, true);
    btn.disabled = false;
    btn.textContent = label;
  });
}

// ---- Curate picks from the current page -------------------------------------
// The trojan: this runs inside the user's authenticated session, so it can read
// the page and (download variant) fetch the page's same-origin file attachments
// with the session cookie. The server is never authenticated to the source site.

var WARN_PDF_COUNT = 12;  // warn/approve before pulling more than this many decks

// Injected into the page: returns its text + same-origin PDF links.
function extractPicksContent() {
  var MAX_TEXT = 200000;
  var text = (document.body ? document.body.innerText : '') || '';
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);
  var origin = location.origin, seen = {}, pdfUrls = [];
  var anchors = document.querySelectorAll('a[href]');
  for (var i = 0; i < anchors.length; i++) {
    try {
      var u = new URL(anchors[i].href, location.href);
      if (u.origin !== origin) continue;          // same-origin only (auth rides along)
      if (!/\.pdf$/i.test(u.pathname)) continue;
      var clean = u.origin + u.pathname + u.search;
      if (!seen[clean]) { seen[clean] = true; pdfUrls.push(clean); }
    } catch (e) { /* skip bad href */ }
  }
  return {title: document.title || '', url: location.href, text: text, pdfUrls: pdfUrls};
}

// Injected into the page: fetch each same-origin PDF (authenticated) -> base64.
async function fetchPdfsInPage(urls) {
  function bufToB64(buf) {
    var bytes = new Uint8Array(buf), chunk = 0x8000, bin = '';
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  var out = [];
  for (var i = 0; i < urls.length; i++) {
    try {
      var r = await fetch(urls[i], {credentials: 'same-origin'});
      if (!r.ok) continue;
      var buf = await r.arrayBuffer();
      var name = decodeURIComponent((new URL(urls[i]).pathname.split('/').pop()) || ('deck-' + i + '.pdf'));
      out.push({name: name, b64: bufToB64(buf)});
    } catch (e) { /* skip failed fetch, keep going */ }
  }
  return out;
}

function b64ToBlob(b64, type) {
  var bin = atob(b64), arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], {type: type});
}

function curatePicks(downloadMode) {
  chrome.storage.sync.get('tjai_api_key', (data) => {
    if (!data.tjai_api_key) {
      apiKeySection.style.display = 'block';
      apiKeyInput.focus();
      showStatus('Enter API key first', true);
      return;
    }
    runCurate(data.tjai_api_key, downloadMode);
  });
}

function runCurate(apiKey, downloadMode) {
  var btn = downloadMode ? curateDlButton : curateButton;
  var label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Reading page...';
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    var tab = tabs[0];
    chrome.scripting.executeScript({target: {tabId: tab.id}, func: extractPicksContent}, (results) => {
      if (chrome.runtime.lastError || !results || !results[0]) {
        showStatus('Cannot read this page: ' + (chrome.runtime.lastError ? chrome.runtime.lastError.message : 'no result'), true);
        btn.disabled = false; btn.textContent = label; return;
      }
      var page = results[0].result;
      if (!downloadMode) { postCurate(apiKey, page, [], btn, label); return; }

      var n = page.pdfUrls.length;
      if (n === 0) {
        showStatus('No same-origin PDFs found on this page', true);
        btn.disabled = false; btn.textContent = label; return;
      }
      if (n > WARN_PDF_COUNT && !confirm('This page links ' + n + ' PDFs. Download and curate all ' + n + '?')) {
        btn.disabled = false; btn.textContent = label; return;
      }
      btn.textContent = 'Fetching ' + n + ' decks...';
      chrome.scripting.executeScript(
        {target: {tabId: tab.id}, func: fetchPdfsInPage, args: [page.pdfUrls]},
        (pres) => {
          if (chrome.runtime.lastError || !pres || !pres[0]) {
            showStatus('PDF fetch failed: ' + (chrome.runtime.lastError ? chrome.runtime.lastError.message : 'no result'), true);
            btn.disabled = false; btn.textContent = label; return;
          }
          postCurate(apiKey, page, pres[0].result || [], btn, label);
        });
    });
  });
}

function postCurate(apiKey, page, pdfs, btn, label) {
  btn.textContent = pdfs.length ? ('Uploading ' + pdfs.length + ' decks...') : 'Curating...';
  var fd = new FormData();
  fd.append('url', page.url);
  fd.append('title', page.title);
  fd.append('source', page.title);
  fd.append('mode', pdfs.length ? 'download' : 'page');
  fd.append('page_text', page.text || '');
  for (var i = 0; i < pdfs.length; i++) {
    fd.append('pdfs', b64ToBlob(pdfs[i].b64, 'application/pdf'), pdfs[i].name);
  }
  fetch(TJAI_CURATE_URL, {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + apiKey},  // no Content-Type: browser sets the multipart boundary
    body: fd
  })
  .then(r => r.json().then(body => ({status: r.status, body})))
  .then(({status: code, body}) => {
    if (code === 200 && body.status === 'queued') {
      var msg = body.pdfs_saved
        ? ('Queued ' + body.pdfs_saved + ' decks — picks will appear at /tjai/picks/')
        : 'Queued — picks will appear at /tjai/picks/';
      if (body.pdfs_truncated) msg += ' (capped)';
      showStatus(msg, false);
      setTimeout(() => window.close(), 4000);
    } else {
      showStatus('Error: ' + (body.error || 'HTTP ' + code), true);
      btn.disabled = false; btn.textContent = label;
    }
  })
  .catch(err => {
    showStatus('Error: ' + err.message, true);
    btn.disabled = false; btn.textContent = label;
  });
}

curateButton.addEventListener('click', () => curatePicks(false));
curateDlButton.addEventListener('click', () => curatePicks(true));

// Save API key
saveKeyButton.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  chrome.storage.sync.set({tjai_api_key: key}, () => {
    apiKeySection.style.display = 'none';
    showStatus('Key saved', false);
    postToTjai(key, false, false);
  });
});

apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveKeyButton.click();
});

// Select all on focus
titleInput.addEventListener('focus', (e) => e.target.select());
urlInput.addEventListener('focus', (e) => e.target.select());
textInput.addEventListener('focus', (e) => e.target.select());

// Auto-resize on input
titleInput.addEventListener('input', () => autoResize(titleInput));
urlInput.addEventListener('input', () => autoResize(urlInput));
textInput.addEventListener('input', () => autoResize(textInput));

// Enter key to copy and close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName !== 'INPUT') {
    copyButton.click();
  }
});
