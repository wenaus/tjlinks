var TJAI_API_URL = 'https://etaverse.com/tjai/api/add-bookmark';

const titleInput = document.getElementById('title');
const urlInput = document.getElementById('url');
const copyButton = document.getElementById('copy');
const copyCleanButton = document.getElementById('copy-clean');
const saveTjaiButton = document.getElementById('save-tjai');
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

// Copy with full URL
copyButton.addEventListener('click', () => {
  const markdown = `[${cleanTitle(titleInput.value)}](${urlInput.value})`;
  navigator.clipboard.writeText(markdown).then(() => {
    window.close();
  });
});

// Copy without suffix
copyCleanButton.addEventListener('click', () => {
  const cleanUrl = urlInput.value.split(/[?#]/)[0];
  const markdown = `[${cleanTitle(titleInput.value)}](${cleanUrl})`;
  navigator.clipboard.writeText(markdown).then(() => {
    window.close();
  });
});

// Save to tjai
saveTjaiButton.addEventListener('click', () => {
  chrome.storage.sync.get('tjai_api_key', (data) => {
    if (!data.tjai_api_key) {
      apiKeySection.style.display = 'block';
      apiKeyInput.focus();
      showStatus('Enter API key first', true);
      return;
    }
    postToTjai(data.tjai_api_key);
  });
});

function postToTjai(apiKey) {
  saveTjaiButton.disabled = true;
  saveTjaiButton.textContent = 'Saving...';

  fetch(TJAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      title: cleanTitle(titleInput.value),
      url: urlInput.value
    })
  })
  .then(r => r.json().then(body => ({status: r.status, body})))
  .then(({status: code, body}) => {
    if (code === 200 && body.status === 'ok') {
      showStatus('Saved: ' + body.content, false);
      setTimeout(() => window.close(), 1000);
    } else {
      showStatus('Error: ' + (body.error || 'HTTP ' + code), true);
      saveTjaiButton.disabled = false;
      saveTjaiButton.textContent = 'Save to tjai';
    }
  })
  .catch(err => {
    showStatus('Error: ' + err.message, true);
    saveTjaiButton.disabled = false;
    saveTjaiButton.textContent = 'Save to tjai';
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

// Auto-resize on input
titleInput.addEventListener('input', () => autoResize(titleInput));
urlInput.addEventListener('input', () => autoResize(urlInput));

// Enter key to copy and close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName !== 'INPUT') {
    copyButton.click();
  }
});
