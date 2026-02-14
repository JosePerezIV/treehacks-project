/**
 * Vinegar Popup Controller
 * Manages extension settings and user preferences
 */

// Default settings
const DEFAULT_SETTINGS = {
  supportLocal: true,
  sustainableProducts: true,
  avoidedBrands: [] // Array of brand names to avoid
};

/**
 * Initialize popup
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  updateStats();
});

/**
 * Load settings from Chrome storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    const settings = result.settings || DEFAULT_SETTINGS;

    // Update toggle switches
    document.getElementById('toggle-local').checked = settings.supportLocal !== false;
    document.getElementById('toggle-sustainable').checked = settings.sustainableProducts !== false;

    // Load and display avoided brands
    loadBrandsList(settings.avoidedBrands || []);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Save settings to Chrome storage
 */
async function saveSettings() {
  const settings = {
    supportLocal: document.getElementById('toggle-local').checked,
    sustainableProducts: document.getElementById('toggle-sustainable').checked,
    avoidedBrands: await getAvoidedBrands()
  };

  try {
    await chrome.storage.sync.set({ settings });
    console.log('Settings saved:', settings);

    // Notify content scripts of settings change
    chrome.runtime.sendMessage({
      type: 'SETTINGS_UPDATED',
      data: settings
    }).catch(() => {
      // Content script might not be loaded yet, that's okay
    });

    // Show visual feedback
    showSaveNotification();
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Get current list of avoided brands
 */
async function getAvoidedBrands() {
  try {
    const result = await chrome.storage.sync.get('settings');
    const settings = result.settings || DEFAULT_SETTINGS;
    return settings.avoidedBrands || [];
  } catch (error) {
    console.error('Error getting avoided brands:', error);
    return [];
  }
}

/**
 * Load and display brands list
 */
function loadBrandsList(brands) {
  const brandsList = document.getElementById('brands-list');
  if (!brandsList) return;

  if (!brands || brands.length === 0) {
    brandsList.innerHTML = '<div class="empty-brands">No brands added yet. Add brands above to avoid them.</div>';
    return;
  }

  brandsList.innerHTML = '';
  brands.forEach(brand => {
    const brandTag = createBrandTag(brand);
    brandsList.appendChild(brandTag);
  });
}

/**
 * Create a brand tag element
 */
function createBrandTag(brandName) {
  const tag = document.createElement('div');
  tag.className = 'brand-tag';

  const name = document.createElement('span');
  name.className = 'brand-name';
  name.textContent = brandName;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-brand-btn';
  removeBtn.textContent = '×';
  removeBtn.setAttribute('aria-label', `Remove ${brandName}`);
  removeBtn.addEventListener('click', () => removeBrand(brandName));

  tag.appendChild(name);
  tag.appendChild(removeBtn);

  return tag;
}

/**
 * Add a new brand to avoid
 */
async function addBrand() {
  const input = document.getElementById('brand-input');
  if (!input) return;

  const brandName = input.value.trim();

  // Validate input
  if (!brandName) {
    return;
  }

  if (brandName.length > 50) {
    alert('Brand name is too long (max 50 characters)');
    return;
  }

  // Get current brands
  const brands = await getAvoidedBrands();

  // Check for duplicates (case-insensitive)
  const brandLower = brandName.toLowerCase();
  if (brands.some(b => b.toLowerCase() === brandLower)) {
    alert('This brand is already in your list');
    return;
  }

  // Add new brand
  brands.push(brandName);

  // Save to storage
  const settings = {
    supportLocal: document.getElementById('toggle-local').checked,
    sustainableProducts: document.getElementById('toggle-sustainable').checked,
    avoidedBrands: brands
  };

  try {
    await chrome.storage.sync.set({ settings });

    // Update UI
    loadBrandsList(brands);

    // Clear input
    input.value = '';

    // Show notification
    showSaveNotification();

    // Notify content scripts
    chrome.runtime.sendMessage({
      type: 'SETTINGS_UPDATED',
      data: settings
    }).catch(() => {});

  } catch (error) {
    console.error('Error adding brand:', error);
    alert('Failed to add brand. Please try again.');
  }
}

/**
 * Remove a brand from the avoid list
 */
async function removeBrand(brandName) {
  const brands = await getAvoidedBrands();
  const updatedBrands = brands.filter(b => b !== brandName);

  // Save to storage
  const settings = {
    supportLocal: document.getElementById('toggle-local').checked,
    sustainableProducts: document.getElementById('toggle-sustainable').checked,
    avoidedBrands: updatedBrands
  };

  try {
    await chrome.storage.sync.set({ settings });

    // Update UI
    loadBrandsList(updatedBrands);

    // Show notification
    showSaveNotification();

    // Notify content scripts
    chrome.runtime.sendMessage({
      type: 'SETTINGS_UPDATED',
      data: settings
    }).catch(() => {});

  } catch (error) {
    console.error('Error removing brand:', error);
    alert('Failed to remove brand. Please try again.');
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Toggle switches
  const toggles = ['toggle-local', 'toggle-sustainable'];

  toggles.forEach(toggleId => {
    const toggle = document.getElementById(toggleId);
    if (toggle) {
      toggle.addEventListener('change', () => {
        saveSettings();
        // Add subtle animation on toggle
        toggle.parentElement.parentElement.style.transform = 'scale(1.02)';
        setTimeout(() => {
          toggle.parentElement.parentElement.style.transform = 'scale(1)';
        }, 150);
      });
    }
  });

  // Add brand button
  const addBrandBtn = document.getElementById('add-brand-btn');
  if (addBrandBtn) {
    addBrandBtn.addEventListener('click', addBrand);
  }

  // Brand input - add on Enter key
  const brandInput = document.getElementById('brand-input');
  if (brandInput) {
    brandInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addBrand();
      }
    });
  }

  // Footer links
  document.getElementById('link-about')?.addEventListener('click', (e) => {
    e.preventDefault();
    showAboutDialog();
  });

  document.getElementById('link-feedback')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/yourrepo/vinegar/issues' });
  });

  document.getElementById('link-privacy')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPrivacyDialog();
  });
}

/**
 * Update statistics display
 */
async function updateStats() {
  try {
    const result = await chrome.storage.local.get('stats');
    const stats = result.stats || {
      alternativesFound: 0,
      localSupport: 0,
      co2Saved: 0
    };

    // Update stat displays with animation
    animateValue('stat-alternatives', 0, stats.alternativesFound, 1000);
    animateValue('stat-local', 0, stats.localSupport, 1000, '$');
    animateValue('stat-co2', 0, stats.co2Saved, 1000, '', ' kg');
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

/**
 * Animate number counting up
 */
function animateValue(elementId, start, end, duration, prefix = '', suffix = '') {
  const element = document.getElementById(elementId);
  if (!element) return;

  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;

  const timer = setInterval(() => {
    current += increment;
    if (current >= end) {
      current = end;
      clearInterval(timer);
    }
    element.textContent = prefix + Math.floor(current) + suffix;
  }, 16);
}

/**
 * Show save notification
 */
function showSaveNotification() {
  // Create temporary notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #7ba05b;
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    z-index: 10000;
    animation: slideInRight 0.3s ease;
  `;
  notification.textContent = '✓ Settings saved';

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

/**
 * Show about dialog
 */
function showAboutDialog() {
  alert(`Vinegar - Ethical Shopping Assistant

Version 1.0.0

Vinegar helps you make more ethical shopping choices by identifying corporations and suggesting local, sustainable, and fair-trade alternatives.

Our mission is to empower consumers to vote with their wallets and support businesses that align with their values.

Made with 🍃 for conscious consumers`);
}

/**
 * Show privacy dialog
 */
function showPrivacyDialog() {
  alert(`Privacy Policy

Vinegar respects your privacy:

• We do not collect personal information
• Product browsing data stays on your device
• No tracking or analytics
• Settings are stored locally using Chrome Sync
• Open source and transparent

Your data is yours alone.`);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
