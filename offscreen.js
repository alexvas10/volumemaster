const tabAudioData = {}; // Stores context, gainNode, and stream per tabId

chrome.runtime.onMessage.addListener(async (message) => {
  const { tabId, volume, streamId } = message;

  if (message.type === 'START_CAPTURE') {
    console.log(`Starting capture for tab ${tabId} at volume ${volume}%`);
    
    if (!tabAudioData[tabId]) {
      try {
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
        
        // Set initial volume
        gainNode.gain.setTargetAtTime(volume / 100, audioContext.currentTime, 0.01);
        console.log(`Tab ${tabId} capture started successfully`);
      } catch (error) {
        console.error(`Failed to start capture for tab ${tabId}:`, error);
      }
    }
  }

  if (message.type === 'UPDATE_VOLUME') {
    console.log(`Updating volume for tab ${tabId} to ${volume}%`);
    
    const data = tabAudioData[tabId];
    if (data) {
      data.gainNode.gain.setTargetAtTime(volume / 100, data.audioContext.currentTime, 0.01);
      console.log(`Tab ${tabId} volume updated successfully`);
    } else {
      console.warn(`No audio data found for tab ${tabId}, cannot update volume`);
    }
  }

  if (message.type === 'STOP_CAPTURE') {
    console.log(`Stopping capture for tab ${tabId}`);
    
    const data = tabAudioData[tabId];
    if (data) {
      data.stream.getAudioTracks().forEach(track => track.stop());
      data.audioContext.close();
      delete tabAudioData[tabId];
      console.log(`Tab ${tabId} capture stopped successfully`);
    }
  }
});