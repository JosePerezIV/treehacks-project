/**
 * Vinegar Content Script
 * Detects product pages and provides shopping insights and alternatives
 */

// Track if panel is already injected
let isPanelInjected = false;
let productData = null;
let userLocation = null;
let currentAlternatives = [];
let map = null;
let isMapVisible = false;

// Check if Leaflet loaded
console.log('Vinegar: Content script loaded, Leaflet available:', typeof L !== 'undefined');

/**
 * Detect which site we're on and extract product information
 */
async function detectAndExtractProduct() {
  const hostname = window.location.hostname;
  let data = null;

  if (hostname.includes('amazon.com')) {
    data = extractAmazonProduct();
  } else if (hostname.includes('walmart.com')) {
    data = extractWalmartProduct();
  } else if (hostname.includes('target.com')) {
    data = extractTargetProduct();
  } else if (hostname.includes('bestbuy.com')) {
    // Best Buy uses React - need to wait for content to load
    data = await waitForBestBuyProduct();
  }

  return data;
}

/**
 * Extract product data from Amazon
 */
function extractAmazonProduct() {
  // Try multiple selectors for title (Amazon has different layouts)
  const titleSelectors = [
    '#productTitle',
    '#title',
    'span[data-a-size="large"]',
    'h1.product-title',
    'h1 span#productTitle'
  ];

  let titleElement = null;
  for (const selector of titleSelectors) {
    titleElement = document.querySelector(selector);
    if (titleElement && titleElement.textContent.trim()) break;
  }

  if (!titleElement || !titleElement.textContent.trim()) {
    console.log('Vinegar: Could not find Amazon product title');
    return null;
  }

  // Try multiple selectors for price
  const priceSelectors = [
    '.a-price .a-offscreen',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '.a-price-whole',
    'span.a-price > span.a-offscreen',
    '#corePrice_feature_div .a-offscreen',
    '.priceToPay .a-offscreen'
  ];

  let priceElement = null;
  for (const selector of priceSelectors) {
    priceElement = document.querySelector(selector);
    if (priceElement && priceElement.textContent.trim()) break;
  }

  const productName = titleElement.textContent.trim();
  const productPrice = priceElement ? priceElement.textContent.trim() : 'Price not available';

  console.log('Vinegar: Extracted Amazon product:', { productName, productPrice });

  return {
    name: productName,
    price: productPrice,
    site: 'Amazon',
    url: window.location.href
  };
}

/**
 * Extract product data from Walmart
 */
function extractWalmartProduct() {
  const titleElement = document.querySelector('[itemprop="name"], h1[data-automation-id="product-title"]');
  const priceElement = document.querySelector('[itemprop="price"], [data-automation-id="product-price"]');

  if (!titleElement) return null;

  return {
    name: titleElement.textContent.trim(),
    price: priceElement ? priceElement.textContent.trim() : 'Price not available',
    site: 'Walmart',
    url: window.location.href
  };
}

/**
 * Extract product data from Target
 */
function extractTargetProduct() {
  const titleElement = document.querySelector('[data-test="product-title"], h1[class*="Title"]');
  const priceElement = document.querySelector('[data-test="product-price"]');

  if (!titleElement) return null;

  return {
    name: titleElement.textContent.trim(),
    price: priceElement ? priceElement.textContent.trim() : 'Price not available',
    site: 'Target',
    url: window.location.href
  };
}

/**
 * Extract product data from Best Buy (with retry logic for React)
 */
function extractBestBuyProduct() {
  // First, validate we're on a product page via URL
  // Best Buy URLs: /product/product-name/SKU (e.g., /product/energizer-max-9v-batteries/J78676CL43)
  const url = window.location.pathname;
  const isProductPage = /\/product\/[^\/]+\/[A-Z0-9]+/.test(url);

  if (!isProductPage) {
    console.log('Vinegar: Not a Best Buy product page (URL check failed for:', url);
    return null;
  }

  console.log('Vinegar: Best Buy product page detected via URL:', url);

  // Debug: Log what elements are available
  console.log('Vinegar: All H1s on page:', document.querySelectorAll('h1'));
  console.log('Vinegar: All price elements:', document.querySelectorAll('[class*="price"]'));

  // Try multiple selectors for title (Best Buy's current structure)
  const titleSelectors = [
    'h1.heading-5.v-fw-regular',  // Current Best Buy selector
    'h1.heading-5',
    '.sku-title h1',
    'h1[class*="heading"]',
    'div[class*="sku-title"] h1',
    'h1[data-testid="product-title"]',
    '.product-title h1'
  ];

  let titleElement = null;
  for (const selector of titleSelectors) {
    titleElement = document.querySelector(selector);
    if (titleElement && titleElement.textContent.trim()) {
      console.log(`Vinegar: Found title with selector: ${selector}`);
      break;
    }
  }

  // Fallback: try any h1
  if (!titleElement || !titleElement.textContent.trim()) {
    console.log('Vinegar: Trying fallback - any h1');
    const allH1s = document.querySelectorAll('h1');
    for (const h1 of allH1s) {
      if (h1.textContent.trim().length > 10) { // Reasonable title length
        titleElement = h1;
        console.log('Vinegar: Found title using h1 fallback');
        break;
      }
    }
  }

  if (!titleElement || !titleElement.textContent.trim()) {
    console.log('Vinegar: Could not find Best Buy product title');
    console.log('Vinegar: This might be a React loading issue - product may not be loaded yet');
    return null;
  }

  // Try multiple selectors for price
  const priceSelectors = [
    '.priceView-hero-price.priceView-customer-price span[aria-hidden="true"]',
    '.priceView-hero-price span[aria-hidden="true"]',
    '[class*="priceView-customer-price"] span[aria-hidden="true"]',
    '[data-testid="customer-price"]',
    '.priceView-customer-price',
    '.pricing-price__regular-price',
    'div[class*="priceView"] span[aria-hidden="true"]',
    '[class*="priceView"] [class*="priceView-customer-price"]',
    'div[data-testid="pricing"] span'
  ];

  let priceElement = null;
  for (const selector of priceSelectors) {
    priceElement = document.querySelector(selector);
    if (priceElement && priceElement.textContent.trim()) {
      console.log(`Vinegar: Found price with selector: ${selector}`);
      break;
    }
  }

  // Fallback 1: try any element with "price" in class that looks like a price
  if (!priceElement || !priceElement.textContent.trim()) {
    console.log('Vinegar: Trying fallback 1 - any price element with $');
    const allPrices = document.querySelectorAll('[class*="price"]');
    for (const priceEl of allPrices) {
      const text = priceEl.textContent.trim();
      // Look for "$XX.XX" or "$X,XXX.XX" format
      if (/\$[\d,]+\.?\d*/.test(text) && text.length < 30) {
        priceElement = priceEl;
        console.log('Vinegar: Found price using fallback 1:', text);
        break;
      }
    }
  }

  // Fallback 2: search entire page for price-like patterns
  if (!priceElement || !priceElement.textContent.trim()) {
    console.log('Vinegar: Trying fallback 2 - searching all elements for price pattern');
    const allElements = document.querySelectorAll('span, div');
    for (const el of allElements) {
      const text = el.textContent.trim();
      // Very specific: starts with $, followed by digits, possibly comma, possibly decimal
      if (/^\$[\d,]+\.?\d*$/.test(text) && text.length < 15 && parseFloat(text.replace(/[$,]/g, '')) > 10) {
        priceElement = el;
        console.log('Vinegar: Found price using fallback 2:', text);
        break;
      }
    }
  }

  const productName = titleElement.textContent.trim();
  const productPrice = priceElement ? priceElement.textContent.trim() : 'Price not available';

  console.log('Vinegar: Extracted Best Buy product:', { productName, productPrice });

  return {
    name: productName,
    price: productPrice,
    site: 'Best Buy',
    url: window.location.href
  };
}

/**
 * Wait for Best Buy product to load (React app)
 */
async function waitForBestBuyProduct(maxAttempts = 10, delayMs = 500) {
  console.log('Vinegar: Waiting for Best Buy product to load...');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Vinegar: Attempt ${attempt}/${maxAttempts}`);

    const product = extractBestBuyProduct();
    if (product) {
      console.log('Vinegar: Product found!');
      return product;
    }

    // Wait before next attempt
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log('Vinegar: Failed to find Best Buy product after', maxAttempts, 'attempts');
  return null;
}

/**
 * Inject the side panel into the page
 */
async function injectSidePanel(data) {
  if (isPanelInjected) {
    console.log('Vinegar: Panel already injected');
    return;
  }

  console.log('Vinegar: Injecting side panel with data:', data);
  productData = data;

  try {
    // Load user location from storage (with safety check)
    if (chrome?.storage?.sync) {
      const settings = await chrome.storage.sync.get('settings');
      if (settings.settings?.location) {
        userLocation = settings.settings.location;
        console.log('Vinegar: User location loaded:', userLocation);
      }
    } else {
      console.warn('Vinegar: chrome.storage not available, skipping location load');
    }

    // Leaflet and utils.js are now loaded via manifest.json content_scripts
    // No need to inject them dynamically

    // Create container for the side panel
    const panelContainer = document.createElement('div');
    panelContainer.id = 'vinegar-sidepanel-container';
    panelContainer.className = 'vinegar-collapsed';

    // Load the side panel HTML
    const sidePanelUrl = chrome.runtime.getURL('sidepanel.html');
    const response = await fetch(sidePanelUrl);
    const html = await response.text();

    panelContainer.innerHTML = html;
    document.body.appendChild(panelContainer);

    console.log('Vinegar: Panel HTML injected');

    // Wait a moment for DOM to settle
    await new Promise(resolve => setTimeout(resolve, 100));

    // Setup toggle button
    const toggleBtn = document.getElementById('vinegar-toggle');
    if (toggleBtn) {
      console.log('Vinegar: Toggle button found, adding event listener');
      toggleBtn.addEventListener('click', togglePanel);
    } else {
      console.error('Vinegar: Toggle button not found!');
    }

    // Initialize panel content with product data
    initializePanelContent(data);

    isPanelInjected = true;
    console.log('Vinegar: Panel injection complete');

    // Send product data to background script
    chrome.runtime.sendMessage({
      type: 'PRODUCT_DETECTED',
      data: data
    }).catch(err => {
      console.log('Vinegar: Could not send message to background:', err);
    });

  } catch (error) {
    console.error('Vinegar: Error injecting panel:', error);
  }
}

/**
 * Toggle panel open/closed
 */
function togglePanel() {
  console.log('Vinegar: Toggle button clicked');
  const container = document.getElementById('vinegar-sidepanel-container');
  const panel = document.getElementById('vinegar-panel');

  if (!container || !panel) {
    console.error('Vinegar: Panel elements not found');
    return;
  }

  const isExpanded = container.classList.contains('vinegar-expanded');

  if (isExpanded) {
    container.classList.remove('vinegar-expanded');
    container.classList.add('vinegar-collapsed');
    console.log('Vinegar: Panel collapsed');
  } else {
    container.classList.remove('vinegar-collapsed');
    container.classList.add('vinegar-expanded');
    panel.classList.add('vinegar-slide-in');
    setTimeout(() => panel.classList.remove('vinegar-slide-in'), 300);
    console.log('Vinegar: Panel expanded');
  }
}

/**
 * Initialize panel content with product data
 */
function initializePanelContent(data) {
  console.log('Vinegar: Initializing panel content');

  if (!data) return;

  // Populate product info
  const productNameEl = document.querySelector('#product-info .product-name');
  const productPriceEl = document.querySelector('#product-info .product-price');
  const productSiteEl = document.querySelector('#product-info .product-site');

  if (productNameEl) {
    productNameEl.textContent = data.name;
    console.log('Vinegar: Set product name:', data.name);
  }
  if (productPriceEl) {
    productPriceEl.textContent = data.price;
    console.log('Vinegar: Set product price:', data.price);
  }
  if (productSiteEl) {
    productSiteEl.innerHTML = `<span class="site-badge">${data.site}</span>`;
    console.log('Vinegar: Set product site:', data.site);
  }

  // Start API analysis (async)
  analyzeProductWithAPI(data);

  // Load alternatives
  setTimeout(() => loadAlternatives(data), 500);
}

/**
 * Analyze product using Claude API
 */
async function analyzeProductWithAPI(data) {
  console.log('Vinegar: Starting API analysis');

  // Show loading state
  showAnalysisLoading(true);

  try {
    // Get user preferences (with safety check)
    let userPreferences = {
      avoidedBrands: [],
      location: null,
      supportLocal: true,
      sustainableProducts: true
    };

    if (chrome?.storage?.sync) {
      const settings = await chrome.storage.sync.get('settings');
      userPreferences = {
        avoidedBrands: settings.settings?.avoidedBrands || [],
        location: settings.settings?.location || null,
        supportLocal: settings.settings?.supportLocal !== false,
        sustainableProducts: settings.settings?.sustainableProducts !== false
      };
    }

    // Call API via background script (avoids CORS issues)
    chrome.runtime.sendMessage({
      action: 'analyzeProduct',
      productName: data.name,
      currentSite: data.site, // Pass current site to filter it from alternatives
      userPreferences: userPreferences
    }, (response) => {
      showAnalysisLoading(false);

      if (chrome.runtime.lastError) {
        console.error('Vinegar: Runtime error:', chrome.runtime.lastError);
        showAnalysisError('Unable to analyze product. Please try again later.');
        const fallback = getFallbackAnalysis(data.name);
        updateCompanyAnalysis(fallback);
        updateCostBenefitAnalysis(fallback.costBenefitAnalysis);
        return;
      }

      if (response.error) {
        console.error('Vinegar: API analysis failed:', response.error);

        // Show appropriate error message
        if (response.error === 'API_RATE_LIMIT') {
          showAnalysisError('Too many requests. Please try again in a moment.');
        } else if (response.error === 'PARSE_ERROR') {
          showAnalysisError('Unable to analyze product. Using basic information.');
        } else {
          showAnalysisError('Unable to analyze product. Please try again later.');
        }

        // Always use fallback on error
        const fallback = getFallbackAnalysis(data.name);
        updateCompanyAnalysis(fallback);
        const explanation = fallback.impactExplanation || fallback.costBenefitAnalysis || 'Exploring alternatives helps support local economies.';
        updateCostBenefitAnalysis(explanation);
      } else {
        // Update UI with results
        updateCompanyAnalysis(response);
        // Use impactExplanation (new field) or costBenefitAnalysis (legacy)
        const explanation = response.impactExplanation || response.costBenefitAnalysis || 'Exploring alternatives helps support diverse business ownership and local economies.';
        updateCostBenefitAnalysis(explanation);

        // If we have real local alternatives, use them
        if (response.localAlternatives && response.localAlternatives.length > 0) {
          console.log('Vinegar: Using real local alternatives from Google Places');
          displayRealAlternatives(response.localAlternatives, response.alternativeTypes);
        }

        console.log('Vinegar: API analysis complete');
      }
    });

  } catch (error) {
    console.error('Vinegar: Error calling API:', error);
    showAnalysisError('Unable to analyze product. Please try again later.');

    const fallback = getFallbackAnalysis(data.name);
    updateCompanyAnalysis(fallback);
    const explanation = fallback.impactExplanation || fallback.costBenefitAnalysis || 'Exploring alternatives helps support local economies.';
    updateCostBenefitAnalysis(explanation);
    showAnalysisLoading(false);
  }
}

/**
 * Show/hide loading state for analysis
 */
function showAnalysisLoading(isLoading) {
  const companyInfo = document.getElementById('company-info');
  if (!companyInfo) return;

  if (isLoading) {
    companyInfo.innerHTML = `
      <div style="text-align: center; padding: 30px 20px;">
        <div class="spinner" style="margin: 0 auto 16px;"></div>
        <p style="font-size: 13px; color: var(--text-medium);">Analyzing product with AI...</p>
      </div>
    `;
  }
}

/**
 * Update company analysis section with API results
 */
function updateCompanyAnalysis(analysis) {
  const companyInfo = document.getElementById('company-info');
  if (!companyInfo) return;

  // Check if this is an avoided brand - show prominent warning
  const avoidWarningHTML = analysis.isOnAvoidList ? `
    <div style="background: #ffe6e6; border: 2px solid #e74c3c; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; animation: warningPulse 2s ease-in-out;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <span style="font-size: 24px;">⚠️</span>
        <span style="font-size: 14px; font-weight: 700; color: #c0392b;">Brand You're Avoiding</span>
      </div>
      <div style="font-size: 13px; color: #c0392b; line-height: 1.4;">
        ${analysis.avoidReason || "This product is from a brand you've chosen to avoid."}
      </div>
    </div>
  ` : '';

  const concernsHTML = analysis.concerns && analysis.concerns.length > 0
    ? `<div style="margin-top: 12px;">
         <div style="font-size: 12px; font-weight: 600; color: #6b8e5f; margin-bottom: 6px;">📋 Company Practices:</div>
         ${analysis.concerns.map(concern => `
           <div style="display: flex; align-items: center; gap: 6px; padding: 6px 0 6px 18px; font-size: 12px; color: #666;">
             <span>•</span>
             <span>${concern}</span>
           </div>
         `).join('')}
       </div>`
    : '';

  // Build score breakdown HTML if available
  let breakdownHTML = '';
  if (analysis.scoreBreakdown && analysis.scoreBreakdown.length > 0) {
    const breakdownItems = analysis.scoreBreakdown
      .map(item => {
        const changeColor = item.change > 0 ? '#7ba05b' : '#e74c3c';
        const changeSign = item.change > 0 ? '+' : '';
        return `
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; border-bottom: 1px solid #e8ebe0;">
            <span>${item.reason}</span>
            <span style="color: ${changeColor}; font-weight: 600;">${changeSign}${item.change}</span>
          </div>
        `;
      })
      .join('');

    breakdownHTML = `
      <div style="margin-top: 12px;">
        <button id="toggle-score-breakdown" style="background: none; border: none; color: #7ba05b; font-size: 12px; cursor: pointer; padding: 4px 0; text-decoration: underline;">
          📊 How is this score calculated?
        </button>
        <div id="score-breakdown" style="display: none; margin-top: 8px; padding: 12px; background: #f5f7f0; border-radius: 6px;">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #2d4a2b;">Score Breakdown:</div>
          <div style="padding: 6px 0; font-size: 12px; border-bottom: 1px solid #e8ebe0;">
            <span>Base score</span>
            <span style="float: right; font-weight: 600;">100</span>
          </div>
          ${breakdownItems}
          <div style="display: flex; justify-content: space-between; padding: 8px 0 4px 0; font-size: 14px; font-weight: 700; color: #7ba05b; border-top: 2px solid #7ba05b; margin-top: 4px;">
            <span>Final Score</span>
            <span>${analysis.alignmentScore}/100</span>
          </div>
        </div>
      </div>
    `;
  }

  companyInfo.innerHTML = `
    ${avoidWarningHTML}
    <div class="company-badge">
      <span class="badge-icon">🏢</span>
      <span class="badge-text">Parent Company: <strong id="parent-company">${analysis.parentCompany}</strong></span>
    </div>
    <div class="alignment-score">
      <span class="score-label">Values Match:</span>
      <div class="score-bar">
        <div class="score-fill" id="alignment-score-fill" style="width: ${analysis.alignmentScore}%"></div>
      </div>
      <span class="score-value" id="alignment-score-value">${analysis.alignmentScore}/100</span>
    </div>
    ${concernsHTML}
    ${breakdownHTML}
  `;

  // Add event listener for breakdown toggle
  const toggleBtn = document.getElementById('toggle-score-breakdown');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const breakdown = document.getElementById('score-breakdown');
      if (breakdown) {
        const isVisible = breakdown.style.display !== 'none';
        breakdown.style.display = isVisible ? 'none' : 'block';
        toggleBtn.textContent = isVisible ? '📊 How is this score calculated?' : '📊 Hide score breakdown';
      }
    });
  }
}

/**
 * Update cost-benefit analysis section
 */
function updateCostBenefitAnalysis(analysisText) {
  const costBenefit = document.getElementById('cost-benefit');
  if (!costBenefit) return;

  // Validate and clean the analysis text
  let cleanText = analysisText;

  // Check for hallucination patterns and clean them up
  if (!cleanText || cleanText === 'undefined' || cleanText === 'null') {
    cleanText = 'Exploring alternatives helps support diverse business ownership and local economies.';
  }

  // Remove any JSON artifacts
  cleanText = cleanText.replace(/[{}\[\]]/g, '');

  // Split into sentences for better formatting
  const sentences = cleanText.split(/\.\s+/).filter(s => s.trim());

  // Format as clean paragraphs (group 2-3 sentences each)
  let formattedHTML = '<div class="impact-analysis">';

  if (sentences.length <= 3) {
    // Short analysis - show as single paragraph
    formattedHTML += `
      <div class="benefit-item">
        <span class="benefit-icon">💡</span>
        <div class="benefit-text-full">
          ${sentences.map(s => s.trim() + (s.endsWith('.') ? '' : '.')).join(' ')}
        </div>
      </div>
    `;
  } else {
    // Longer analysis - split into multiple sections
    const midpoint = Math.ceil(sentences.length / 2);
    const firstHalf = sentences.slice(0, midpoint).map(s => s.trim() + (s.endsWith('.') ? '' : '.')).join(' ');
    const secondHalf = sentences.slice(midpoint).map(s => s.trim() + (s.endsWith('.') ? '' : '.')).join(' ');

    formattedHTML += `
      <div class="benefit-item">
        <span class="benefit-icon">💡</span>
        <div class="benefit-text-full">${firstHalf}</div>
      </div>
      <div class="benefit-item">
        <span class="benefit-icon">📊</span>
        <div class="benefit-text-full">${secondHalf}</div>
      </div>
    `;
  }

  formattedHTML += '</div>';
  costBenefit.innerHTML = formattedHTML;
}

/**
 * Show error message in analysis section
 */
function showAnalysisError(message) {
  const companyInfo = document.getElementById('company-info');
  if (!companyInfo) return;

  companyInfo.innerHTML = `
    <div style="padding: 16px; background: #fff3e0; border-radius: 8px; border-left: 4px solid #f39c12;">
      <div style="display: flex; align-items: start; gap: 10px;">
        <span style="font-size: 20px;">ℹ️</span>
        <div>
          <p style="font-size: 13px; color: #e65100; margin: 0 0 8px 0; font-weight: 600;">Analysis Unavailable</p>
          <p style="font-size: 12px; color: #7d5a00; margin: 0;">${message}</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Load and display ethical alternatives
 */
async function loadAlternatives(data) {
  console.log('Vinegar: Loading alternatives');

  const alternativesList = document.getElementById('alternatives-list');
  const loadingState = document.getElementById('loading-state');

  if (!alternativesList) {
    console.error('Vinegar: Alternatives list not found');
    return;
  }

  // Check if location is set (with safety check)
  let hasLocation = false;
  if (chrome?.storage?.sync) {
    const settings = await chrome.storage.sync.get('settings');
    hasLocation = settings.settings?.location?.lat && settings.settings?.location?.lon;
  }

  if (!hasLocation) {
    // Show prompt to set location instead of fake alternatives
    alternativesList.innerHTML = `
      <div style="padding: 24px; text-align: center; background: linear-gradient(135deg, #f5f7f0 0%, #e8ebe0 100%); border-radius: 12px; border: 2px dashed #7ba05b;">
        <div style="font-size: 48px; margin-bottom: 12px;">📍</div>
        <div style="font-size: 16px; font-weight: 600; color: #2d4a2b; margin-bottom: 8px;">
          Set Your Location to Find Local Alternatives
        </div>
        <div style="font-size: 14px; color: #6b8e5f; margin-bottom: 16px; line-height: 1.5;">
          We'll show you real local businesses nearby that sell this product, so you can support your community instead of big box retailers.
        </div>
        <button id="open-location-settings" style="
          padding: 12px 24px;
          background: linear-gradient(135deg, #7ba05b 0%, #5d7e47 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          transition: transform 0.2s;
        " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
          📍 Set Location Now
        </button>
      </div>
    `;

    // Add click handler for button
    const btn = document.getElementById('open-location-settings');
    if (btn) {
      btn.addEventListener('click', () => {
        // Open the extension popup
        chrome.runtime.sendMessage({ action: 'openPopup' });
      });
    }

    console.log('Vinegar: Location not set - showing prompt');
    return;
  }

  // Show loading state
  if (loadingState) loadingState.style.display = 'block';

  // Wait for API response (real alternatives will replace this if found)
  setTimeout(() => {
    if (loadingState) loadingState.style.display = 'none';
    console.log('Vinegar: Waiting for real alternatives from API...');
  }, 1000);
}

/**
 * Display real alternatives from Google Places API
 */
function displayRealAlternatives(localAlternatives, alternativeTypes) {
  console.log('Vinegar: Displaying real alternatives from Google Places');

  const alternativesList = document.getElementById('alternatives-list');
  if (!alternativesList) return;

  // Calculate distances and travel times for local alternatives
  if (userLocation && typeof calculateDistance === 'function') {
    localAlternatives.forEach(alt => {
      alt.distance = calculateDistance(userLocation.lat, userLocation.lon, alt.lat, alt.lon);
      alt.distanceLabel = formatDistance(alt.distance);
      alt.distanceCategory = categorizeDistance(alt.distance);
      alt.distanceBonus = getDistanceBonus(alt.distance);

      // Estimate travel time (assuming 25 mph average in city, 35 mph suburban)
      const avgSpeed = alt.distance < 5 ? 25 : 35; // mph
      const travelTimeMinutes = Math.round((alt.distance / avgSpeed) * 60);
      alt.travelTime = travelTimeMinutes;
      alt.travelTimeLabel = travelTimeMinutes < 60 ? `${travelTimeMinutes} min` : `${Math.round(travelTimeMinutes / 60)} hr`;
    });

    // Sort by distance (closest first)
    localAlternatives.sort((a, b) => (a.distance || 999) - (b.distance || 999));
  }

  // Determine how many online alternatives to show based on local results
  const onlineCount = localAlternatives.length < 3 ? 4 : 2;

  // Add online sustainable alternatives
  const onlineAlternatives = [
    {
      name: 'Package Free Shop',
      type: 'sustainable',
      typeLabel: 'Online - Sustainable',
      features: ['Zero waste packaging', 'Plastic-free', 'B-Corp certified'],
      rating: 4.7,
      url: 'https://packagefreeshop.com',
      isReal: false
    },
    {
      name: 'EarthHero',
      type: 'sustainable',
      typeLabel: 'Online - Sustainable',
      features: ['Carbon neutral', 'Eco-friendly', 'Vetted products'],
      rating: 4.6,
      url: 'https://earthhero.com',
      isReal: false
    },
    {
      name: 'Ten Thousand Villages',
      type: 'ethical',
      typeLabel: 'Online - Fair Trade',
      features: ['Fair trade', 'Artisan made', 'Direct trade'],
      rating: 4.8,
      url: 'https://tenthousandvillages.com',
      isReal: false
    },
    {
      name: 'Etsy (Sustainable Sellers)',
      type: 'ethical',
      typeLabel: 'Online - Handmade',
      features: ['Small business', 'Handmade', 'Unique items'],
      rating: 4.5,
      url: 'https://www.etsy.com/c/craft-supplies-and-tools/home-and-hobby/sustainable-living',
      isReal: false
    }
  ];

  // Combine: local alternatives first, then online
  const allAlternatives = [...localAlternatives, ...onlineAlternatives.slice(0, onlineCount)];
  currentAlternatives = allAlternatives; // Store for map use

  // Clear existing
  alternativesList.innerHTML = '';

  // Show message if no local alternatives found
  if (localAlternatives.length === 0) {
    alternativesList.innerHTML = `
      <div style="padding: 24px; text-align: center; background: #f5f7f0; border-radius: 12px;">
        <div style="font-size: 42px; margin-bottom: 12px;">🔍</div>
        <div style="font-size: 16px; font-weight: 600; color: #2d4a2b; margin-bottom: 8px;">
          No Local Alternatives Found Nearby
        </div>
        <div style="font-size: 13px; color: #6b8e5f; line-height: 1.5;">
          We couldn't find any independent local stores that sell this product in your area.
          Try searching online or checking local specialty shops directly.
        </div>
      </div>
    `;
    return; // Don't show online alternatives either
  }

  // Display alternatives
  allAlternatives.forEach((alt, index) => {
    const card = createAlternativeCard(alt);
    alternativesList.appendChild(card);

    // Stagger animation
    setTimeout(() => {
      card.classList.add('vinegar-fade-in');
    }, index * 100);
  });

  console.log('Vinegar: Displayed', allAlternatives.length, 'alternatives (', localAlternatives.length, 'local,', onlineCount, 'online)');

  // Add transparency note
  if (allAlternatives.length > 0) {
    const transparencyNote = document.createElement('div');
    transparencyNote.style.cssText = 'padding: 12px; background: #f5f7f0; border-radius: 8px; margin-top: 16px; font-size: 11px; color: #6b8e5f; line-height: 1.5;';
    transparencyNote.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">ℹ️ About These Alternatives</div>
      <div><strong>Local stores:</strong> Real businesses from Google Places. Call to confirm product availability.</div>
      <div><strong>Online retailers:</strong> Found via web search. Prices scraped when possible, otherwise check their website.</div>
      <div><strong>What's filtered out:</strong> Amazon, Walmart, Target, Best Buy, and other mega-corporations.</div>
    `;
    alternativesList.appendChild(transparencyNote);
  }

  // Track impact stats
  const closestDistance = localAlternatives.length > 0 ? localAlternatives[0].distance : null;
  updateImpactStats(productData?.price, allAlternatives.length, closestDistance);

  // Setup map button
  setupMapButton();
}

/**
 * Setup map toggle button
 */
function setupMapButton() {
  const mapBtn = document.getElementById('toggle-map-btn');
  if (!mapBtn) return;

  // Show button if we have location and alternatives
  if (userLocation && currentAlternatives.length > 0) {
    mapBtn.style.display = 'flex';

    // Remove old listeners
    const newBtn = mapBtn.cloneNode(true);
    mapBtn.parentNode.replaceChild(newBtn, mapBtn);

    // Add click listener
    newBtn.addEventListener('click', toggleMap);
  } else {
    mapBtn.style.display = 'none';
  }
}

/**
 * Toggle map visibility
 */
function toggleMap() {
  const mapSection = document.getElementById('map-section');
  const mapBtn = document.getElementById('toggle-map-btn');
  const mapBtnText = document.getElementById('map-btn-text');
  const mapBtnIcon = document.getElementById('map-btn-icon');

  if (!mapSection || !mapBtn) return;

  isMapVisible = !isMapVisible;

  if (isMapVisible) {
    // Show map
    mapSection.style.display = 'block';
    mapBtnText.textContent = 'Hide Map';
    mapBtnIcon.textContent = '✖️';

    // Initialize map if not already done
    if (!map) {
      setTimeout(() => initializeMap(), 100);
    }

    // Scroll to map
    setTimeout(() => {
      mapSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 150);
  } else {
    // Hide map
    mapSection.style.display = 'none';
    mapBtnText.textContent = 'Show Nearby Alternatives';
    mapBtnIcon.textContent = '🗺️';
  }
}

/**
 * Initialize Leaflet map
 */
function initializeMap() {
  console.log('Vinegar: Initializing map');

  const mapContainer = document.getElementById('alternatives-map');
  const noLocationDiv = document.getElementById('map-no-location');

  if (!mapContainer) return;

  // Check if user has location
  if (!userLocation || !userLocation.lat || !userLocation.lon) {
    mapContainer.style.display = 'none';
    if (noLocationDiv) noLocationDiv.style.display = 'flex';
    return;
  }

  // Hide no-location message
  mapContainer.style.display = 'block';
  if (noLocationDiv) noLocationDiv.style.display = 'none';

  // Check if Leaflet is loaded
  if (typeof L === 'undefined') {
    console.error('Vinegar: Leaflet not loaded - this should not happen!');
    console.error('Vinegar: Please reload the extension and try again');

    // Show error to user
    mapContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #e74c3c;">
        <p style="font-size: 14px; margin-bottom: 10px;">⚠️ Map library failed to load</p>
        <p style="font-size: 12px; color: #666;">Please reload the page and try again</p>
      </div>
    `;
    return;
  }

  console.log('Vinegar: Leaflet loaded successfully, version:', L.version);

  // Configure Leaflet icon paths to use extension resources
  L.Icon.Default.prototype.options.iconUrl = chrome.runtime.getURL('lib/images/marker-icon.png');
  L.Icon.Default.prototype.options.iconRetinaUrl = chrome.runtime.getURL('lib/images/marker-icon-2x.png');
  L.Icon.Default.prototype.options.shadowUrl = chrome.runtime.getURL('lib/images/marker-shadow.png');

  console.log('Vinegar: Icon paths configured');

  try {
    // Create map centered on user location
    map = L.map('alternatives-map', {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([userLocation.lat, userLocation.lon], 12);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map);

    // Add user location marker (blue dot)
    const userIcon = L.divIcon({
      className: 'user-location-marker',
      html: '<div style="width: 20px; height: 20px; background: #4285F4; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    L.marker([userLocation.lat, userLocation.lon], { icon: userIcon })
      .addTo(map)
      .bindPopup('<div class="map-popup-title">📍 Your Location</div>');

    // Add markers for alternatives
    currentAlternatives.forEach((alt, index) => {
      if (alt.lat && alt.lon) {
        addAlternativeMarker(alt, index);
      }
    });

    // Fit bounds to show all markers
    const bounds = [
      [userLocation.lat, userLocation.lon],
      ...currentAlternatives
        .filter(alt => alt.lat && alt.lon)
        .map(alt => [alt.lat, alt.lon])
    ];

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    console.log('Vinegar: Map initialized successfully');

  } catch (error) {
    console.error('Vinegar: Error initializing map:', error);
  }
}

/**
 * Add marker for an alternative
 */
function addAlternativeMarker(alt, index) {
  if (!map) return;

  // Define marker colors based on type
  const colors = {
    local: '#2e7d32',      // Green
    sustainable: '#00695c', // Blue-green
    ethical: '#e65100'      // Orange
  };

  const color = colors[alt.type] || '#7ba05b';

  // Create custom icon
  const icon = L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 30px;
        height: 30px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="
          transform: rotate(45deg);
          color: white;
          font-size: 16px;
          font-weight: bold;
        ">${index + 1}</span>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
  });

  // Create popup content
  const popupContent = `
    <div class="map-popup-title">${alt.name}</div>
    <div class="map-popup-detail">
      <span class="alt-badge ${alt.type}" style="display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; margin-top: 4px;">
        ${alt.typeLabel}
      </span>
    </div>
    <div class="map-popup-price">${alt.price}</div>
    ${alt.distanceLabel ? `<div class="map-popup-distance">📍 ${alt.distanceLabel} away</div>` : ''}
  `;

  // Add marker
  L.marker([alt.lat, alt.lon], { icon })
    .addTo(map)
    .bindPopup(popupContent);
}

/**
 * Generate mock alternatives with location data
 */
function generateMockAlternatives(data) {
  const productName = data?.name || 'product';
  const basePrice = extractNumericPrice(data?.price);

  // Generate alternatives with mock locations
  const alternatives = [
    {
      name: `Local Shop - ${productName.substring(0, 30)}...`,
      price: formatPrice(basePrice * 1.15),
      rating: 4.8,
      type: 'local',
      typeLabel: 'Local Business',
      features: ['Family-owned', 'Same-day pickup', 'Expert advice'],
      url: '#',
      // Mock location - nearby
      lat: userLocation ? userLocation.lat + (Math.random() - 0.5) * 0.1 : null,
      lon: userLocation ? userLocation.lon + (Math.random() - 0.5) * 0.1 : null
    },
    {
      name: `EcoFriendly - Sustainable Alternative`,
      price: formatPrice(basePrice * 1.25),
      rating: 4.6,
      type: 'sustainable',
      typeLabel: 'Sustainable',
      features: ['Carbon neutral', 'Recycled materials', 'B-Corp certified'],
      url: '#',
      // Mock location - medium distance
      lat: userLocation ? userLocation.lat + (Math.random() - 0.5) * 0.3 : null,
      lon: userLocation ? userLocation.lon + (Math.random() - 0.5) * 0.3 : null
    },
    {
      name: `Fair Trade Co-op - Similar Product`,
      price: formatPrice(basePrice * 1.10),
      rating: 4.7,
      type: 'ethical',
      typeLabel: 'Fair Trade',
      features: ['Worker-owned', 'Ethical sourcing', 'Living wages'],
      url: '#',
      // Mock location - closer
      lat: userLocation ? userLocation.lat + (Math.random() - 0.5) * 0.15 : null,
      lon: userLocation ? userLocation.lon + (Math.random() - 0.5) * 0.15 : null
    }
  ];

  // Calculate distances and add distance bonus to ratings
  if (userLocation && typeof calculateDistance === 'function') {
    alternatives.forEach(alt => {
      if (alt.lat && alt.lon) {
        alt.distance = calculateDistance(userLocation.lat, userLocation.lon, alt.lat, alt.lon);
        alt.distanceLabel = formatDistance(alt.distance);
        alt.distanceCategory = categorizeDistance(alt.distance);

        // Add distance bonus to ethical score (0-20 points)
        alt.distanceBonus = getDistanceBonus(alt.distance);
      }
    });

    // Sort by distance (closest first)
    alternatives.sort((a, b) => (a.distance || 999) - (b.distance || 999));
  }

  return alternatives;
}

/**
 * Extract numeric price from string
 */
function extractNumericPrice(priceStr) {
  if (!priceStr || priceStr === 'Price not available') {
    return 50; // default
  }
  const match = priceStr.match(/[\d,]+\.?\d*/);
  return match ? parseFloat(match[0].replace(',', '')) : 50;
}

/**
 * Format price
 */
function formatPrice(price) {
  return `$${price.toFixed(2)}`;
}

/**
 * Create alternative card element
 */
function createAlternativeCard(alt) {
  const card = document.createElement('div');
  card.className = 'alternative-card';

  const stars = '⭐'.repeat(Math.floor(alt.rating)) + (alt.rating % 1 >= 0.5 ? '✨' : '');

  // Build distance badge HTML if distance is available
  let distanceBadge = '';
  if (alt.distanceLabel) {
    const badgeClass = alt.distance < 10 ? 'distance-near' : alt.distance < 25 ? 'distance-medium' : 'distance-far';
    distanceBadge = `<span class="distance-badge ${badgeClass}">📍 ${alt.distanceLabel}</span>`;
  }

  // Determine if this is a local store vs online retailer
  const isLocalStore = alt.source === 'Google Places' || (alt.lat && alt.lon && alt.address);
  const isOnlineRetailer = alt.source === 'Web Search' || alt.url;

  if (isLocalStore) {
    // LOCAL INDEPENDENT STORE
    // Safeguard against "undefined" text
    const address = (alt.address && alt.address !== 'undefined' && alt.address !== 'null') ? alt.address : null;
    const phone = alt.phone || null;

    card.innerHTML = `
      <div class="alt-header">
        <h4 class="alt-name">${alt.name}</h4>
        <span class="alt-badge local">LOCAL BUSINESS</span>
      </div>
      ${address ? `<div class="alt-address" style="font-size: 12px; color: #666; margin: 4px 0;">${address}</div>` : ''}
      ${phone ? `<div style="font-size: 12px; color: #7ba05b; margin: 4px 0;">📞 ${phone}</div>` : ''}
      ${alt.distanceLabel && alt.travelTimeLabel ? `<div style="font-size: 11px; color: #7ba05b; margin: 6px 0; font-weight: 500;">📍 ${alt.distanceLabel} • ${alt.travelTimeLabel} drive</div>` : distanceBadge || ''}
      <div style="padding: 8px; background: #fff3cd; border-left: 3px solid #ffc107; border-radius: 4px; font-size: 12px; color: #856404; margin: 8px 0;">
        ⚠️ Call to confirm they carry this item
      </div>
      <div class="alt-details">
        <div class="alt-rating">
          <span class="stars">${stars}</span>
          <span class="rating-value">${alt.rating.toFixed(1)}/5</span>
        </div>
      </div>
      <div class="alt-actions" style="gap: 8px;">
        ${phone ? `<a href="tel:${phone}" class="alt-button primary" style="flex: 1;">📞 Call Store</a>` : ''}
        <a href="${alt.googleMapsUrl}" target="_blank" class="alt-button ${phone ? 'secondary' : 'primary'}" style="flex: 1;">
          🗺️ Directions
        </a>
      </div>
    `;
  } else if (isOnlineRetailer) {
    // SMALL ONLINE RETAILER
    const priceDisplay = alt.priceDisplay || alt.price || 'Visit site for pricing';
    const showPrice = alt.price && alt.price !== 'null' && alt.price !== 'undefined';

    // Truncate description to 150 characters
    let description = alt.description || '';
    if (description.length > 150) {
      description = description.substring(0, 150).trim() + '...';
    }

    card.innerHTML = `
      <div class="alt-header">
        <h4 class="alt-name">${alt.name}</h4>
        <span class="alt-badge small-business">SMALL BUSINESS</span>
      </div>
      ${description ? `<div style="font-size: 12px; color: #666; margin: 4px 0; line-height: 1.4;">${description}</div>` : ''}
      <div class="alt-details" style="margin-top: 8px;">
        ${showPrice ? `<div class="alt-price" style="font-size: 18px; font-weight: 700; color: #2d4a2b;">${alt.price}</div>` : `<div style="font-size: 13px; color: #7ba05b;">💰 ${priceDisplay}</div>`}
        <div style="font-size: 12px; color: #6b8e5f; margin-top: 4px;">✓ ${alt.availability || 'Check website'}</div>
      </div>
      <div class="alt-actions" style="margin-top: 12px;">
        <a href="${alt.url}" target="_blank" class="alt-button primary">🛒 Visit Website</a>
      </div>
    `;
  } else {
    // FALLBACK: Generic alternative (shouldn't happen with new system)
    card.innerHTML = `
      <div class="alt-header">
        <h4 class="alt-name">${alt.name}</h4>
        <span class="alt-badge ${alt.type}">${alt.typeLabel}</span>
      </div>
      <div class="alt-details">
        ${alt.price ? `<div class="alt-price">${alt.price}</div>` : ''}
        <div class="alt-rating">
          <span class="stars">${stars}</span>
          <span class="rating-value">${alt.rating}/5</span>
        </div>
      </div>
      ${alt.features ? `<div class="alt-features">
        ${alt.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
      </div>` : ''}
      <div class="alt-actions">
        <a href="${alt.url || '#'}" target="_blank" class="alt-button primary">Visit Store</a>
      </div>
    `;
  }

  return card;
}

/**
 * Update impact statistics
 */
async function updateImpactStats(productPrice, alternativesCount, closestDistance) {
  try {
    // Safety check for chrome.storage
    if (!chrome?.storage?.local) {
      console.warn('Vinegar: chrome.storage.local not available, skipping stats update');
      return;
    }

    const result = await chrome.storage.local.get('impactData');
    const impact = result.impactData || {
      alternativesViewed: 0,
      sessionsWithAlternatives: 0,
      startDate: Date.now()
    };

    // Update counters - just track alternatives viewed
    impact.alternativesViewed += alternativesCount || 0;
    impact.sessionsWithAlternatives += 1;

    // Save updated stats
    await chrome.storage.local.set({ impactData: impact });

    console.log('Vinegar: Impact stats updated:', impact);
  } catch (error) {
    console.error('Vinegar: Error updating impact stats:', error);
  }
}

/**
 * Get fallback analysis when API fails
 */
function getFallbackAnalysis(productName) {
  return {
    parentCompany: 'Unknown',
    ethicalScore: 50,
    concerns: ['Unable to analyze - API unavailable'],
    productCategory: 'General',
    alternativeTypes: ['Local businesses', 'Sustainable options', 'Fair trade alternatives'],
    costBenefitAnalysis: 'Supporting local and ethical businesses helps build stronger communities, promotes fair labor practices, and reduces environmental impact.',
    suggestedStoreKeywords: ['local', 'sustainable', 'ethical']
  };
}

/**
 * Initialize the extension on page load
 */
function initialize() {
  console.log('Vinegar: Initializing content script');

  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkForProduct);
  } else {
    checkForProduct();
  }

  // Also check when URL changes (for SPAs)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      isPanelInjected = false;
      // Remove old panel if exists
      const oldPanel = document.getElementById('vinegar-sidepanel-container');
      if (oldPanel) oldPanel.remove();
      checkForProduct();
    }
  }).observe(document, { subtree: true, childList: true });
}

/**
 * Check if we're on a product page and inject panel
 */
async function checkForProduct() {
  console.log('Vinegar: Checking for product...');

  // Wait a bit for dynamic content to load
  setTimeout(async () => {
    const data = await detectAndExtractProduct();

    if (data) {
      console.log('Vinegar: Product detected:', data);
      injectSidePanel(data);
    } else {
      console.log('Vinegar: No product detected on this page');
    }
  }, 2000);
}

// Start the extension
initialize();
