/**
 * Vinegar Background Service Worker
 * Handles messaging between content scripts and popup
 */

// Import config (using classic service worker approach, not ES6 modules)
try {
  importScripts('config.js');
  console.log('Vinegar: config.js loaded successfully');
} catch (error) {
  console.error('Vinegar: Failed to load config.js:', error);
}

// Verify API key loaded
console.log('Vinegar: API key loaded:', typeof CONFIG !== 'undefined' && CONFIG?.ANTHROPIC_API_KEY ? 'Yes' : 'No');

if (typeof CONFIG === 'undefined' || !CONFIG || !CONFIG.ANTHROPIC_API_KEY) {
  console.error('Vinegar: CONFIG or API key not found! Make sure config.js exists and is properly formatted.');
  console.error('Vinegar: CONFIG type:', typeof CONFIG);
}

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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);

  // Handle API analysis request from content script
  if (request.action === 'analyzeProduct') {
    console.log('Vinegar: Processing analyzeProduct request for:', request.productName);
    console.log('Vinegar: CONFIG available?', typeof CONFIG !== 'undefined');
    console.log('Vinegar: API key available?', typeof CONFIG !== 'undefined' && CONFIG.ANTHROPIC_API_KEY ? 'Yes' : 'No');

    // Step 1: Analyze with Claude
    analyzeProduct(request.productName, request.userPreferences)
      .then(async analysis => {
        console.log('Vinegar: Analysis successful');

        // Step 2: Find real local alternatives using Google Places
        try {
          const localAlternatives = await findLocalAlternatives(
            analysis.productCategory,
            request.userPreferences.location,
            analysis.suggestedStoreKeywords || []
          );

          // Add local alternatives to the response
          analysis.localAlternatives = localAlternatives;
          console.log('Vinegar: Found', localAlternatives.length, 'local alternatives');
        } catch (placesError) {
          console.error('Vinegar: Google Places error:', placesError);
          analysis.localAlternatives = [];
        }

        console.log('Vinegar: Sending complete response');
        sendResponse(analysis);
      })
      .catch(error => {
        console.error('Vinegar: Analysis failed:', error);
        console.error('Vinegar: Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        sendResponse({ error: error.message });
      });
    return true; // Keep channel open for async response
  }

  // Handle other message types
  const messageType = request.type || request.action;

  switch (messageType) {
    case 'PRODUCT_DETECTED':
      handleProductDetected(request.data, sender);
      break;

    case 'SETTINGS_UPDATED':
      handleSettingsUpdated(request.data);
      break;

    case 'SAVE_ALTERNATIVE':
      handleSaveAlternative(request.data);
      break;

    case 'GET_SETTINGS':
      getSettings().then(sendResponse);
      return true; // Keep channel open for async response

    case 'GET_STATS':
      getStats().then(sendResponse);
      return true;

    default:
      console.warn('Unknown message type:', messageType);
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
    if (sender.tab?.id && typeof sender.tab.id === 'number' && sender.tab.id > 0 && sender.tab.id < 2147483647) {
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
        // Tab might have been closed or doesn't exist - silently ignore
        // (This is expected behavior when tabs are closed quickly)
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

/**
 * Analyze product using Claude API
 * @param {string} productName - Name of the product
 * @param {Object} userPreferences - User's preferences (avoided brands, location, etc.)
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeProduct(productName, userPreferences = {}) {
  console.log('Vinegar API: Analyzing product:', productName);

  // Check if API key is available
  if (!CONFIG || !CONFIG.ANTHROPIC_API_KEY || CONFIG.ANTHROPIC_API_KEY === 'your-api-key-here') {
    throw new Error('API key not configured. Please copy config.example.js to config.js and add your API key.');
  }

  // Detailed logging for debugging
  console.log('API Key being used:', CONFIG.ANTHROPIC_API_KEY.substring(0, 20) + '...');
  console.log('API Key starts with:', CONFIG.ANTHROPIC_API_KEY.substring(0, 14));
  console.log('API Key length:', CONFIG.ANTHROPIC_API_KEY.length);

  try {
    // Build the prompt
    const prompt = buildAnalysisPrompt(productName, userPreferences);

    const url = 'https://api.anthropic.com/v1/messages';
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    };

    console.log('Request URL:', url);
    console.log('Request headers:', JSON.stringify(headers, null, 2));
    console.log('Request body:', JSON.stringify(body, null, 2));

    // Call Claude API
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    console.log('Response status:', response.status);
    console.log('Response status text:', response.statusText);

    if (!response.ok) {
      // Get full error response text
      const errorText = await response.text();
      console.error('Vinegar API: API error response:', errorText);

      // Try to parse as JSON
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
        console.error('Vinegar API: Parsed error:', errorData);
      } catch (e) {
        console.error('Vinegar API: Could not parse error as JSON');
      }

      if (response.status === 429) {
        throw new Error('API_RATE_LIMIT');
      } else if (response.status === 401) {
        throw new Error(`API_ERROR: 401 - Unauthorized. API key may be invalid or expired. Error: ${errorText}`);
      } else {
        throw new Error(`API_ERROR: ${response.status} - ${errorText}`);
      }
    }

    const data = await response.json();
    console.log('Vinegar API: Raw response:', data);

    // Extract text from Claude's response
    const text = data.content[0].text;

    // Parse JSON, stripping markdown if present
    const analysis = parseClaudeResponse(text);

    console.log('Vinegar API: Parsed analysis:', analysis);

    return analysis;

  } catch (error) {
    console.error('Vinegar API: Error during analysis:', error);
    console.error('Vinegar API: Error type:', error.name);
    console.error('Vinegar API: Error message:', error.message);

    // Re-throw with more context if it's a generic fetch error
    if (error.message === 'Failed to fetch') {
      throw new Error('NETWORK_ERROR: Could not connect to Anthropic API. Check your internet connection.');
    }

    throw error;
  }
}

/**
 * Find real local alternatives using Google Places API
 */
async function findLocalAlternatives(productCategory, userLocation, keywords) {
  console.log('Finding local alternatives:', { productCategory, userLocation, keywords });

  if (!userLocation || !userLocation.lat || !userLocation.lon) {
    console.log('No user location available, skipping Google Places search');
    return [];
  }

  if (!CONFIG.GOOGLE_PLACES_API_KEY) {
    console.error('Google Places API key not configured');
    return [];
  }

  try {
    const alternatives = [];

    // Try searching with each keyword
    for (const keyword of keywords.slice(0, 3)) { // Limit to first 3 keywords
      const searchQuery = `${keyword} ${productCategory}`;
      console.log('Searching Google Places for:', searchQuery);

      const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
      url.searchParams.append('location', `${userLocation.lat},${userLocation.lon}`);
      url.searchParams.append('radius', '8000'); // 5 miles in meters
      url.searchParams.append('keyword', searchQuery);
      url.searchParams.append('type', 'store');
      url.searchParams.append('key', CONFIG.GOOGLE_PLACES_API_KEY);

      console.log('Google Places URL:', url.toString());

      const response = await fetch(url);

      if (!response.ok) {
        console.error('Google Places API error:', response.status, response.statusText);
        continue;
      }

      const data = await response.json();
      console.log('Google Places response:', data);

      if (data.status === 'OK' && data.results) {
        // Add results to alternatives
        for (const place of data.results.slice(0, 3)) { // Max 3 per keyword
          alternatives.push({
            name: place.name,
            address: place.vicinity,
            rating: place.rating || 0,
            lat: place.geometry.location.lat,
            lon: place.geometry.location.lng,
            placeId: place.place_id,
            type: 'local',
            typeLabel: 'Local Business',
            isReal: true, // Flag to indicate this is real data
            googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
          });
        }
      } else {
        console.log('Google Places status:', data.status, data.error_message);
      }

      // Break if we have enough alternatives
      if (alternatives.length >= 5) break;
    }

    console.log('Found local alternatives:', alternatives.length);
    return alternatives;

  } catch (error) {
    console.error('Error finding local alternatives:', error);
    return [];
  }
}

/**
 * Build analysis prompt for Claude
 */
function buildAnalysisPrompt(productName, userPreferences) {
  const avoidedBrands = userPreferences.avoidedBrands || [];
  const location = userPreferences.location || null;

  return `You are analyzing a product for ethical shopping purposes. The user is considering buying: "${productName}"

User's preferences:
- Brands to avoid: ${avoidedBrands.length > 0 ? avoidedBrands.join(', ') : 'None specified'}
- Location: ${location ? `${location.display}` : 'Not provided'}

Analyze this product and provide information about:
1. The parent company that manufactures or owns this product
2. An ethical score (0-100) based on labor practices, environmental impact, corporate ethics
3. Key ethical concerns (if any)
4. Product category
5. Types of ethical alternatives available
6. Cost-benefit analysis explaining why choosing alternatives matters
7. Keywords for finding local alternatives

Return ONLY valid JSON with this exact structure (no markdown, no code blocks, no explanation):
{
  "parentCompany": "Company Name",
  "ethicalScore": 0-100,
  "concerns": ["concern1", "concern2", "concern3"],
  "productCategory": "category name",
  "alternativeTypes": ["Local businesses", "Sustainable brands", "Fair trade options"],
  "costBenefitAnalysis": "A persuasive 2-3 sentence explanation of why choosing ethical alternatives for this product matters, focusing on real-world impact.",
  "suggestedStoreKeywords": ["keyword1", "keyword2", "keyword3"]
}

Important: Return ONLY the JSON object, no other text.`;
}

/**
 * Parse Claude's response, stripping markdown if present
 */
function parseClaudeResponse(text) {
  try {
    // Remove markdown code blocks if present
    let cleanText = text.trim();

    // Remove ```json and ``` markers
    cleanText = cleanText.replace(/^```json\s*/i, '');
    cleanText = cleanText.replace(/^```\s*/, '');
    cleanText = cleanText.replace(/```\s*$/, '');

    // Trim again
    cleanText = cleanText.trim();

    // Parse JSON
    const parsed = JSON.parse(cleanText);

    // Validate required fields
    if (!parsed.parentCompany || typeof parsed.ethicalScore !== 'number') {
      throw new Error('Invalid response structure');
    }

    // Ensure arrays exist
    parsed.concerns = parsed.concerns || [];
    parsed.alternativeTypes = parsed.alternativeTypes || [];
    parsed.suggestedStoreKeywords = parsed.suggestedStoreKeywords || [];

    // Clamp ethical score to 0-100
    parsed.ethicalScore = Math.max(0, Math.min(100, parsed.ethicalScore));

    return parsed;

  } catch (error) {
    console.error('Vinegar API: Failed to parse response:', error);
    console.error('Vinegar API: Raw text:', text);
    throw new Error('PARSE_ERROR');
  }
}
