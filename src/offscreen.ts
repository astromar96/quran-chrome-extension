// Offscreen document for audio playback
// This allows audio to continue playing even when the side panel is closed

let audio: HTMLAudioElement | null = null;
let currentState: {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  url: string | null;
} = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1.0,
  isMuted: false,
  url: null,
};

// Load volume preference on initialization
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['volume']).then((result) => {
    if (result.volume !== undefined) {
      const savedVolume = parseFloat(result.volume);
      if (!isNaN(savedVolume) && savedVolume >= 0 && savedVolume <= 1) {
        currentState.volume = savedVolume;
      }
    }
  }).catch((error) => {
    console.warn('[Offscreen] Failed to load volume preference:', error);
  });
} else {
  console.warn('[Offscreen] Chrome storage API not available');
}

// Create audio element
function createAudioElement() {
  if (audio) {
    return audio;
  }
  
  audio = new Audio();
  audio.preload = 'auto';
  audio.volume = currentState.volume;
  
  // Event listeners
  audio.addEventListener('play', () => {
    currentState.isPlaying = true;
    broadcastState();
  });
  
  audio.addEventListener('pause', () => {
    currentState.isPlaying = false;
    broadcastState();
  });
  
  audio.addEventListener('timeupdate', () => {
    if (audio) {
      currentState.currentTime = audio.currentTime;
      broadcastState();
    }
  });
  
  audio.addEventListener('loadedmetadata', () => {
    if (audio) {
      currentState.duration = audio.duration;
      broadcastState();
    }
  });
  
  audio.addEventListener('durationchange', () => {
    if (audio && audio.duration && isFinite(audio.duration)) {
      currentState.duration = audio.duration;
      broadcastState();
    }
  });
  
  audio.addEventListener('ended', async () => {
    if (audio) {
      currentState.isPlaying = false;
      currentState.currentTime = 0;
      broadcastState();
      
      // Notify background script about track ending
      chrome.runtime.sendMessage({
        type: 'AUDIO_ENDED'
      });
    }
  });
  
  audio.addEventListener('error', () => {
    console.error('Audio error:', audio?.error);
    chrome.runtime.sendMessage({
      type: 'AUDIO_ERROR',
      error: audio?.error ? {
        code: audio.error.code,
        message: audio.error.message
      } : null
    });
  });
  
  return audio;
}

// Broadcast current state to all listeners
function broadcastState() {
  chrome.runtime.sendMessage({
    type: 'AUDIO_STATE_UPDATE',
    state: {
      isPlaying: currentState.isPlaying,
      currentTime: currentState.currentTime,
      duration: currentState.duration,
      volume: currentState.volume,
      isMuted: currentState.isMuted,
    }
  });
}

// Handle messages from background script or side panel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message.type, message);
  
  switch (message.type) {
    case 'LOAD_AUDIO': {
      const { url } = message;
      if (!url) {
        sendResponse({ success: false, error: 'No URL provided' });
        return false;
      }
      
      const audioElement = createAudioElement();
      
      // If same URL, don't reload
      if (currentState.url === url && audioElement.src === url) {
        sendResponse({ success: true });
        return false;
      }
      
      currentState.url = url;
      currentState.isPlaying = false;
      currentState.currentTime = 0;
      
      audioElement.pause();
      audioElement.src = url;
      
      // Track if we've already responded
      let hasResponded = false;
      const safeSendResponse = (response: any) => {
        if (!hasResponded) {
          hasResponded = true;
          sendResponse(response);
        }
      };
      
      // Wait for audio to load before responding
      const handleCanPlay = () => {
        audioElement.removeEventListener('canplay', handleCanPlay);
        audioElement.removeEventListener('error', handleError);
        safeSendResponse({ success: true });
      };
      
      const handleError = () => {
        audioElement.removeEventListener('canplay', handleCanPlay);
        audioElement.removeEventListener('error', handleError);
        safeSendResponse({ success: false, error: 'Failed to load audio' });
      };
      
      audioElement.addEventListener('canplay', handleCanPlay);
      audioElement.addEventListener('error', handleError);
      audioElement.load();
      
      // Timeout after 5 seconds
      setTimeout(() => {
        audioElement.removeEventListener('canplay', handleCanPlay);
        audioElement.removeEventListener('error', handleError);
        // If we haven't responded yet, send a success (audio might still be loading)
        if (audioElement.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          safeSendResponse({ success: true });
        } else {
          safeSendResponse({ success: false, error: 'Audio load timeout' });
        }
      }, 5000);
      
      return true; // Keep channel open for async response
    }
    
    case 'PLAY': {
      const audioElement = createAudioElement();
      if (!currentState.url && !audioElement.src) {
        sendResponse({ success: false, error: 'No audio loaded' });
        return false;
      }
      
      audioElement.play()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // Keep channel open for async response
    }
    
    case 'PAUSE': {
      if (audio) {
        audio.pause();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Audio not initialized' });
      }
      return false;
    }
    
    case 'SET_TIME': {
      const { time } = message;
      if (audio && isFinite(time) && time >= 0) {
        audio.currentTime = time;
        currentState.currentTime = time;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Invalid time' });
      }
      return false;
    }
    
    case 'SET_VOLUME': {
      const { volume } = message;
      if (isFinite(volume) && volume >= 0 && volume <= 1) {
        currentState.volume = volume;
        if (audio) {
          audio.volume = volume;
        }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ volume: volume.toString() }).catch((error) => {
            console.warn('[Offscreen] Failed to save volume:', error);
          });
        }
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Invalid volume' });
      }
      return false;
    }
    
    case 'SET_MUTED': {
      const { muted } = message;
      currentState.isMuted = muted;
      if (audio) {
        audio.volume = muted ? 0 : currentState.volume;
      }
      sendResponse({ success: true });
      return false;
    }
    
    case 'GET_STATE': {
      sendResponse({
        success: true,
        state: {
          isPlaying: currentState.isPlaying,
          currentTime: currentState.currentTime,
          duration: currentState.duration,
          volume: currentState.volume,
          isMuted: currentState.isMuted,
        }
      });
      return false;
    }
    
    case 'PING':
      // Simple ping to check if offscreen is ready
      console.log('[Offscreen] PING received, responding');
      sendResponse({ success: true, ready: true });
      return false;
    
    default:
      return false; // Don't handle unknown messages
  }
});

// Initialize audio element
createAudioElement();
console.log('[Offscreen] Audio element created, offscreen document ready');

// Notify that offscreen document is ready
chrome.runtime.sendMessage({
  type: 'OFFSCREEN_READY'
}).then(() => {
  console.log('[Offscreen] Ready notification sent');
}).catch((err) => {
  console.warn('[Offscreen] Failed to send ready notification:', err);
});

// Broadcast state periodically (every 250ms for smooth updates)
setInterval(() => {
  if (audio && currentState.isPlaying) {
    broadcastState();
  }
}, 250);

