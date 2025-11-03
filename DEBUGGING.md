# Debugging Guide for Quran Chrome Extension

This guide will help you debug message passing issues between the side panel, background script, and offscreen document.

## How to View Console Logs

### 1. Side Panel Console (Your React App)
1. Open the extension's side panel
2. Right-click anywhere in the side panel
3. Select "Inspect" or press `F12`
4. Go to the "Console" tab
5. Look for logs prefixed with `[AudioService]`

### 2. Background Script Console
1. Go to `chrome://extensions/`
2. Find your extension
3. Click "Inspect views: service worker" (or similar)
4. This opens the background script console
5. Look for logs prefixed with `[Background]`

### 3. Offscreen Document Console
1. Go to `chrome://extensions/`
2. Find your extension
3. Click "Inspect views: offscreen.html" (or similar)
4. This opens the offscreen document console
5. Look for logs prefixed with `[Offscreen]`

## What to Look For

### Expected Flow:
1. **Background Script**: Should log when creating offscreen document
   - `[Background] Offscreen document exists: false`
   - `[Background] Creating offscreen document...`
   - `[Background] Offscreen document created successfully`

2. **Offscreen Document**: Should log when ready
   - `[Offscreen] Audio element created, offscreen document ready`
   - `[Offscreen] Ready notification sent`

3. **AudioService**: Should log when sending messages
   - `[AudioService] Offscreen document exists: true`
   - `[AudioService] Sending message: GET_STATE` (or LOAD_AUDIO, PLAY, etc.)
   - `[AudioService] Message response: GET_STATE { response: ..., error: ... }`

4. **Offscreen Document**: Should log when receiving messages
   - `[Offscreen] Received message: GET_STATE` (or other message types)

### Common Issues:

#### Issue 1: "Offscreen document exists: false"
- **Problem**: Offscreen document wasn't created
- **Check**: Background script console for errors during creation
- **Solution**: Manually trigger creation by reloading the extension

#### Issue 2: "Message timeout" or "message port closed"
- **Problem**: Offscreen document isn't responding to messages
- **Check**: 
  - Offscreen console to see if messages are being received
  - If messages ARE received but not responded to, check for JavaScript errors
- **Solution**: Check if `sendResponse` is being called correctly

#### Issue 3: Messages received but no response
- **Problem**: Handler might be returning `false` instead of `true` for async operations
- **Check**: Offscreen console to see message type and handler code
- **Solution**: Ensure async handlers return `true` to keep channel open

## Quick Debugging Steps

1. **Reload the extension** in `chrome://extensions/`
2. **Open all three consoles** (side panel, background, offscreen)
3. **Clear all console logs** (right-click → Clear console)
4. **Try to load audio** in the side panel
5. **Watch the logs** in all three consoles to see where the flow breaks

## Checking if Offscreen Document Exists

You can also check programmatically:
1. Open the side panel console
2. Type: `chrome.offscreen.hasDocument().then(console.log)`
3. Should return `true` if the offscreen document exists

## Common Error Messages

- **"The message port closed before a response was received"**: 
  - Offscreen document didn't respond in time
  - Check offscreen console for errors
  
- **"Message timeout: No response received"**:
  - Offscreen document didn't respond within 5 seconds
  - Check if offscreen document is actually running

- **"Chrome runtime API is not available"**:
  - Extension context is invalid
  - Reload the extension

