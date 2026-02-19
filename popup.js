var TJAI_API_URL = 'https://etaverse.com/tjai/api/add-bookmark';
var TJAI_JOURNAL_URL = 'https://etaverse.com/tjai/api/add-journal';

const titleInput = document.getElementById('title');
const urlInput = document.getElementById('url');
const textInput = document.getElementById('text');
const copyButton = document.getElementById('copy');
const copyCleanButton = document.getElementById('copy-clean');
const saveTjaiButton = document.getElementById('save-tjai');
const saveTjaiCleanButton = document.getElementById('save-tjai-clean');
const apiKeySection = document.getElementById('api-key-section');
const apiKeyInput = document.getElementById('api-key');
const saveKeyButton = document.getElementById('save-key');
const statusEl = document.getElementById('status');

// Auto-resize textarea
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

// Indico elements
const indicoSection = document.getElementById('indico-section');
const indicoInfo = document.getElementById('indico-info');
const addCalendarButton = document.getElementById('add-calendar');
var indicoEventData = null;

// Extract event data from Indico page (runs as content script)
function extractIndicoData() {
  var result = {name: null, startDate: null, endDate: null, locationName: null, zoomUrl: null};

  // Parse JSON-LD
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
    } catch (e) {}
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

// Format ISO date for display in user's local timezone
function formatEventDate(isoStr) {
  var d = new Date(isoStr);
  return d.toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  }) + ' ' + d.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'});
}

// Get current tab info
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  const tab = tabs[0];
  titleInput.value = tab.title;
  urlInput.value = tab.url;
  autoResize(titleInput);
  autoResize(urlInput);

  // Check for Indico event page
  if (/\/event\/\d+/.test(tab.url)) {
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: extractIndicoData
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error('Indico extraction error:', chrome.runtime.lastError.message);
        return;
      }
      if (!results || !results[0] || !results[0].result) return;
      var data = results[0].result;
      if (!data.name || !data.startDate) return;

      indicoEventData = data;
      indicoEventData.indicoUrl = tab.url.split(/[?#]/)[0];

      var html = '<div class="indico-title">' + escapeHtml(data.name) + '</div>';
      html += '<div class="indico-detail">' + formatEventDate(data.startDate);
      if (data.locationName) html += ' &mdash; ' + escapeHtml(data.locationName);
      html += '</div>';
      if (data.zoomUrl) html += '<div class="indico-detail">zoom link found</div>';

      indicoInfo.innerHTML = html;
      indicoSection.style.display = 'block';
    });
  }
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

// Save Indico event to tjai calendar
addCalendarButton.addEventListener('click', () => {
  if (!indicoEventData) return;
  chrome.storage.sync.get('tjai_api_key', (data) => {
    if (!data.tjai_api_key) {
      apiKeySection.style.display = 'block';
      apiKeyInput.focus();
      showStatus('Enter API key first', true);
      return;
    }
    postIndicoEvent(data.tjai_api_key);
  });
});

function postIndicoEvent(apiKey) {
  addCalendarButton.disabled = true;
  addCalendarButton.textContent = 'Saving...';

  var eventTimestamp = new Date(indicoEventData.startDate).getTime() / 1000;

  var body = {
    title: indicoEventData.name,
    event_timestamp: eventTimestamp,
    indico_url: indicoEventData.indicoUrl,
    source: 'indico'
  };
  if (indicoEventData.zoomUrl) body.zoom_url = indicoEventData.zoomUrl;
  if (indicoEventData.locationName) body.location = indicoEventData.locationName;

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
function initTjaiSave(truncate) {
  chrome.storage.sync.get('tjai_api_key', (data) => {
    if (!data.tjai_api_key) {
      apiKeySection.style.display = 'block';
      apiKeyInput.focus();
      showStatus('Enter API key first', true);
      return;
    }
    postToTjai(data.tjai_api_key, truncate);
  });
}

saveTjaiButton.addEventListener('click', () => initTjaiSave(false));
saveTjaiCleanButton.addEventListener('click', () => initTjaiSave(true));

function postToTjai(apiKey, truncate) {
  var btn = truncate ? saveTjaiCleanButton : saveTjaiButton;
  var label = truncate ? 'Save to tjai without suffix' : 'Save to tjai';
  var url = truncate ? urlInput.value.split(/[?#]/)[0] : urlInput.value;
  btn.disabled = true;
  btn.textContent = 'Saving...';

  fetch(TJAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      title: cleanTitle(titleInput.value),
      url: url,
      text: textInput.value.trim()
    })
  })
  .then(r => r.json().then(body => ({status: r.status, body})))
  .then(({status: code, body}) => {
    if (code === 200 && body.status === 'duplicate') {
      showStatus('Already saved: ' + body.content, true);
      btn.disabled = false;
      btn.textContent = label;
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
    postToTjai(key);
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
