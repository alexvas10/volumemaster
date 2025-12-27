const slider = document.getElementById('volumeSlider');
const valLabel = document.getElementById('val');
const muteBtn = document.getElementById('muteBtn');
const saveRuleBtn = document.getElementById('saveRule');
const savedListContainer = document.getElementById('savedRules');
const activeTabsContainer = document.getElementById('activeTabs');
const darkModeToggle = document.getElementById('darkModeToggle');
const resetAllBtn = document.getElementById('resetAll');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

let isMuted = false;
let volumeBeforeMute = 100;

async function updateVolume(value) {
    const vol = parseInt(value);
    slider.value = vol;
    valLabel.innerText = vol;
    
    // Update mute button state
    if (vol === 0) {
        isMuted = true;
        muteBtn.textContent = 'Unmute';
        muteBtn.style.backgroundColor = '#4CAF50'; // Green for unmute
    } else {
        isMuted = false;
        muteBtn.textContent = 'Mute';
        muteBtn.style.backgroundColor = '#cf6679'; // Red for mute
    }
    
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.runtime.sendMessage({ type: "SET_VOLUME", tabId: tab.id, volume: vol });
}

// --- Keyboard Shortcuts for Number Keys ---
document.addEventListener('keydown', (e) => {
    // Check if the key pressed is a number key (0-9)
    if (e.key >= '0' && e.key <= '9') {
        // Prevent default behavior
        e.preventDefault();
        
        // Convert key to volume: 0 = 0%, 1 = 100%, 2 = 200%, ..., 9 = 900%
        const volumeValue = parseInt(e.key) * 100;
        
        // Save current volume before muting if pressing 0
        if (volumeValue === 0 && !isMuted) {
            volumeBeforeMute = parseInt(slider.value);
        } else if (volumeValue > 0) {
            volumeBeforeMute = volumeValue;
        }
        
        updateVolume(volumeValue);
    }
});

// --- Rule Management ---

saveRuleBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.url) return;

    const urlObj = new URL(tab.url);
    const scope = document.querySelector('input[name="ruleScope"]:checked').value;
    const key = (scope === 'domain') ? urlObj.hostname : tab.url;
    const vol = slider.value;

    chrome.storage.local.get(['v2Rules'], (data) => {
        const rules = data.v2Rules || [];
        // Remove old rule for this specific key if it exists
        const filteredRules = rules.filter(r => r.key !== key);
        filteredRules.push({ key, vol, type: scope });
        
        chrome.storage.local.set({ v2Rules: filteredRules }, renderSavedSites);
    });
});

function renderSavedSites() {
    chrome.storage.local.get(['v2Rules'], (data) => {
        const rules = data.v2Rules || [];
        savedListContainer.innerHTML = '';
        rules.forEach((rule, index) => {
            const div = document.createElement('div');
            div.className = 'item';
            const label = rule.type === 'domain' ? 'Site' : 'URL';
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                    <small style="color:var(--accent-color); flex-shrink: 0;">[${label}]</small> 
                    <span class="item-title" title="${rule.key}">${rule.key}</span>
                    <strong style="flex-shrink: 0; margin-left: auto;">${rule.vol}%</strong>
                </div>
                <button class="delete-btn" data-index="${index}">×</button>
            `;
            savedListContainer.appendChild(div);
        });
    });
}

// --- Render Active Tabs ---
function renderActiveTabs() {
    chrome.runtime.sendMessage({ type: "GET_CAPTURED_TABS" }, (response) => {
        if (!response?.tabIds?.length) {
            activeTabsContainer.innerHTML = '<div style="padding:10px;text-align:center;opacity:0.6">No active boosted tabs</div>';
            return;
        }
        
        activeTabsContainer.innerHTML = '';
        response.tabIds.forEach(tabId => {
            chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError || !tab) return;
                
                const div = document.createElement('div');
                div.className = 'item';
                div.innerHTML = `
                    <span class="item-title" title="${tab.title}">${tab.title}</span>
                `;
                activeTabsContainer.appendChild(div);
            });
        });
    });
}

// --- Import / Export Logic ---

exportBtn.addEventListener('click', () => {
    chrome.storage.local.get(['v2Rules'], (data) => {
        const blob = new Blob([JSON.stringify(data.v2Rules || [], null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "volume_booster_rules.json";
        a.click();
    });
});

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            chrome.storage.local.set({ v2Rules: imported }, renderSavedSites);
        } catch (err) { alert("Invalid JSON file"); }
    };
    reader.readAsText(file);
});

// --- Dark Mode Toggle ---
darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    chrome.storage.local.set({ darkMode: isDark });
});

// --- Initialization & Matching ---

async function initPopup() {
    chrome.storage.local.get(['darkMode'], (data) => {
        if (data.darkMode) document.body.classList.add('dark');
    });

    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.storage.local.get(['v2Rules'], (data) => {
            const rules = data.v2Rules || [];
            const domain = new URL(tab.url).hostname;

            // Matching priority: 1. Exact URL (highest priority), 2. Domain Match
            const exactMatch = rules.find(r => r.type === 'url' && r.key === tab.url);
            const domainMatch = rules.find(r => r.type === 'domain' && r.key === domain);
            
            const match = exactMatch || domainMatch;
            const isUsingUrlOverride = exactMatch && domainMatch;

            // Show notification if URL rule is overriding domain rule
            if (isUsingUrlOverride) {
                showRulePriorityNotification();
            }

            // Always check for saved rules and apply them
            if (match) {
                // Save the volume before applying (in case it's not 0)
                if (match.vol > 0) {
                    volumeBeforeMute = match.vol;
                }
                // Apply the saved volume rule
                updateVolume(match.vol);
            } else {
                // No saved rule, check if tab has a current volume set
                chrome.runtime.sendMessage({ type: "GET_CURRENT_VOLUME", tabId: tab.id }, (response) => {
                    if (response && response.volume) {
                        if (response.volume > 0) {
                            volumeBeforeMute = response.volume;
                        }
                        slider.value = response.volume;
                        valLabel.innerText = response.volume;
                        
                        // Update mute button state
                        if (response.volume === 0) {
                            isMuted = true;
                            muteBtn.textContent = 'Unmute';
                            muteBtn.style.backgroundColor = '#4CAF50';
                        } else {
                            isMuted = false;
                            muteBtn.textContent = 'Mute';
                            muteBtn.style.backgroundColor = '#cf6679';
                        }
                    }
                });
            }
        });
    }
    renderSavedSites();
    renderActiveTabs();
}

function showRulePriorityNotification() {
    const notification = document.createElement('div');
    notification.id = 'ruleNotification';
    notification.innerHTML = `
        <small style="color: var(--accent-color); display: block; margin-bottom: 10px; padding: 8px; background: var(--secondary-bg); border-radius: 4px; border-left: 3px solid var(--accent-color);">
            ℹ️ Using URL-specific rule (overrides site-wide rule)
        </small>
    `;
    
    // Insert after the volume slider
    const sliderElement = document.getElementById('volumeSlider');
    sliderElement.parentNode.insertBefore(notification, sliderElement.nextSibling);
}

slider.addEventListener('input', (e) => {
    const newVol = parseInt(e.target.value);
    // If user manually moves slider away from 0, save it as the pre-mute volume
    if (newVol > 0 && !isMuted) {
        volumeBeforeMute = newVol;
    }
    updateVolume(newVol);
});

muteBtn.addEventListener('click', () => {
    if (isMuted) {
        // Unmute: restore previous volume
        updateVolume(volumeBeforeMute);
    } else {
        // Mute: save current volume and set to 0
        volumeBeforeMute = parseInt(slider.value);
        updateVolume(0);
    }
});
resetAllBtn.addEventListener('click', () => {
    if(confirm("Delete all rules?")) chrome.storage.local.set({ v2Rules: [] }, renderSavedSites);
});
savedListContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
        const idx = e.target.getAttribute('data-index');
        chrome.storage.local.get(['v2Rules'], (data) => {
            const rules = data.v2Rules;
            rules.splice(idx, 1);
            chrome.storage.local.set({ v2Rules: rules }, renderSavedSites);
        });
    }
});

initPopup();