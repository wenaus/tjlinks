var TJAI_API_URL = 'https://etaverse.com/tjai/api/add-bookmark';
var TJAI_JOURNAL_URL = 'https://etaverse.com/tjai/api/add-journal';
var TJAI_HEALTH_URL = 'https://etaverse.com/tjai/api/health';

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
