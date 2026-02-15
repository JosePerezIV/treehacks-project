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
            analysis
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
    const companyData = parseClaudeResponse(text);

    // Calculate alignment score using transparent algorithm
    const scoreResult = calculateAlignmentScore(companyData, userPreferences);

    // Combine company data with calculated score
    const analysis = {
      ...companyData,
      alignmentScore: scoreResult.score,
      scoreBreakdown: scoreResult.breakdown,
      concerns: companyData.factualConcerns || [] // Map factualConcerns to concerns for compatibility
    };

    console.log('Vinegar API: Parsed analysis:', analysis);
    console.log('Vinegar API: Alignment score:', scoreResult.score, 'Breakdown:', scoreResult.breakdown);

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
 * Find real local alternatives using Google Places API (New)
 */
async function findLocalAlternatives(productCategory, userLocation, analysis) {
  console.log('Finding local alternatives:', { productCategory, userLocation, analysis });

  if (!userLocation || !userLocation.lat || !userLocation.lon) {
    console.log('No user location available, skipping Google Places search');
    return [];
  }

  if (!CONFIG.GOOGLE_PLACES_API_KEY) {
    console.error('Google Places API key not configured');
    return [];
  }

  try {
    const allPlaces = [];
    const seenPlaceIds = new Set();

    // Strategy 1: Search by specific store types from Claude
    const storeTypes = analysis.suggestedStoreTypes || [];
    for (const storeType of storeTypes.slice(0, 2)) {
      console.log('Strategy 1: Searching by store type:', storeType);
      const places = await searchPlacesByType(userLocation, storeType, analysis.googlePlacesTypes);
      addUniquePlaces(allPlaces, places, seenPlaceIds);
    }

    // Strategy 2: Search by store names (chains like REI, Whole Foods, etc.)
    const storeNames = analysis.suggestedStoreNames || [];
    for (const storeName of storeNames.slice(0, 2)) {
      console.log('Strategy 2: Searching by store name:', storeName);
      const places = await searchPlacesByName(userLocation, storeName);
      addUniquePlaces(allPlaces, places, seenPlaceIds);
    }

    // Strategy 3: Generic search by product category if we don't have enough
    if (allPlaces.length < 3 && productCategory) {
      console.log('Strategy 3: Generic search by category:', productCategory);
      const places = await searchPlacesByType(userLocation, productCategory, ['store']);
      addUniquePlaces(allPlaces, places, seenPlaceIds);
    }

    // Filter and score places by relevance
    const filteredPlaces = filterAndScorePlaces(allPlaces, productCategory, analysis);

    console.log('Found local alternatives:', filteredPlaces.length);
    return filteredPlaces.slice(0, 6); // Return top 6

  } catch (error) {
    console.error('Error finding local alternatives:', error);
    return [];
  }
}

/**
 * Search places by type/keyword
 */
async function searchPlacesByType(userLocation, searchTerm, includedTypes = ['store']) {
  const url = 'https://places.googleapis.com/v1/places:searchText';

  const requestBody = {
    textQuery: searchTerm,
    locationBias: {
      circle: {
        center: {
          latitude: userLocation.lat,
          longitude: userLocation.lon
        },
        radius: 8000.0
      }
    },
    maxResultCount: 10
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': CONFIG.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating,places.id,places.types,places.businessStatus'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error('Google Places API error:', response.status);
      return [];
    }

    const data = await response.json();
    return data.places || [];
  } catch (error) {
    console.error('Error in searchPlacesByType:', error);
    return [];
  }
}

/**
 * Search places by specific name
 */
async function searchPlacesByName(userLocation, storeName) {
  return await searchPlacesByType(userLocation, storeName, []);
}

/**
 * Add unique places to the list
 */
function addUniquePlaces(allPlaces, newPlaces, seenPlaceIds) {
  for (const place of newPlaces) {
    if (!seenPlaceIds.has(place.id)) {
      seenPlaceIds.add(place.id);
      allPlaces.push(place);
    }
  }
}

/**
 * Filter and score places by relevance
 */
function filterAndScorePlaces(places, productCategory, analysis) {
  const categoryLower = productCategory.toLowerCase();

  // Irrelevant types to filter out
  const irrelevantTypes = [
    'library', 'school', 'university', 'hospital', 'church', 'mosque',
    'synagogue', 'cemetery', 'park', 'stadium', 'museum', 'art_gallery',
    'movie_theater', 'bowling_alley', 'casino', 'night_club', 'bar'
  ];

  return places
    .filter(place => {
      // Filter out closed businesses
      if (place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY') {
        return false;
      }

      // Filter out irrelevant types
      const placeTypes = place.types || [];
      if (placeTypes.some(type => irrelevantTypes.includes(type))) {
        return false;
      }

      return true;
    })
    .map(place => {
      const placeTypes = place.types || [];
      let relevanceScore = 0;

      // Score based on place types matching product category
      const relevantTypes = {
        'sporting_goods_store': ['water bottle', 'fitness', 'outdoor', 'camping', 'sports'],
        'clothing_store': ['clothing', 'apparel', 'shirt', 'pants', 'dress', 'fashion'],
        'grocery_store': ['food', 'grocery', 'snack', 'beverage', 'coffee', 'tea'],
        'supermarket': ['food', 'grocery', 'snack', 'beverage'],
        'convenience_store': ['snack', 'beverage', 'coffee'],
        'home_goods_store': ['home', 'kitchen', 'furniture', 'decor'],
        'electronics_store': ['electronics', 'phone', 'computer', 'tech'],
        'book_store': ['book', 'reading', 'magazine']
      };

      for (const [storeType, keywords] of Object.entries(relevantTypes)) {
        if (placeTypes.includes(storeType)) {
          if (keywords.some(kw => categoryLower.includes(kw))) {
            relevanceScore += 10;
          } else {
            relevanceScore += 2;
          }
        }
      }

      // Boost score if it's a general store
      if (placeTypes.includes('store')) {
        relevanceScore += 1;
      }

      // Add the place with relevance score
      return {
        ...place,
        relevanceScore,
        name: place.displayName?.text || place.displayName || 'Local Store',
        address: place.formattedAddress || 'Address unavailable',
        rating: place.rating || 4.0,
        lat: place.location?.latitude,
        lon: place.location?.longitude,
        placeId: place.id,
        type: 'local',
        typeLabel: 'Local Business',
        isReal: true,
        googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.id}`
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore); // Sort by relevance
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

Analyze this product and provide FACTUAL information (do NOT calculate a score):

1. Parent company that manufactures or owns this product
2. Company size category:
   - "mega-corp" if revenue > $100B (Amazon, Walmart, Nestlé)
   - "large-corp" if revenue $10B-$100B (Target, Nike)
   - "medium-corp" if revenue $1B-$10B
   - "small-business" if revenue < $1B or unknown
3. Ownership type: "publicly-traded", "private-equity", "family-owned", "co-op", "b-corp"
4. FACTUAL company practices with dates/sources (be specific and neutral!):
   - Labor: "2021 warehouse worker strike", "2019 wage theft lawsuit"
   - Environment: "2020 EPA violation fine", "2022 plastic pollution lawsuit"
   - Competition: "2018 FTC antitrust investigation"
   Only include documented, verifiable information with approximate dates
5. Certifications: ["B-Corp", "Fair Trade", "Carbon Neutral"] or [] if none
6. Product category (specific)
7. Store types that sell this product locally
8. Brief, factual explanation of why someone might consider alternatives for this type of product
   - Focus on FACTS and IMPACT, not moral judgments
   - Example: "Supporting local businesses generates 3x more local economic activity"
   - Example: "Small businesses account for 65% of new jobs in this sector"

Return ONLY valid JSON (no markdown, no code blocks):
{
  "parentCompany": "Company Name",
  "companySize": "mega-corp|large-corp|medium-corp|small-business",
  "ownershipType": "publicly-traded|private-equity|family-owned|co-op",
  "factualConcerns": ["factual practice with date", "another practice"],
  "certifications": [],
  "productCategory": "specific category",
  "subsidiaries": ["other brands owned by parent"],
  "impactExplanation": "Factual, empowering explanation of choosing alternatives (2-3 sentences).",
  "suggestedStoreTypes": ["specific store type"],
  "suggestedStoreNames": ["chain name"],
  "googlePlacesTypes": ["store"]
}

Important: Provide FACTS only. Be neutral and informative, not preachy. The alignment score will be calculated algorithmically.
Return ONLY the JSON object, no other text.`;
}

/**
 * Calculate alignment score based on transparent criteria
 */
function calculateAlignmentScore(companyData, userPreferences) {
  let score = 100; // Start with perfect score
  const breakdown = [];

  // Company Size Penalty
  const companySize = companyData.companySize?.toLowerCase() || '';
  if (companySize.includes('mega') || companySize.includes('>100b')) {
    score -= 15;
    breakdown.push({ reason: 'Mega-corporation (>$100B revenue)', change: -15 });
  } else if (companySize.includes('large') || companySize.includes('10b-100b')) {
    score -= 10;
    breakdown.push({ reason: 'Large corporation ($10B-$100B)', change: -10 });
  } else if (companySize.includes('medium') || companySize.includes('1b-10b')) {
    score -= 5;
    breakdown.push({ reason: 'Medium corporation ($1B-$10B)', change: -5 });
  } else if (companySize.includes('small') || companySize.includes('<1b')) {
    score += 10;
    breakdown.push({ reason: 'Small business (<$1B)', change: +10 });
  }

  // Ownership Structure
  const ownership = companyData.ownershipType?.toLowerCase() || '';
  if (ownership.includes('publicly-traded') && companySize.includes('mega')) {
    score -= 10;
    breakdown.push({ reason: 'Publicly traded mega-corp', change: -10 });
  } else if (ownership.includes('private equity')) {
    score -= 5;
    breakdown.push({ reason: 'Private equity owned', change: -5 });
  } else if (ownership.includes('family')) {
    score += 10;
    breakdown.push({ reason: 'Family-owned business', change: +10 });
  } else if (ownership.includes('co-op') || ownership.includes('b-corp')) {
    score += 15;
    breakdown.push({ reason: 'Co-op or B-Corp structure', change: +15 });
  }

  // User's Avoided Brands
  const avoidedBrands = userPreferences.avoidedBrands || [];
  const companyName = companyData.parentCompany?.toLowerCase() || '';

  for (const avoidedBrand of avoidedBrands) {
    const brandLower = avoidedBrand.toLowerCase();
    if (companyName.includes(brandLower)) {
      score -= 30;
      breakdown.push({ reason: `On your avoid list: ${avoidedBrand}`, change: -30 });
      break;
    } else if (companyData.subsidiaries?.some(sub => sub.toLowerCase().includes(brandLower))) {
      score -= 25;
      breakdown.push({ reason: `Parent company on avoid list: ${avoidedBrand}`, change: -25 });
      break;
    }
  }

  // Documented Issues
  const concerns = companyData.factualConcerns || [];
  let laborIssues = 0, envIssues = 0, antiCompetitive = 0, political = 0;

  for (const concern of concerns) {
    const concernLower = concern.toLowerCase();
    if ((concernLower.includes('labor') || concernLower.includes('worker') || concernLower.includes('wage')) && laborIssues === 0) {
      score -= 10;
      laborIssues = 1;
      breakdown.push({ reason: 'Documented labor concerns', change: -10 });
    }
    if ((concernLower.includes('environment') || concernLower.includes('pollution') || concernLower.includes('climate')) && envIssues === 0) {
      score -= 10;
      envIssues = 1;
      breakdown.push({ reason: 'Environmental violations', change: -10 });
    }
    if ((concernLower.includes('monopoly') || concernLower.includes('anti-competitive') || concernLower.includes('antitrust')) && antiCompetitive === 0) {
      score -= 5;
      antiCompetitive = 1;
      breakdown.push({ reason: 'Anti-competitive practices', change: -5 });
    }
    if ((concernLower.includes('political') || concernLower.includes('lobbying') || concernLower.includes('controversy')) && political === 0) {
      score -= 5;
      political = 1;
      breakdown.push({ reason: 'Political controversies', change: -5 });
    }
  }

  // Certifications (bonus points)
  const certifications = companyData.certifications || [];
  for (const cert of certifications) {
    const certLower = cert.toLowerCase();
    if (certLower.includes('b-corp') || certLower.includes('b corp')) {
      score += 15;
      breakdown.push({ reason: 'B-Corp certified', change: +15 });
    } else if (certLower.includes('fair trade')) {
      score += 10;
      breakdown.push({ reason: 'Fair Trade certified', change: +10 });
    } else if (certLower.includes('carbon neutral') || certLower.includes('carbon-neutral')) {
      score += 5;
      breakdown.push({ reason: 'Carbon neutral commitment', change: +5 });
    } else if (certLower.includes('living wage')) {
      score += 10;
      breakdown.push({ reason: 'Living wage employer', change: +10 });
    }
  }

  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, score));

  return {
    score: finalScore,
    breakdown: breakdown
  };
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
    if (!parsed.parentCompany) {
      throw new Error('Invalid response structure - missing parentCompany');
    }

    // Ensure arrays exist
    parsed.factualConcerns = parsed.factualConcerns || [];
    parsed.certifications = parsed.certifications || [];
    parsed.subsidiaries = parsed.subsidiaries || [];
    parsed.suggestedStoreTypes = parsed.suggestedStoreTypes || [];
    parsed.suggestedStoreNames = parsed.suggestedStoreNames || [];
    parsed.googlePlacesTypes = parsed.googlePlacesTypes || [];

    // Set defaults for company data
    parsed.companySize = parsed.companySize || 'unknown';
    parsed.ownershipType = parsed.ownershipType || 'unknown';

    return parsed;

  } catch (error) {
    console.error('Vinegar API: Failed to parse response:', error);
    console.error('Vinegar API: Raw text:', text);
    throw new Error('PARSE_ERROR');
  }
}
