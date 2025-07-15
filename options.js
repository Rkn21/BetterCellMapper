// Saves options to storage API.
function saveOptions() {
  const key = document.getElementById('apikey').value;
  browser.storage.local.set({ apiKey: key });
}

// Restores select box state using the preferences stored in storage.
function restoreOptions() {
  browser.storage.local.get('apiKey').then(res => {
    if (res.apiKey) document.getElementById('apikey').value = res.apiKey;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
