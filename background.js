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
        alternativesFound: 0
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

        // Step 2: Find real local alternatives using Google Places (if enabled)
        let localAlternatives = [];
        const supportLocal = request.userPreferences.supportLocal !== false; // Default true
        if (supportLocal) {
          try {
            localAlternatives = await findLocalAlternatives(
              analysis.productCategory,
              request.userPreferences.location,
              analysis,
              request.currentSite // Pass current site to exclude it
            );
            console.log('Vinegar: Found', localAlternatives.length, 'local alternatives');
          } catch (placesError) {
            console.error('Vinegar: Google Places error:', placesError);
          }
        } else {
          console.log('Vinegar: Local business search disabled by user preference');
        }

        // Step 3: Find small online retailers using web search
        let onlineAlternatives = [];
        try {
          onlineAlternatives = await findSmallOnlineRetailers(
            request.productName,
            analysis.productCategory
          );
          console.log('Vinegar: Found', onlineAlternatives.length, 'online alternatives');
        } catch (searchError) {
          console.error('Vinegar: Web search error:', searchError);
        }

        // Combine alternatives: local first, then online
        analysis.localAlternatives = [...localAlternatives, ...onlineAlternatives];

        console.log('Vinegar: Sending complete response with', analysis.localAlternatives.length, 'total alternatives');
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
      alternativesFound: 0
    };

    // Increment alternatives found
    stats.alternativesFound += 3; // Mock: 3 alternatives per product

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
      alternativesFound: 0
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
  // Silently ignore - tab is already removed
  chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    const supportedSites = ['amazon.com', 'walmart.com', 'target.com', 'bestbuy.com'];
    const isSupported = supportedSites.some(site => changeInfo.url.includes(site));

    if (!isSupported) {
      // Silently ignore if tab doesn't exist
      chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
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

    // Check if company is on user's avoid list (double-check client-side)
    const avoidCheckResult = checkAvoidedBrands(companyData, userPreferences.avoidedBrands || []);
    if (avoidCheckResult.isOnAvoidList) {
      companyData.isOnAvoidList = true;
      companyData.avoidReason = avoidCheckResult.reason;
    }

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
    if (analysis.isOnAvoidList) {
      console.log('Vinegar API: ⚠️  AVOIDED BRAND DETECTED:', analysis.avoidReason);
    }

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
 * Determine search radius based on location (urban/suburban/rural heuristic)
 */
function determineSearchRadius(userLocation) {
  // Major US cities (rough lat/lon bounds) - use smaller radius
  const majorCities = [
    { name: 'SF Bay Area', latMin: 37.2, latMax: 37.9, lonMin: -122.6, lonMax: -121.7, radius: 5000 },
    { name: 'NYC', latMin: 40.5, latMax: 40.9, lonMin: -74.3, lonMax: -73.7, radius: 5000 },
    { name: 'LA', latMin: 33.7, latMax: 34.3, lonMin: -118.7, lonMax: -118.1, radius: 5000 },
    { name: 'Chicago', latMin: 41.6, latMax: 42.0, lonMin: -87.9, lonMax: -87.5, radius: 5000 },
    { name: 'Boston', latMin: 42.2, latMax: 42.5, lonMin: -71.3, lonMax: -70.9, radius: 5000 },
    { name: 'Seattle', latMin: 47.4, latMax: 47.8, lonMin: -122.5, lonMax: -122.2, radius: 5000 },
  ];

  // Check if user is in a major city
  for (const city of majorCities) {
    if (userLocation.lat >= city.latMin && userLocation.lat <= city.latMax &&
        userLocation.lon >= city.lonMin && userLocation.lon <= city.lonMax) {
      console.log(`User in ${city.name} - using urban radius: ${city.radius}m`);
      return city.radius;
    }
  }

  // Default: suburban radius
  console.log('User in suburban/rural area - using larger radius: 10000m');
  return 10000; // ~6 miles
}

/**
 * Find real local alternatives using Google Places API (New)
 */
async function findLocalAlternatives(productCategory, userLocation, analysis, currentSite = null) {
  console.log('Finding local alternatives:', { productCategory, userLocation, analysis, currentSite });

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

    // Determine search radius based on location
    const searchRadius = determineSearchRadius(userLocation);

    // Strategy 1: Search by specific store types from Claude
    const storeTypes = analysis.suggestedStoreTypes || [];
    for (const storeType of storeTypes.slice(0, 2)) {
      console.log('Strategy 1: Searching by store type:', storeType);
      const places = await searchPlacesByType(userLocation, storeType, analysis.googlePlacesTypes, searchRadius);
      addUniquePlaces(allPlaces, places, seenPlaceIds);
    }

    // Strategy 2: Search by store names (chains like REI, Whole Foods, etc.)
    const storeNames = analysis.suggestedStoreNames || [];
    for (const storeName of storeNames.slice(0, 2)) {
      console.log('Strategy 2: Searching by store name:', storeName);
      const places = await searchPlacesByName(userLocation, storeName, searchRadius);
      addUniquePlaces(allPlaces, places, seenPlaceIds);
    }

    // Strategy 3: Generic search by product category if we don't have enough
    if (allPlaces.length < 3 && productCategory) {
      console.log('Strategy 3: Generic search by category:', productCategory);
      const places = await searchPlacesByType(userLocation, productCategory, ['store'], searchRadius);
      addUniquePlaces(allPlaces, places, seenPlaceIds);
    }

    // Filter and score places by relevance
    const filteredPlaces = filterAndScorePlaces(allPlaces, productCategory, analysis, currentSite);

    console.log('Found local alternatives:', filteredPlaces.length);
    return filteredPlaces.slice(0, 3); // Return top 3 highest quality

  } catch (error) {
    console.error('Error finding local alternatives:', error);
    return [];
  }
}

/**
 * Search places by type/keyword
 */
async function searchPlacesByType(userLocation, searchTerm, includedTypes = ['store'], searchRadius = 8000) {
  const url = 'https://places.googleapis.com/v1/places:searchText';

  const requestBody = {
    textQuery: searchTerm,
    locationBias: {
      circle: {
        center: {
          latitude: userLocation.lat,
          longitude: userLocation.lon
        },
        radius: searchRadius
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
async function searchPlacesByName(userLocation, storeName, searchRadius = 8000) {
  return await searchPlacesByType(userLocation, storeName, [], searchRadius);
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
function filterAndScorePlaces(places, productCategory, analysis, currentSite = null) {
  const categoryLower = productCategory.toLowerCase();
  const currentSiteLower = currentSite ? currentSite.toLowerCase() : '';

  // Big box retailers to ALWAYS filter out (the whole point is avoiding these!)
  const bigBoxRetailers = [
    'walmart', 'target', 'best buy', 'bestbuy', 'amazon',
    'home depot', 'homedepot', "lowe's", 'lowes', 'costco',
    'sam\'s club', 'sams club', 'bj\'s', 'bjs wholesale',
    'kohls', "kohl's", 'jcpenney', 'jc penney', 'sears',
    'macy\'s', 'macys', 'dick\'s sporting goods', 'dicks sporting goods',
    'staples', 'office depot', 'petsmart', 'petco', 'cvs', 'walgreens'
  ];

  // Irrelevant types to filter out
  const irrelevantTypes = [
    'library', 'school', 'university', 'hospital', 'church', 'mosque',
    'synagogue', 'cemetery', 'park', 'stadium', 'museum', 'art_gallery',
    'movie_theater', 'bowling_alley', 'casino', 'night_club', 'bar',
    'furniture_store', 'car_dealer', 'car_repair', 'gas_station',
    'atm', 'bank', 'insurance_agency', 'real_estate_agency'
  ];

  // Category-specific filtering
  const categorySpecificFilters = {};

  // For luggage/bags, exclude furniture and general leather stores
  if (categoryLower.includes('luggage') || categoryLower.includes('bag') || categoryLower.includes('travel')) {
    categorySpecificFilters.exclude = ['furniture_store'];
    categorySpecificFilters.excludeNames = ['furniture', 'sofa', 'couch'];
  }

  // For water bottles, exclude plumbing and industrial
  if (categoryLower.includes('bottle') || categoryLower.includes('drinkware')) {
    categorySpecificFilters.exclude = ['plumber', 'hardware_store'];
    categorySpecificFilters.excludeNames = ['plumbing', 'supply'];
  }

  return places
    .filter(place => {
      // Filter out closed businesses
      if (place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY') {
        return false;
      }

      // CRITICAL: Filter out current retailer (don't show Best Buy when on bestbuy.com)
      if (currentSiteLower) {
        const placeName = (place.displayName?.text || '').toLowerCase();
        if (placeName.includes(currentSiteLower) || currentSiteLower.includes(placeName.split(' ')[0])) {
          console.log('Filtered out', place.displayName?.text, '- current retailer');
          return false;
        }
      }

      // CRITICAL: Filter out ALL big box retailers (the point is to avoid them!)
      const placeName = (place.displayName?.text || '').toLowerCase();
      for (const retailer of bigBoxRetailers) {
        if (placeName.includes(retailer)) {
          console.log('Filtered out', place.displayName?.text, '- big box retailer');
          return false;
        }
      }

      // Filter out irrelevant types
      const placeTypes = place.types || [];
      if (placeTypes.some(type => irrelevantTypes.includes(type))) {
        return false;
      }

      // Category-specific filtering
      if (categorySpecificFilters.exclude) {
        if (placeTypes.some(type => categorySpecificFilters.exclude.includes(type))) {
          console.log('Filtered out', place.displayName?.text, '- excluded type');
          return false;
        }
      }

      // Filter by name keywords
      if (categorySpecificFilters.excludeNames) {
        const placeName = (place.displayName?.text || '').toLowerCase();
        if (categorySpecificFilters.excludeNames.some(keyword => placeName.includes(keyword))) {
          console.log('Filtered out', place.displayName?.text, '- excluded keyword in name');
          return false;
        }
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
        address: (place.formattedAddress && place.formattedAddress !== 'undefined') ? place.formattedAddress : null,
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

  // Build detailed location context
  let locationContext = 'Not provided';
  if (location && location.lat && location.lon) {
    locationContext = `${location.display} (${location.lat.toFixed(4)}, ${location.lon.toFixed(4)})`;
  }

  return `You are analyzing a product for shopping insights. The user is considering buying: "${productName}"

User's context:
- Brands to avoid: ${avoidedBrands.length > 0 ? avoidedBrands.join(', ') : 'None specified'}
- Location: ${locationContext}

${location ? `
IMPORTANT: The user is in ${location.display}. Make your analysis location-aware:
- Reference ${location.display}'s local economy in your impact explanation
- Mention specific benefits to the ${location.display} area economy
- Use real estimates: "keeps approximately $X in the local ${location.display} economy"
- Be specific and local, not generic
` : ''}

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
6. Product category (be VERY specific about the PRODUCT TYPE, not material):
   - For "Leather Weekender Bag" → say "Travel Luggage" or "Weekender Bags"
   - For "Stainless Steel Water Bottle" → say "Reusable Water Bottles"
   - For "Cotton T-Shirt" → say "Apparel" or "Clothing"
   - Focus on what the product IS, not what it's made of!
7. Store types that would actually sell THIS PRODUCT (be precise!):
   - For travel bags: "luggage store", "travel store", "department store"
     NOT "leather goods store" or "furniture store"
   - For water bottles: "sporting goods", "outdoor equipment", "target"
     NOT "plumbing supply" or "kitchenware only"
   - Think: WHERE would someone actually shop for this specific product?
8. Brief, factual explanation of why someone might consider alternatives${location && location.display ? `
   - Reference the user's specific location: "${location.display}"
   - Use real estimates with dollar amounts
   - Example: "In ${location.display}, local businesses recirculate 68% of revenue locally vs 43% for national chains"` : `
   - Provide factual information about local business impact
   - Use general estimates with dollar amounts
   - Example: "Local businesses typically recirculate 68% of revenue locally vs 43% for national chains"`}

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
  "googlePlacesTypes": ["store"],
  "isOnAvoidList": ${avoidedBrands.length > 0 ? `true if "${productName}" parent company "${'{parentCompany}'}" matches any of [${avoidedBrands.join(', ')}] (case-insensitive), else false` : 'false'},
  "avoidReason": ${avoidedBrands.length > 0 ? '"You\'ve chosen to avoid [Brand Name]" if matched, else ""' : '""'}
}

${avoidedBrands.length > 0 ? `\nIMPORTANT: Check if parentCompany or any subsidiary matches these avoided brands (case-insensitive): ${avoidedBrands.join(', ')}` : ''}

Important: Provide FACTS only. Be neutral and informative, not preachy. The alignment score will be calculated algorithmically.
Return ONLY the JSON object, no other text.`;
}

/**
 * Check if company matches user's avoided brands
 */
function checkAvoidedBrands(companyData, avoidedBrands) {
  if (!avoidedBrands || avoidedBrands.length === 0) {
    return { isOnAvoidList: false, reason: '' };
  }

  const companyName = (companyData.parentCompany || '').toLowerCase();
  const subsidiaries = (companyData.subsidiaries || []).map(s => s.toLowerCase());

  // Check parent company
  for (const avoidedBrand of avoidedBrands) {
    const brandLower = avoidedBrand.toLowerCase();
    if (companyName.includes(brandLower) || brandLower.includes(companyName.split(' ')[0])) {
      return {
        isOnAvoidList: true,
        reason: `You've chosen to avoid ${avoidedBrand}`
      };
    }

    // Check subsidiaries
    for (const subsidiary of subsidiaries) {
      if (subsidiary.includes(brandLower) || brandLower.includes(subsidiary.split(' ')[0])) {
        return {
          isOnAvoidList: true,
          reason: `Parent company of ${avoidedBrand} (which you've chosen to avoid)`
        };
      }
    }
  }

  return { isOnAvoidList: false, reason: '' };
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

  // Certifications (bonus points) - only if user prefers sustainable products
  const sustainableProducts = userPreferences.sustainableProducts !== false; // Default true
  if (sustainableProducts) {
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
  }

  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, score));

  console.log('Vinegar: Alignment score calculated:', finalScore, 'from', breakdown.length, 'factors');

  return {
    score: finalScore,
    breakdown: breakdown
  };
}

/**
 * Calculate location bonus for alternatives based on distance
 */
function calculateLocationBonus(distance) {
  if (!distance || distance < 0) return 0;

  if (distance < 2) {
    return 30; // Very close - walking distance
  } else if (distance < 5) {
    return 20; // Close - short drive
  } else if (distance < 10) {
    return 10; // Reasonable distance
  } else {
    return 0; // Too far
  }
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

    // Validate and clean up data to catch hallucinations
    validateAndCleanData(parsed);

    return parsed;

  } catch (error) {
    console.error('Vinegar API: Failed to parse response:', error);
    console.error('Vinegar API: Raw text:', text);
    throw new Error('PARSE_ERROR');
  }
}

/**
 * Validate data to catch potential hallucinations
 */
function validateAndCleanData(data) {
  const currentYear = new Date().getFullYear();

  // Validate factual concerns for suspicious patterns
  if (data.factualConcerns && Array.isArray(data.factualConcerns)) {
    data.factualConcerns = data.factualConcerns.filter(concern => {
      if (typeof concern !== 'string') return false;

      // Check for year patterns (should be 1800-current year)
      const yearMatch = concern.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        const year = parseInt(yearMatch[0]);
        if (year < 1800 || year > currentYear) {
          console.warn('Suspicious year in concern:', concern);
          return false; // Filter out concerns with invalid dates
        }
      }

      // Check for obvious placeholder or repetitive text
      if (concern.includes('example') || concern.includes('placeholder')) {
        console.warn('Placeholder text detected:', concern);
        return false;
      }

      return true;
    });
  }

  // Validate impactExplanation
  if (data.impactExplanation && typeof data.impactExplanation === 'string') {
    // Check for suspicious patterns
    const words = data.impactExplanation.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);

    // If more than 50% words are repeated, might be hallucination
    if (words.length > 10 && uniqueWords.size / words.length < 0.5) {
      console.warn('Suspicious repetitive text in impactExplanation');
      data.impactExplanation = 'Exploring alternatives helps support diverse business ownership and strengthens local economies.';
    }

    // Check for year references in explanation
    const yearMatch = data.impactExplanation.match(/\b(19|20)\d{2}\b/g);
    if (yearMatch) {
      for (const yearStr of yearMatch) {
        const year = parseInt(yearStr);
        if (year < 1800 || year > currentYear) {
          console.warn('Suspicious year in impactExplanation:', yearStr);
          // Don't completely reject, but log warning
        }
      }
    }
  }

  // Ensure parent company name is reasonable (no special characters except &, -, .)
  if (data.parentCompany && typeof data.parentCompany === 'string') {
    if (!/^[a-zA-Z0-9\s&\-\.]+$/.test(data.parentCompany)) {
      console.warn('Suspicious parent company name:', data.parentCompany);
    }
  }

  return data;
}

/**
 * Find small online retailers using Brave Search API
 */
async function findSmallOnlineRetailers(productName, productCategory) {
  console.log('Searching for small online retailers:', productName);

  // Check if we have search API configured
  if (!CONFIG.BRAVE_SEARCH_API_KEY || CONFIG.BRAVE_SEARCH_API_KEY === 'YOUR_BRAVE_SEARCH_API_KEY') {
    console.log('Brave Search not configured, skipping online retailer search');
    return [];
  }

  try {
    // Build search query to exclude mega-corps
    const searchQuery = `${productName} buy online -amazon -walmart -target -ebay -alibaba -aliexpress`;

    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=10`;

    const response = await fetch(url, {
      headers: {
        'X-Subscription-Token': CONFIG.BRAVE_SEARCH_API_KEY
      },
      mode: 'cors'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Brave Search API error:', response.status, errorText);
      return [];
    }

    const data = await response.json();

    if (!data.web || !data.web.results || data.web.results.length === 0) {
      console.log('No online retailers found');
      return [];
    }

    // Filter and process results
    const alternatives = [];

    for (const item of data.web.results.slice(0, 8)) { // Check up to 8 results
      const domain = new URL(item.url).hostname;
      console.log('Vinegar: Checking domain:', domain, 'for product:', productName);

      // Skip mega-corps
      if (isMegaCorp(domain)) {
        console.log('Vinegar: ❌ Filtered mega-corp:', domain);
        continue;
      }

      // Skip irrelevant domains (marketplaces, comparison sites, generic eco shops)
      const irrelevantDomains = [
        'reddit', 'quora', 'youtube', 'facebook', 'instagram', 'twitter', 'pinterest',
        'tiktok', 'wikipedia', 'ebay', 'comparison', 'review', 'deals', 'coupons',
        'packagefree', 'earthhero', 'treehugger', 'sustainablejungle', 'greenmatters'
      ];
      const domainLower = domain.toLowerCase();
      const isIrrelevant = irrelevantDomains.some(d => domainLower.includes(d));
      if (isIrrelevant) {
        console.log('Vinegar: ❌ Filtered irrelevant domain:', domain, '(matched:', irrelevantDomains.find(d => domainLower.includes(d)), ')');
        continue;
      }
      console.log('Vinegar: ✅ Domain passed filter:', domain);

      // Skip if description suggests it's a generic eco/lifestyle shop (not specific product retailer)
      const titleLower = item.title.toLowerCase();
      const descLower = (item.description || '').toLowerCase();
      const productFirstWord = productName.toLowerCase().split(' ')[0];

      // If title doesn't mention the product at all, probably irrelevant
      if (!titleLower.includes(productFirstWord) && descLower.length < 50) {
        console.log('Filtered out - product not in title:', item.title);
        continue;
      }

      // Extract business name from title (usually "Product - Store Name")
      const businessName = extractBusinessName(item.title, domain);

      // Try to scrape price
      const price = await scrapePriceFromPage(item.url);

      alternatives.push({
        name: businessName,
        type: 'small-business',
        typeLabel: 'Small Business',
        url: item.url,
        description: item.description,
        price: price,
        priceDisplay: price || 'Visit site for pricing',
        rating: 4.5, // Default (we don't have real ratings from search)
        availability: 'Check website',
        source: 'Web Search',
        isReal: true,
        hasPrice: !!price // Track if we got a real price
      });
    }

    // Sort: Prioritize results with actual scraped prices
    alternatives.sort((a, b) => {
      if (a.hasPrice && !b.hasPrice) return -1;
      if (!a.hasPrice && b.hasPrice) return 1;
      return 0;
    });

    // Return only top 2 best results (preferably with prices)
    const topResults = alternatives.slice(0, 2);
    console.log('Found', topResults.length, 'high-quality online retailers',
                `(${topResults.filter(a => a.hasPrice).length} with prices)`);
    return topResults;

  } catch (error) {
    console.error('Error finding online retailers:', error);
    return [];
  }
}

/**
 * Extract business name from search result title
 */
function extractBusinessName(title, domain) {
  // Try to extract brand/store name from title
  // Common patterns: "Product - Store Name", "Store Name: Product", "Product | Store"

  const separators = [' - ', ' | ', ': ', ' : '];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const parts = title.split(sep);
      // Last part usually has store name
      return parts[parts.length - 1].trim();
    }
  }

  // Fallback: use domain name
  return domain.replace('www.', '').replace('.com', '').split('.')[0]
    .split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Check if domain is a mega-corporation
 */
function isMegaCorp(domain) {
  const MEGA_CORP_DOMAINS = [
    'amazon', 'walmart', 'target', 'bestbuy', 'ebay',
    'alibaba', 'aliexpress', 'wish', 'macys', 'kohls',
    'jcpenney', 'sears', 'costco', 'samsclub', 'bjs',
    'homedepot', 'lowes', 'staples', 'officedepot',
    'petsmart', 'petco', 'cvs', 'walgreens', 'riteaid'
  ];

  const domainLower = domain.toLowerCase();
  return MEGA_CORP_DOMAINS.some(mega => domainLower.includes(mega));
}

/**
 * Scrape price from a webpage
 */
async function scrapePriceFromPage(url) {
  try {
    // Set timeout for fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VinegarBot/1.0)'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // Method 1: Look for JSON-LD structured data (most reliable)
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/gs);
    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        try {
          const jsonStr = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
          const data = JSON.parse(jsonStr);

          // Check for Product schema
          if (data['@type'] === 'Product' && data.offers) {
            const price = data.offers.price || data.offers[0]?.price;
            if (price) {
              return `$${parseFloat(price).toFixed(2)}`;
            }
          }
        } catch (e) {
          // JSON parse error, continue
        }
      }
    }

    // Method 2: Look for common price patterns in HTML
    const pricePatterns = [
      /\$(\d{1,4}(?:,\d{3})*(?:\.\d{2}))/g,           // $99.99 or $1,299.99
      /"price":\s*"?(\d+\.?\d*)"?/,                   // JSON: "price":"99.99"
      /itemprop="price"[^>]*content="(\d+\.?\d*)"/,   // Microdata
      /property="product:price:amount"[^>]*content="(\d+\.?\d*)"/, // Open Graph
    ];

    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (match) {
        const priceStr = match[1].replace(/,/g, '');
        let price = parseFloat(priceStr);

        // Heuristic: If price has no decimal and is >$100, it's likely in cents
        // Examples: 2700 = $27.00, 8018 = $80.18
        if (!priceStr.includes('.') && price > 100) {
          price = price / 100;
        }

        // Sanity check: price should be between $5 and $1,000 (most consumer products)
        if (price >= 5 && price <= 1000) {
          return `$${price.toFixed(2)}`;
        }
      }
    }

    console.log('Could not scrape price from:', url);
    return null;

  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Price scraping timed out for:', url);
    } else {
      console.log('Price scraping failed for:', url, error.message);
    }
    return null;
  }
}
