const slider = document.getElementById('volumeSlider');
const valLabel = document.getElementById('val');
const muteBtn = document.getElementById('muteBtn');
const saveSiteBtn = document.getElementById('saveSite');
const savedListContainer = document.getElementById('savedRules');
const activeTabsContainer = document.getElementById('activeTabs');
const darkModeToggle = document.getElementById('darkModeToggle');
const resetAllBtn = document.getElementById('resetAll');

async function updateVolume(value) {
    const vol = parseInt(value);
    slider.value = vol;
    valLabel.innerText = vol;
    
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.runtime.sendMessage({
        type: "SET_VOLUME",
        tabId: tab.id,
        volume: vol
    });
}

slider.addEventListener('input', (e) => updateVolume(e.target.value));
muteBtn.addEventListener('click', () => updateVolume(0));

document.addEventListener('keydown', (e) => {
    if (e.key >= '0' && e.key <= '9') updateVolume(parseInt(e.key) * 100);
});

darkModeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    chrome.storage.local.set({ darkMode: isDark });
});

saveSiteBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.url) return;
    const domain = new URL(tab.url).hostname;
    chrome.storage.local.get(['savedSites'], (data) => {
        const sites = data.savedSites || {};
        sites[domain] = slider.value;
        chrome.storage.local.set({ savedSites: sites }, renderSavedSites);
    });
});

resetAllBtn.addEventListener('click', () => {
    if(confirm("Delete all saved rules?")) {
        chrome.storage.local.set({ savedSites: {} }, renderSavedSites);
    }
});

function renderSavedSites() {
    chrome.storage.local.get(['savedSites'], (data) => {
        const sites = data.savedSites || {};
        savedListContainer.innerHTML = '';
        Object.entries(sites).forEach(([domain, vol]) => {
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `<span>${domain} (${vol}%)</span><button class="delete-btn" data-domain="${domain}">×</button>`;
            savedListContainer.appendChild(div);
        });
    });
}

// Updated to show only Gain Affected Tabs
async function renderActiveTabs() {
    chrome.runtime.sendMessage({ type: "GET_CAPTURED_TABS" }, async (response) => {
        const capturedIds = response?.tabIds || [];
        activeTabsContainer.innerHTML = '';
        
        if (capturedIds.length === 0) {
            activeTabsContainer.innerHTML = '<div class="item">No active boosts</div>';
            return;
        }

        for (const id of capturedIds) {
            try {
                const tab = await chrome.tabs.get(id);
                const div = document.createElement('div');
                div.className = 'item';
                div.innerHTML = `<span class="item-title">${tab.title}</span>`;
                activeTabsContainer.appendChild(div);
            } catch (e) { /* Tab might have been closed */ }
        }
    });
}

savedListContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
        const domain = e.target.getAttribute('data-domain');
        chrome.storage.local.get(['savedSites'], (data) => {
            const sites = data.savedSites;
            delete sites[domain];
            chrome.storage.local.set({ savedSites: sites }, renderSavedSites);
        });
    }
});

async function initPopup() {
    // 1. Dark Mode
    chrome.storage.local.get(['darkMode'], (data) => {
        if (data.darkMode) document.body.classList.add('dark');
        else document.body.classList.remove('dark');
    });

    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        const domain = tab.url ? new URL(tab.url).hostname : "";

        // 2. Auto-Apply Rule or Fetch Current
        chrome.storage.local.get(['savedSites'], (data) => {
            const savedSites = data.savedSites || {};
            
            chrome.runtime.sendMessage({ type: "GET_CURRENT_VOLUME", tabId: tab.id }, (response) => {
                if (response && response.volume !== 100) {
                    // Tab is already being captured, use current volume
                    slider.value = response.volume;
                    valLabel.innerText = response.volume;
                } else if (savedSites[domain]) {
                    // Not captured yet, but we have a saved rule - AUTO APPLY
                    updateVolume(savedSites[domain]);
                } else {
                    // Default
                    slider.value = 100;
                    valLabel.innerText = 100;
                }
            });
        });
    }

    renderSavedSites();
    renderActiveTabs();
}

initPopup();
setInterval(renderActiveTabs, 3000);