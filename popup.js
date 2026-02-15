/**
 * Bramble Popup Controller
 * Manages extension settings and user preferences
 */

// Default settings
const DEFAULT_SETTINGS = {
  supportLocal: true,
  sustainableProducts: true,
  avoidedBrands: [], // Array of brand names to avoid
  location: null // { lat, lon, display, zipCode }
};

/**
 * Initialize popup
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadLocation();
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

    // Load location is called separately in initialize
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Load and display location
 */
async function loadLocation() {
  try {
    const result = await chrome.storage.sync.get('settings');
    const settings = result.settings || DEFAULT_SETTINGS;
    const location = settings.location;

    const locationDisplay = document.getElementById('location-display');
    if (!locationDisplay) return;

    if (location && location.lat && location.lon) {
      locationDisplay.textContent = location.display || estimateCityState(location.lat, location.lon);
      locationDisplay.classList.remove('not-set');
    } else {
      locationDisplay.textContent = 'Not set';
      locationDisplay.classList.add('not-set');
    }
  } catch (error) {
    console.error('Error loading location:', error);
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
 * Detect user's location using geolocation API
 */
async function detectLocation() {
  const btn = document.getElementById('detect-location-btn');
  const btnText = document.getElementById('location-btn-text');
  const errorDiv = document.getElementById('location-error');

  if (!btn || !btnText) return;

  // Hide any previous errors
  if (errorDiv) errorDiv.style.display = 'none';

  // Show loading state
  btn.disabled = true;
  btn.classList.add('loading');
  btnText.innerHTML = '<div class="spinner-small"></div> Detecting...';

  try {
    // Request geolocation
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    });

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    // Validate coordinates
    if (!isValidCoordinates(lat, lon)) {
      throw new Error('Invalid coordinates received');
    }

    // Get location description
    const display = estimateCityState(lat, lon);

    // Save location
    await saveLocation(lat, lon, display);

    // Update display
    await loadLocation();

    // Show success message
    showSaveNotification('📍 Location detected!');

  } catch (error) {
    console.error('Geolocation error:', error);

    // Show user-friendly error message
    let errorMessage = 'Could not detect location. ';

    if (error.code === 1) {
      errorMessage += 'Please allow location access in your browser settings.';
    } else if (error.code === 2) {
      errorMessage += 'Location service unavailable. Try entering your ZIP code instead.';
    } else if (error.code === 3) {
      errorMessage += 'Request timed out. Try again or enter your ZIP code.';
    } else {
      errorMessage += 'Please try again or enter your ZIP code manually.';
    }

    if (errorDiv) {
      errorDiv.textContent = errorMessage;
      errorDiv.style.display = 'block';
    }

  } finally {
    // Reset button state
    btn.disabled = false;
    btn.classList.remove('loading');
    btnText.textContent = '📍 Detect My Location';
  }
}

/**
 * Submit ZIP code manually
 */
async function submitZipCode() {
  const input = document.getElementById('zip-input');
  const errorDiv = document.getElementById('location-error');

  if (!input) return;

  const zipCode = input.value.trim();

  // Hide previous errors
  if (errorDiv) errorDiv.style.display = 'none';

  // Validate ZIP code
  if (!zipCode) {
    return;
  }

  if (!/^\d{5}$/.test(zipCode)) {
    if (errorDiv) {
      errorDiv.textContent = 'Please enter a valid 5-digit ZIP code.';
      errorDiv.style.display = 'block';
    }
    return;
  }

  try {
    // In production, you would use a ZIP code geocoding API
    // For now, we'll use mock coordinates
    const mockCoords = getMockCoordinatesForZip(zipCode);

    await saveLocation(mockCoords.lat, mockCoords.lon, `ZIP ${zipCode}`, zipCode);

    // Update display
    await loadLocation();

    // Clear input
    input.value = '';

    // Show success
    showSaveNotification('📍 ZIP code saved!');

  } catch (error) {
    console.error('Error saving ZIP code:', error);
    if (errorDiv) {
      errorDiv.textContent = 'Failed to save ZIP code. Please try again.';
      errorDiv.style.display = 'block';
    }
  }
}

/**
 * Save location to storage
 */
async function saveLocation(lat, lon, display, zipCode = null) {
  try {
    const result = await chrome.storage.sync.get('settings');
    const settings = result.settings || DEFAULT_SETTINGS;

    settings.location = {
      lat,
      lon,
      display,
      zipCode,
      timestamp: Date.now()
    };

    await chrome.storage.sync.set({ settings });

    // Notify content scripts
    chrome.runtime.sendMessage({
      type: 'SETTINGS_UPDATED',
      data: settings
    }).catch(() => {});

  } catch (error) {
    console.error('Error saving location:', error);
    throw error;
  }
}

/**
 * Get mock coordinates for ZIP code (placeholder)
 * In production, use a real ZIP code geocoding API
 */
function getMockCoordinatesForZip(zipCode) {
  // Mock data - in production, use real API
  const firstDigit = zipCode.charAt(0);

  // Rough US regions based on ZIP code first digit
  const regions = {
    '0': { lat: 42.36, lon: -71.06 }, // New England
    '1': { lat: 40.71, lon: -74.01 }, // New York area
    '2': { lat: 38.91, lon: -77.04 }, // DC area
    '3': { lat: 33.75, lon: -84.39 }, // Atlanta area
    '4': { lat: 39.96, lon: -83.00 }, // Ohio area
    '5': { lat: 41.88, lon: -87.63 }, // Chicago area
    '6': { lat: 38.63, lon: -90.20 }, // St. Louis area
    '7': { lat: 32.78, lon: -96.80 }, // Dallas area
    '8': { lat: 39.74, lon: -104.99 }, // Denver area
    '9': { lat: 37.77, lon: -122.42 }  // SF area
  };

  return regions[firstDigit] || { lat: 39.0, lon: -98.0 }; // Center of US
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

  // Location detection button
  const detectLocationBtn = document.getElementById('detect-location-btn');
  if (detectLocationBtn) {
    detectLocationBtn.addEventListener('click', detectLocation);
  }

  // ZIP code submission
  const zipSubmitBtn = document.getElementById('zip-submit-btn');
  if (zipSubmitBtn) {
    zipSubmitBtn.addEventListener('click', submitZipCode);
  }

  // ZIP input - submit on Enter key
  const zipInput = document.getElementById('zip-input');
  if (zipInput) {
    zipInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitZipCode();
      }
    });
  }

  // Reset stats button
  const resetStatsBtn = document.getElementById('reset-stats-btn');
  if (resetStatsBtn) {
    resetStatsBtn.addEventListener('click', resetImpactStats);
    resetStatsBtn.addEventListener('mouseenter', () => {
      resetStatsBtn.style.background = '#d4dac9';
    });
    resetStatsBtn.addEventListener('mouseleave', () => {
      resetStatsBtn.style.background = '#e8ebe0';
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
    const result = await chrome.storage.local.get('impactData');
    const impact = result.impactData || {
      alternativesViewed: 0,
      sessionsWithAlternatives: 0,
      startDate: Date.now()
    };

    // Update stat display with animation
    animateValue('stat-alternatives', 0, impact.alternativesViewed, 1000);

    // Add tooltip explaining the number
    const altStat = document.getElementById('stat-alternatives');
    if (altStat) altStat.title = 'Number of alternative products you\'ve explored';

  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

/**
 * Reset impact statistics
 */
async function resetImpactStats() {
  if (!confirm('Are you sure you want to reset your impact statistics? This cannot be undone.')) {
    return;
  }

  try {
    await chrome.storage.local.set({
      impactData: {
        alternativesViewed: 0,
        sessionsWithAlternatives: 0,
        startDate: Date.now()
      }
    });

    // Update display
    await updateStats();
    showSaveNotification('📊 Impact stats reset');
  } catch (error) {
    console.error('Error resetting stats:', error);
    alert('Failed to reset stats. Please try again.');
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
  alert(`Bramble - Ethical Shopping Assistant

Version 1.0.0

Bramble helps you make more ethical shopping choices by identifying corporations and suggesting local, sustainable, and fair-trade alternatives.

Our mission is to empower consumers to vote with their wallets and support businesses that align with their values.

Made with 🍃 for conscious consumers`);
}

/**
 * Show privacy dialog
 */
function showPrivacyDialog() {
  alert(`Privacy Policy

Bramble respects your privacy:

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
