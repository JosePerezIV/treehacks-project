/**
 * Vinegar Content Script
 * Detects product pages and injects ethical shopping side panel
 */

// Track if panel is already injected
let isPanelInjected = false;

/**
 * Detect which site we're on and extract product information
 */
function detectAndExtractProduct() {
  const hostname = window.location.hostname;
  let productData = null;

  if (hostname.includes('amazon.com')) {
    productData = extractAmazonProduct();
  } else if (hostname.includes('walmart.com')) {
    productData = extractWalmartProduct();
  } else if (hostname.includes('target.com')) {
    productData = extractTargetProduct();
  } else if (hostname.includes('bestbuy.com')) {
    productData = extractBestBuyProduct();
  }

  return productData;
}

/**
 * Extract product data from Amazon
 */
function extractAmazonProduct() {
  const titleElement = document.querySelector('#productTitle, #title');
  const priceElement = document.querySelector('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice');

  if (!titleElement) return null;

  return {
    name: titleElement.textContent.trim(),
    price: priceElement ? priceElement.textContent.trim() : 'Price not available',
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
async function injectSidePanel(productData) {
  if (isPanelInjected) return;

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

  // Load the side panel script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('sidepanel.js');
  document.body.appendChild(script);

  // Wait for script to load and initialize panel
  script.onload = () => {
    if (window.vinegarSidePanel) {
      window.vinegarSidePanel.initialize(productData);
    }
  };

  isPanelInjected = true;

  // Send product data to background script
  chrome.runtime.sendMessage({
    type: 'PRODUCT_DETECTED',
    data: productData
  });
}

/**
 * Initialize the extension on page load
 */
function initialize() {
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
      checkForProduct();
    }
  }).observe(document, { subtree: true, childList: true });
}

/**
 * Check if we're on a product page and inject panel
 */
async function checkForProduct() {
  // Wait a bit for dynamic content to load
  setTimeout(() => {
    const productData = detectAndExtractProduct();

    if (productData) {
      console.log('Vinegar: Product detected', productData);
      injectSidePanel(productData);
    }
  }, 1500);
}

// Start the extension
initialize();
