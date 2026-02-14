/**
 * Vinegar Content Script
 * Detects product pages and injects ethical shopping side panel
 */

// Track if panel is already injected
let isPanelInjected = false;
let productData = null;

/**
 * Detect which site we're on and extract product information
 */
function detectAndExtractProduct() {
  const hostname = window.location.hostname;
  let data = null;

  if (hostname.includes('amazon.com')) {
    data = extractAmazonProduct();
  } else if (hostname.includes('walmart.com')) {
    data = extractWalmartProduct();
  } else if (hostname.includes('target.com')) {
    data = extractTargetProduct();
  } else if (hostname.includes('bestbuy.com')) {
    data = extractBestBuyProduct();
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
 * Extract product data from Best Buy
 */
function extractBestBuyProduct() {
  const titleElement = document.querySelector('.sku-title h1, [class*="ProductTitle"]');
  const priceElement = document.querySelector('[class*="priceView-customer-price"] span[aria-hidden="true"]');

  if (!titleElement) return null;

  return {
    name: titleElement.textContent.trim(),
    price: priceElement ? priceElement.textContent.trim() : 'Price not available',
    site: 'Best Buy',
    url: window.location.href
  };
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

  // Load alternatives
  setTimeout(() => loadAlternatives(data), 500);
}

/**
 * Load and display ethical alternatives
 */
function loadAlternatives(data) {
  console.log('Vinegar: Loading alternatives');

  const alternativesList = document.getElementById('alternatives-list');
  const loadingState = document.getElementById('loading-state');

  if (!alternativesList) {
    console.error('Vinegar: Alternatives list not found');
    return;
  }

  // Show loading state
  if (loadingState) loadingState.style.display = 'block';

  // Simulate loading
  setTimeout(() => {
    if (loadingState) loadingState.style.display = 'none';

    // Generate mock alternatives
    const alternatives = generateMockAlternatives(data);

    // Clear existing
    alternativesList.innerHTML = '';

    // Add alternatives
    alternatives.forEach((alt, index) => {
      const card = createAlternativeCard(alt);
      alternativesList.appendChild(card);

      // Stagger animation
      setTimeout(() => {
        card.classList.add('vinegar-fade-in');
      }, index * 100);
    });

    console.log('Vinegar: Alternatives loaded');
  }, 1000);
}

/**
 * Generate mock alternatives
 */
function generateMockAlternatives(data) {
  const productName = data?.name || 'product';
  const basePrice = extractNumericPrice(data?.price);

  return [
    {
      name: `Local Shop - ${productName.substring(0, 30)}...`,
      price: formatPrice(basePrice * 1.15),
      rating: 4.8,
      type: 'local',
      typeLabel: 'Local Business',
      features: ['Family-owned', 'Same-day pickup', 'Expert advice'],
      url: '#'
    },
    {
      name: `EcoFriendly - Sustainable Alternative`,
      price: formatPrice(basePrice * 1.25),
      rating: 4.6,
      type: 'sustainable',
      typeLabel: 'Sustainable',
      features: ['Carbon neutral', 'Recycled materials', 'B-Corp certified'],
      url: '#'
    },
    {
      name: `Fair Trade Co-op - Similar Product`,
      price: formatPrice(basePrice * 1.10),
      rating: 4.7,
      type: 'ethical',
      typeLabel: 'Fair Trade',
      features: ['Worker-owned', 'Ethical sourcing', 'Living wages'],
      url: '#'
    }
  ];
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

  card.innerHTML = `
    <div class="alt-header">
      <h4 class="alt-name">${alt.name}</h4>
      <span class="alt-badge ${alt.type}">${alt.typeLabel}</span>
    </div>
    <div class="alt-details">
      <div class="alt-price">${alt.price}</div>
      <div class="alt-rating">
        <span class="stars">${stars}</span>
        <span class="rating-value">${alt.rating}/5</span>
      </div>
    </div>
    <div class="alt-features">
      ${alt.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
    </div>
    <div class="alt-actions">
      <a href="${alt.url}" target="_blank" class="alt-button primary">Visit Store</a>
      <button class="alt-button secondary">Save</button>
    </div>
  `;

  return card;
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
  setTimeout(() => {
    const data = detectAndExtractProduct();

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
