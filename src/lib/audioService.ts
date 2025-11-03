// Audio service to communicate with offscreen document
// This allows audio to continue playing when side panel is closed

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
}

type AudioStateListener = (state: AudioState) => void;

class AudioService {
  private listeners: Set<AudioStateListener> = new Set();
  private currentState: AudioState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    isMuted: false,
  };
  private messageListenerInitialized = false;

  constructor() {
    // Don't initialize Chrome APIs in constructor - do it lazily when needed
  }

  private initializeMessageListener() {
    if (this.messageListenerInitialized) {
      return;
    }

    // Listen for state updates from offscreen document
    // Check if chrome.runtime is available (may not be during build or in some contexts)
    if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
      try {
        chrome.runtime.onMessage.addListener((message) => {
          if (message.type === 'AUDIO_STATE_UPDATE' && message.state) {
            this.currentState = message.state;
            this.notifyListeners();
          }
        });
        this.messageListenerInitialized = true;
      } catch (error) {
        console.error('Failed to initialize message listener:', error);
      }
    }
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener({ ...this.currentState });
      } catch (error) {
        console.error('Error in audio state listener:', error);
      }
    });
  }

  // Send message to offscreen document (messages broadcast to all listeners)
  private async sendMessageToOffscreen(message: any): Promise<any> {
    // Initialize message listener on first use
    this.initializeMessageListener();

    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
      return Promise.reject(new Error('Chrome runtime API is not available'));
    }

    // Ensure offscreen document exists before sending messages
    await this.ensureOffscreenDocument();

    console.log('[AudioService] Sending message:', message.type, message);

    return new Promise((resolve, reject) => {
      // Set a timeout for the message
      const timeout = setTimeout(() => {
        console.error('[AudioService] Message timeout for:', message.type);
        reject(new Error('Message timeout: No response received'));
      }, 5000);

      // Messages sent via chrome.runtime.sendMessage are received by all listeners
      // including the offscreen document
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeout);
        const error = chrome.runtime.lastError;
        
        console.log('[AudioService] Message response:', message.type, { response, error: error?.message });
        
        if (error) {
          // If the port closed or there's an error, try to create offscreen and retry
          const errorMsg = error.message || 'Unknown error';
          console.warn('[AudioService] Message error:', message.type, errorMsg);
          if (message.type !== 'CREATE_OFFSCREEN' && !errorMsg.includes('Could not establish connection')) {
            this.ensureOffscreenDocument().then(() => {
              // Wait a bit for offscreen to be ready
              setTimeout(() => {
                chrome.runtime.sendMessage(message, (retryResponse) => {
                  const retryError = chrome.runtime.lastError;
                  if (retryError) {
                    reject(new Error(retryError.message || 'Retry failed'));
                  } else if (retryResponse === undefined) {
                    // No response but no error - might be a one-way message
                    resolve({ success: true });
                  } else {
                    resolve(retryResponse);
                  }
                });
              }, 200);
            }).catch((err) => {
              reject(new Error(err instanceof Error ? err.message : errorMsg));
            });
          } else {
            reject(new Error(errorMsg));
          }
        } else if (response === undefined) {
          // No response but no error - might be a one-way message
          resolve({ success: true });
        } else {
          resolve(response);
        }
      });
    });
  }

  // Ensure offscreen document is created and ready
  async ensureOffscreenDocument(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.offscreen || !chrome.runtime) {
      throw new Error('Chrome APIs are not available');
    }

    try {
      // The background script creates it automatically, but we can check
      let hasDocument = await chrome.offscreen.hasDocument();
      console.log('[AudioService] Offscreen document exists:', hasDocument);
      if (!hasDocument) {
        console.log('[AudioService] Creating offscreen document...');
        // Trigger background script to create it
        await new Promise<void>((resolve, reject) => {
          let resolved = false;
          const safeResolve = () => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          };
          const safeReject = (err: Error) => {
            if (!resolved) {
              resolved = true;
              reject(err);
            }
          };
          
          chrome.runtime.sendMessage({ type: 'CREATE_OFFSCREEN' }, () => {
            const error = chrome.runtime.lastError;
            if (error) {
              const errorMsg = error.message || 'Unknown error';
              if (!errorMsg.includes('message port closed')) {
                safeReject(new Error(errorMsg));
              } else {
                // Port closed is okay, wait for document creation
                setTimeout(() => safeResolve(), 300);
              }
            } else {
              // Wait a bit for the document to be created
              setTimeout(() => safeResolve(), 300);
            }
          });
          
          // Fallback: If no response after 500ms, assume it's being created
          setTimeout(() => safeResolve(), 500);
        });
        
        // Verify it exists now
        hasDocument = await chrome.offscreen.hasDocument();
      }

      // Ping the offscreen document to ensure it's ready (but don't fail if it doesn't respond)
      if (hasDocument) {
        try {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              // Timeout - assume it's still loading
              resolve();
            }, 1000);

            chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
              clearTimeout(timeout);
              const error = chrome.runtime.lastError;
              if (!error && response && response.ready) {
                // Got a successful ping response
                resolve();
              } else {
                // No response or error - wait a bit then proceed
                setTimeout(() => resolve(), 200);
              }
            });
          });
        } catch (error) {
          // If ping fails, just wait a bit and proceed anyway
          console.warn('Offscreen ping failed, proceeding anyway:', error);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    } catch (error) {
      console.error('Error ensuring offscreen document:', error);
      // Wait a bit and hope it's created by background script
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Load audio URL
  async loadAudio(url: string): Promise<void> {
    await this.ensureOffscreenDocument();
    
    try {
      const response = await this.sendMessageToOffscreen({
        type: 'LOAD_AUDIO',
        url,
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to load audio');
      }
    } catch (error) {
      console.error('Error loading audio:', error);
      throw error;
    }
  }

  // Play audio
  async play(): Promise<void> {
    await this.ensureOffscreenDocument();
    
    try {
      const response = await this.sendMessageToOffscreen({
        type: 'PLAY',
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to play audio');
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      throw error;
    }
  }

  // Pause audio
  async pause(): Promise<void> {
    try {
      const response = await this.sendMessageToOffscreen({
        type: 'PAUSE',
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to pause audio');
      }
    } catch (error) {
      console.error('Error pausing audio:', error);
      throw error;
    }
  }

  // Set current time
  async setTime(time: number): Promise<void> {
    try {
      const response = await this.sendMessageToOffscreen({
        type: 'SET_TIME',
        time,
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to set time');
      }
    } catch (error) {
      console.error('Error setting time:', error);
      throw error;
    }
  }

  // Set volume (0-1)
  async setVolume(volume: number): Promise<void> {
    try {
      const response = await this.sendMessageToOffscreen({
        type: 'SET_VOLUME',
        volume,
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to set volume');
      }
      
      this.currentState.volume = volume;
      this.currentState.isMuted = volume === 0;
      this.notifyListeners();
    } catch (error) {
      console.error('Error setting volume:', error);
      throw error;
    }
  }

  // Set muted state
  async setMuted(muted: boolean): Promise<void> {
    try {
      const response = await this.sendMessageToOffscreen({
        type: 'SET_MUTED',
        muted,
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to set muted');
      }
      
      this.currentState.isMuted = muted;
      this.notifyListeners();
    } catch (error) {
      console.error('Error setting muted:', error);
      throw error;
    }
  }

  // Get current state
  async getState(): Promise<AudioState> {
    try {
      const response = await this.sendMessageToOffscreen({
        type: 'GET_STATE',
      });
      
      if (response && response.success && response.state) {
        this.currentState = response.state;
        return { ...this.currentState };
      }
      
      return { ...this.currentState };
    } catch (error) {
      console.error('Error getting state:', error);
      return { ...this.currentState };
    }
  }

  // Subscribe to state updates
  onStateUpdate(listener: AudioStateListener): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Get current state synchronously (may be stale)
  getCurrentState(): AudioState {
    return { ...this.currentState };
  }
}

// Create singleton instance
// Constructor is safe - it doesn't access Chrome APIs immediately
// Chrome APIs are initialized lazily when methods are first called
export const audioService = new AudioService();

