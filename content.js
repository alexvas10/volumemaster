// content.js
if (!window.audioCtx) {
    window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    window.gainNode = window.audioCtx.createGain();
    
    const mediaElements = document.querySelectorAll('video, audio');
    if (mediaElements.length > 0) {
        window.source = window.audioCtx.createMediaElementSource(mediaElements[0]);
        window.source.connect(window.gainNode);
        window.gainNode.connect(window.audioCtx.destination);
    }
}

// Listen for volume changes
chrome.runtime.onMessage.addListener((request) => {
    if (request.volume !== undefined) {
        if (window.audioCtx.state === 'suspended') {
            window.audioCtx.resume();
        }
        window.gainNode.gain.value = request.volume / 100;
    }
});