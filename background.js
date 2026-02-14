/**
 * Vinegar Background Service Worker
 * Handles messaging between content scripts and popup
 */

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Vinegar installed:', details.reason);

  if (details.reason === 'install') {
    // Initialize default settings
    chrome.storage.sync.set({
      settings: {
        supportLocal: true,
        sustainableProducts: true,
        avoidedBrands: [] // Users can add their own brands to avoid
      }
    });

    // Initialize stats
    chrome.storage.local.set({
      stats: {
        alternativesFound: 0,
        localSupport: 0,
        co2Saved: 0
      }
    });

    // Open welcome page
    chrome.tabs.create({
      url: 'https://github.com/yourrepo/vinegar/wiki/welcome'
    });
  }
});

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  switch (message.type) {
    case 'PRODUCT_DETECTED':
      handleProductDetected(message.data, sender);
      break;

    case 'SETTINGS_UPDATED':
      handleSettingsUpdated(message.data);
      break;

    case 'SAVE_ALTERNATIVE':
      handleSaveAlternative(message.data);
      break;

    case 'GET_SETTINGS':
      getSettings().then(sendResponse);
      return true; // Keep channel open for async response

    case 'GET_STATS':
      getStats().then(sendResponse);
      return true;

    default:
      console.warn('Unknown message type:', message.type);
  }
});

/**
 * Handle product detection from content script
 */
async function handleProductDetected(productData, sender) {
  console.log('Product detected:', productData);

  // Update stats
  try {
    const result = await chrome.storage.local.get('stats');
    const stats = result.stats || {
      alternativesFound: 0,
      localSupport: 0,
      co2Saved: 0
    };

    // Increment alternatives found
    stats.alternativesFound += 3; // Mock: 3 alternatives per product
    stats.localSupport += Math.floor(Math.random() * 50) + 10; // Mock local support amount
    stats.co2Saved += Math.floor(Math.random() * 5) + 1; // Mock CO2 saved

    await chrome.storage.local.set({ stats });

    // Update badge to show extension is active
    if (sender.tab?.id) {
      try {
        // Verify tab exists before setting badge
        await chrome.tabs.get(sender.tab.id);

        await chrome.action.setBadgeText({
          text: '✓',
          tabId: sender.tab.id
        });
        await chrome.action.setBadgeBackgroundColor({
          color: '#7ba05b',
          tabId: sender.tab.id
        });
      } catch (tabError) {
        // Tab might have been closed or doesn't exist
        console.log('Could not set badge for tab:', sender.tab.id, tabError.message);
      }
    }
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

/**
 * Handle settings update from popup
 */
async function handleSettingsUpdated(settings) {
  console.log('Settings updated:', settings);

  // Broadcast settings to all content scripts
  const tabs = await chrome.tabs.query({
    url: [
      'https://*.amazon.com/*',
      'https://*.walmart.com/*',
      'https://*.target.com/*',
      'https://*.bestbuy.com/*'
    ]
  });

  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SETTINGS_UPDATED',
      data: settings
    }).catch(err => {
      // Tab might not have content script loaded yet
      console.log('Could not send settings to tab:', tab.id);
    });
  });
}

/**
 * Handle saving an alternative product
 */
async function handleSaveAlternative(alternativeData) {
  console.log('Saving alternative:', alternativeData);

  try {
    const result = await chrome.storage.local.get('savedAlternatives');
    const saved = result.savedAlternatives || [];

    saved.push({
      ...alternativeData,
      savedAt: new Date().toISOString()
    });

    await chrome.storage.local.set({ savedAlternatives: saved });
  } catch (error) {
    console.error('Error saving alternative:', error);
  }
}

/**
 * Get current settings
 */
async function getSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    return result.settings || {
      supportLocal: true,
      sustainableProducts: true,
      avoidedBrands: []
    };
  } catch (error) {
    console.error('Error getting settings:', error);
    return null;
  }
}

/**
 * Get current stats
 */
async function getStats() {
  try {
    const result = await chrome.storage.local.get('stats');
    return result.stats || {
      alternativesFound: 0,
      localSupport: 0,
      co2Saved: 0
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    return null;
  }
}

/**
 * Clear badge when tab is closed or navigated away
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    chrome.action.setBadgeText({ text: '', tabId });
  } catch (error) {
    // Tab already removed, ignore error
    console.log('Could not clear badge for removed tab:', tabId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    const supportedSites = ['amazon.com', 'walmart.com', 'target.com', 'bestbuy.com'];
    const isSupported = supportedSites.some(site => changeInfo.url.includes(site));

    if (!isSupported) {
      try {
        chrome.action.setBadgeText({ text: '', tabId });
      } catch (error) {
        // Tab might not exist, ignore error
        console.log('Could not clear badge for tab:', tabId);
      }
    }
  }
});
