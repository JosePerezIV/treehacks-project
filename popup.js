/**
 * Vinegar Popup Controller
 * Manages extension settings and user preferences
 */

// Default settings
const DEFAULT_SETTINGS = {
  supportLocal: true,
  avoidAmazon: true,
  avoidNestle: true,
  sustainableProducts: true
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
    document.getElementById('toggle-local').checked = settings.supportLocal;
    document.getElementById('toggle-amazon').checked = settings.avoidAmazon;
    document.getElementById('toggle-nestle').checked = settings.avoidNestle;
    document.getElementById('toggle-sustainable').checked = settings.sustainableProducts;
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
    avoidAmazon: document.getElementById('toggle-amazon').checked,
    avoidNestle: document.getElementById('toggle-nestle').checked,
    sustainableProducts: document.getElementById('toggle-sustainable').checked
  };

  try {
    await chrome.storage.sync.set({ settings });
    console.log('Settings saved:', settings);

    // Notify content scripts of settings change
    chrome.runtime.sendMessage({
      type: 'SETTINGS_UPDATED',
      data: settings
    });

    // Show visual feedback
    showSaveNotification();
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Setup event listeners for toggle switches
 */
function setupEventListeners() {
  const toggles = [
    'toggle-local',
    'toggle-amazon',
    'toggle-nestle',
    'toggle-sustainable'
  ];

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

Vinegar helps you make more ethical shopping choices by identifying mega-corporations and suggesting local, sustainable, and fair-trade alternatives.

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
