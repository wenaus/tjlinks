var TJAI_API_URL = 'https://etaverse.com/tjai/api/add-bookmark';

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

// Get current tab info
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  const tab = tabs[0];
  titleInput.value = tab.title;
  urlInput.value = tab.url;
  autoResize(titleInput);
  autoResize(urlInput);
});

// Clean title - remove newlines and extra whitespace
function cleanTitle(title) {
  return title.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function showStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#d00' : '#080';
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
      showStatus('Saved: ' + body.content, false);
      setTimeout(() => window.close(), 1000);
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
