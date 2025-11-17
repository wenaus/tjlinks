const titleInput = document.getElementById('title');
const urlInput = document.getElementById('url');
const copyButton = document.getElementById('copy');
const copyCleanButton = document.getElementById('copy-clean');
const status = document.getElementById('status');

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

// Select all on focus
titleInput.addEventListener('focus', (e) => e.target.select());
urlInput.addEventListener('focus', (e) => e.target.select());

// Auto-resize on input
titleInput.addEventListener('input', () => autoResize(titleInput));
urlInput.addEventListener('input', () => autoResize(urlInput));

// Enter key to copy and close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    copyButton.click();
  }
});