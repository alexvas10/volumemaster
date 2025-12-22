const tabAudioData = {}; // Stores context, gainNode, and stream per tabId

chrome.runtime.onMessage.addListener(async (message) => {
  const { tabId, volume, streamId } = message;

  if (message.type === 'START_CAPTURE') {
    if (!tabAudioData[tabId]) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      });

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      tabAudioData[tabId] = { audioContext, gainNode, stream };
    }
    
    const data = tabAudioData[tabId];
    data.gainNode.gain.setTargetAtTime(volume / 100, data.audioContext.currentTime, 0.01);
  }

  if (message.type === 'UPDATE_VOLUME') {
    const data = tabAudioData[tabId];
    if (data) {
      data.gainNode.gain.setTargetAtTime(volume / 100, data.audioContext.currentTime, 0.01);
    }
  }

  if (message.type === 'STOP_CAPTURE') {
    const data = tabAudioData[tabId];
    if (data) {
      data.stream.getAudioTracks().forEach(track => track.stop());
      data.audioContext.close();
      delete tabAudioData[tabId];
    }
  }
});