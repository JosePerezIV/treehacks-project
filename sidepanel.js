/**
 * Vinegar Side Panel Controller
 * Manages the injected side panel UI and interactions
 */

window.vinegarSidePanel = {
  isExpanded: false,
  productData: null,

  /**
   * Initialize the side panel with product data
   */
  initialize(productData) {
    this.productData = productData;
    this.setupEventListeners();
    this.populateProductInfo();
    this.loadAlternatives();
  },

  /**
   * Setup event listeners for panel interactions
   */
  setupEventListeners() {
    const toggle = document.getElementById('vinegar-toggle');
    const panel = document.getElementById('vinegar-panel');

    if (!toggle || !panel) return;

    toggle.addEventListener('click', () => {
      this.togglePanel();
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isExpanded) {
        this.togglePanel();
      }
    });
  },

  /**
   * Toggle panel open/closed
   */
  togglePanel() {
    const container = document.getElementById('vinegar-sidepanel-container');
    const panel = document.getElementById('vinegar-panel');

    if (!container || !panel) return;

    this.isExpanded = !this.isExpanded;

    if (this.isExpanded) {
      container.classList.remove('vinegar-collapsed');
      container.classList.add('vinegar-expanded');
      // Add animation class
      panel.classList.add('vinegar-slide-in');
      setTimeout(() => panel.classList.remove('vinegar-slide-in'), 300);
    } else {
      container.classList.remove('vinegar-expanded');
      container.classList.add('vinegar-collapsed');
    }
  },

  /**
   * Populate product information in the panel
   */
  populateProductInfo() {
    if (!this.productData) return;

    const productInfo = document.getElementById('product-info');
    if (!productInfo) return;

    const nameEl = productInfo.querySelector('.product-name');
    const priceEl = productInfo.querySelector('.product-price');
    const siteEl = productInfo.querySelector('.product-site');

    if (nameEl) nameEl.textContent = this.productData.name;
    if (priceEl) priceEl.textContent = this.productData.price;
    if (siteEl) {
      siteEl.innerHTML = `<span class="site-badge">${this.productData.site}</span>`;
    }
  },

  /**
   * Load and display ethical alternatives
   */
  async loadAlternatives() {
    const alternativesList = document.getElementById('alternatives-list');
    if (!alternativesList) return;

    // Show loading state
    const loadingState = document.getElementById('loading-state');
    if (loadingState) loadingState.style.display = 'block';

    // Simulate API call - in production, this would call a real API
    await this.simulateApiDelay(1000);

    // Hide loading state
    if (loadingState) loadingState.style.display = 'none';

    // Generate mock alternatives based on product
    const alternatives = this.generateMockAlternatives();

    // Clear existing alternatives
    alternativesList.innerHTML = '';

    // Populate alternatives
    alternatives.forEach((alt, index) => {
      const altCard = this.createAlternativeCard(alt);
      alternativesList.appendChild(altCard);

      // Stagger animation
      setTimeout(() => {
        altCard.classList.add('vinegar-fade-in');
      }, index * 100);
    });
  },

  /**
   * Create an alternative product card
   */
  createAlternativeCard(alternative) {
    const card = document.createElement('div');
    card.className = 'alternative-card';

    card.innerHTML = `
      <div class="alt-header">
        <h4 class="alt-name">${alternative.name}</h4>
        <span class="alt-badge ${alternative.type}">${alternative.typeLabel}</span>
      </div>
      <div class="alt-details">
        <div class="alt-price">${alternative.price}</div>
        <div class="alt-rating">
          <span class="stars">${this.generateStars(alternative.rating)}</span>
          <span class="rating-value">${alternative.rating}/5</span>
        </div>
      </div>
      <div class="alt-features">
        ${alternative.features.map(f => `
          <span class="feature-tag">${f}</span>
        `).join('')}
      </div>
      <div class="alt-actions">
        <a href="${alternative.url}" target="_blank" class="alt-button primary">
          Visit Store
        </a>
        <button class="alt-button secondary" onclick="window.vinegarSidePanel.saveAlternative('${alternative.name}')">
          Save
        </button>
      </div>
    `;

    return card;
  },

  /**
   * Generate star rating HTML
   */
  generateStars(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    let stars = '';

    for (let i = 0; i < fullStars; i++) {
      stars += '⭐';
    }
    if (halfStar) {
      stars += '✨';
    }

    return stars;
  },

  /**
   * Generate mock alternatives (placeholder for API integration)
   */
  generateMockAlternatives() {
    const productName = this.productData?.name || 'product';

    return [
      {
        name: `Local Shop - ${productName.substring(0, 30)}...`,
        price: this.adjustPrice(this.productData?.price, 1.15),
        rating: 4.8,
        type: 'local',
        typeLabel: 'Local Business',
        features: ['Family-owned', 'Same-day pickup', 'Expert advice'],
        url: '#'
      },
      {
        name: `EcoFriendly - Sustainable Alternative`,
        price: this.adjustPrice(this.productData?.price, 1.25),
        rating: 4.6,
        type: 'sustainable',
        typeLabel: 'Sustainable',
        features: ['Carbon neutral', 'Recycled materials', 'B-Corp certified'],
        url: '#'
      },
      {
        name: `Fair Trade Co-op - Similar Product`,
        price: this.adjustPrice(this.productData?.price, 1.10),
        rating: 4.7,
        type: 'ethical',
        typeLabel: 'Fair Trade',
        features: ['Worker-owned', 'Ethical sourcing', 'Living wages'],
        url: '#'
      }
    ];
  },

  /**
   * Adjust price for alternatives
   */
  adjustPrice(originalPrice, multiplier) {
    if (!originalPrice || originalPrice === 'Price not available') {
      return 'Contact for price';
    }

    // Extract numeric price
    const priceMatch = originalPrice.match(/[\d,]+\.?\d*/);
    if (!priceMatch) return 'Contact for price';

    const price = parseFloat(priceMatch[0].replace(',', ''));
    const newPrice = (price * multiplier).toFixed(2);

    return `$${newPrice}`;
  },

  /**
   * Save alternative for later
   */
  saveAlternative(name) {
    // In production, this would save to Chrome storage
    console.log('Saving alternative:', name);

    // Show feedback
    this.showNotification('Alternative saved! Check your extension popup to view saved items.');
  },

  /**
   * Show notification to user
   */
  showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'vinegar-notification';
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  },

  /**
   * Simulate API delay
   */
  simulateApiDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
