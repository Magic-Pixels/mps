class GiftFinder {
  constructor() {
    this.occasions = [];
    this.persons = [];
    this.interests = [];
    this.selectedOccasion = '';
    this.selectedPerson = '';
    this.selectedInterest = '';
    this.selectedBudget = 100;
    this.currentPage = 1;
    this.totalPages = 1;
    this.products = [];
    this.isLoading = false;
    this.observer = null;
    this.debounceTimers = {};
    this.selectedDropdownIndex = -1;
    this.failedPages = new Set();
    this.maxRetries = 3;
    this.retryCount = 0;

    this.init();
  }

  async init() {
    try {
      await this.loadIndex();
      this.getActiveValuesFromInputs();
      this.initializeFromURL();
      this.setupInfiniteScroll();
      this.preloadData();
      this.setupEventListeners();
    } catch (error) {
      console.error('Initialization failed:', error);
      // Gracefully continue - user can still interact with the page
    }
  }

  async loadIndex() {
    try {
      // Load data from embedded window.giftsData (set in gift-finder.html)
      if (window.giftsData) {
        const giftsData = window.giftsData;

        // Extract values from the data structure
        this.occasions = giftsData.occasions.map(o => o.value).filter(Boolean).sort();
        this.persons = giftsData.audience.map(a => a.value).filter(Boolean).sort();
        this.interests = giftsData.interests.map(i => i.value).filter(Boolean).sort();
      } else {
        throw new Error('Gifts data not available');
      }
    } catch (error) {
      console.error('Error loading gifts data:', error);
      // Fallback: extract values from HTML form elements
      const audienceSelect = document.getElementById('audience');
      const occasionInputs = document.querySelectorAll('input[name="occasion"]');
      const interestInputs = document.querySelectorAll('input[name="interest"]');

      this.persons = Array.from(audienceSelect.options)
        .map(opt => opt.value)
        .filter(val => val !== '')
        .sort();

      this.occasions = Array.from(occasionInputs)
        .map(input => input.value)
        .filter(Boolean)
        .sort();

      this.interests = Array.from(interestInputs)
        .map(input => input.value)
        .filter(Boolean)
        .sort();
    }
  }

  getActiveValuesFromInputs() {
    // Get active audience/person selection
    const audienceSelect = document.getElementById('audience');
    if (audienceSelect && audienceSelect.value) {
      this.selectedPerson = audienceSelect.value;
    }
    
    // Get active occasion selection
    const selectedOccasion = document.querySelector('input[name="occasion"]:checked');
    if (selectedOccasion) {
      this.selectedOccasion = selectedOccasion.value;
    }
    
    // Get active interest selection
    const selectedInterest = document.querySelector('input[name="interest"]:checked');
    if (selectedInterest) {
      this.selectedInterest = selectedInterest.value;
    }
    
    // Get budget value
    const budgetSlider = document.getElementById('budgetSlider');
    if (budgetSlider) {
      this.selectedBudget = parseInt(budgetSlider.value) || 100;
    }
  }

  initializeFromURL() {
    // Check if URL contains gift selection path
    const path = window.location.pathname;
    const match = path.match(/\/gifts\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
    
    if (match) {
      const [, occasion, person, interest] = match;
      
      // Validate and set selections if they exist in our data
      if (this.occasions.includes(occasion)) {
        this.selectedOccasion = occasion;
      } else if (!this.selectedOccasion) {
        this.selectedOccasion = this.occasions[0] || '';
      }
      
      if (this.persons.includes(person)) {
        this.selectedPerson = person;
      } else if (!this.selectedPerson) {
        this.selectedPerson = this.persons[0] || '';
      }
      
      if (this.interests.includes(interest)) {
        this.selectedInterest = interest;
      } else if (!this.selectedInterest) {
        this.selectedInterest = this.interests[0] || '';
      }

      console.log('Initialized from URL:', this.selectedOccasion, this.selectedPerson, this.selectedInterest);
      
      // Load products if all selections are valid
      if (this.selectedOccasion && this.selectedPerson && this.selectedInterest) {
        this.loadProducts();
      }
    }
  }

  setupEventListeners() {
    // Audience/Person selection
    const audienceSelect = document.getElementById('audience');
    if (audienceSelect) {
      audienceSelect.addEventListener('change', (e) => {
        this.selectedPerson = e.target.value;
        if (this.selectedOccasion && this.selectedInterest) {
          this.loadProducts();
        }
      });
    }
    
    // Occasion selection
    document.querySelectorAll('input[name="occasion"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.selectedOccasion = e.target.value;
        if (this.selectedPerson && this.selectedInterest) {
          this.loadProducts();
        }
      });
    });
    
    // Interest selection
    document.querySelectorAll('input[name="interest"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.selectedInterest = e.target.value;
        if (this.selectedPerson && this.selectedOccasion) {
          this.loadProducts();
        }
      });
    });
    
    // Budget slider
    const budgetSlider = document.getElementById('budgetSlider');
    if (budgetSlider) {
      budgetSlider.addEventListener('input', (e) => {
        this.selectedBudget = parseInt(e.target.value) || 100;
        console.log('Budget updated:', this.selectedBudget);
      });
    }
  }

  async loadProducts(page = 1) {
    if (this.isLoading) return;

    if (!this.selectedOccasion) 
      this.selectedOccasion = this.occasions[0];
    if(!this.selectedPerson) 
      this.selectedPerson = this.persons[0];
    if(!this.selectedInterest)
      this.selectedInterest = this.interests[0];

    this.isLoading = true;
    this.currentPage = page;

    if (page === 1) {
      this.showLoading();
      this.failedPages.clear();
      this.retryCount = 0;
    }

    try {
      const path = `/gifts/${this.selectedOccasion}/${this.selectedPerson}/${this.selectedInterest}/`;
      const url = page === 1 ?
        `${path}index.json` :
        `${path}page/${page}/index.json`;

      console.log(`Loading products from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {

        if (response.status === 404) {
          this.totalPages = 0;
          this.showNoResults();
          return;
        }

        // Try to load next page if this one fails (graceful degradation)
        if (page < 5 && !this.failedPages.has(page)) {
          this.failedPages.add(page);
          console.warn(`Page ${page} failed, trying next page...`);
          this.isLoading = false;
          await this.loadProducts(page + 1);
          return;
        }

        if (page === 1) {
          this.showNoResults();
        } else {
          this.showNoMoreResults();
        }
        return;
      }

      const data = await response.json();

      if (page === 1) {
        this.products = data.products || [];
        this.totalPages = data.totalPages || 1;
        this.renderProducts(this.products);
      } else {
        const newProducts = data.products || [];
        this.products = [...this.products, ...newProducts];
        this.appendProducts(newProducts);
      }

      if (this.currentPage >= this.totalPages) {
        this.showNoMoreResults();
      } else {
        // Preload the next page for better UX
        this.preloadData();
      }

    } catch (error) {
      console.error('Failed to load products:', error);

      // Retry logic for network errors
      if (this.retryCount < this.maxRetries && page === 1) {
        this.retryCount++;
        console.log(`Retrying... (${this.retryCount}/${this.maxRetries})`);
        setTimeout(() => {
          this.isLoading = false;
          this.loadProducts(page);
        }, 1000 * this.retryCount); // Exponential backoff
      } else if (page === 1) {
        this.show404Error();
      } else {
        // Silently fail for pagination errors
        this.showNoMoreResults();
      }
    } finally {
      this.isLoading = false;
      this.hideLoading();
    }
  }

  renderProducts(products) {
    const container = document.getElementById('products-container');

    // Fade out animation
    container.classList.add('fade-transition', 'hiding');

    setTimeout(() => {
      container.innerHTML = '';

      products.forEach((product, index) => {
        const productHTML = this.createProductCard(product, index);
        container.innerHTML += productHTML;
      });

      // Fade in animation
      container.classList.remove('hiding');
      setTimeout(() => container.classList.remove('fade-transition'), 300);
    }, 150);
  }

  appendProducts(products) {
    const container = document.getElementById('products-container');
    const startIndex = this.products.length - products.length;

    products.forEach((product, index) => {
      const productHTML = this.createProductCard(product, startIndex + index);
      container.innerHTML += productHTML;
    });
  }

  createProductCard(product, index) {
    const template = document.getElementById('gift-product-template');
    if (!template) {
      console.error('Product template not found');
      return '';
    }

    // Clone the template
    const clone = template.content.cloneNode(true);
    const wrapper = clone.querySelector('.product-card-wrapper');

    // Set animation delay
    if (wrapper) {
      wrapper.style.animationDelay = `${(index % 12) * 0.05}s`;
    }

    // Calculate prices
    const discount = product.discount || 0;
    const hasDiscount = discount > 0;
    const price = product.price || 0;
    const finalPrice = hasDiscount ?
      (price * (1 - discount / 100)).toFixed(2) :
      price.toFixed(2);

    // Set images
    const primaryImage = clone.querySelector('[data-primary-image]');
    const secondaryImage = clone.querySelector('[data-secondary-image]');
    const images = product.images || [];

    if (primaryImage && images.length > 0) {
      primaryImage.src = images[0];
      primaryImage.alt = `${product.title}`;

      if (secondaryImage && images.length > 1) {
        secondaryImage.src = images[1];
        secondaryImage.alt = `${product.title}`;
        // Secondary image is already in the template from Hugo, just update src
      }
    }

    // Show/hide discount badge (Hugo renders it, we just control visibility)
    const saleBadge = clone.querySelector('[data-sale-badge]');
    if (saleBadge) {
      if (hasDiscount) {
        // Badge is rendered by Hugo, just make sure it's visible
        saleBadge.style.display = '';
      } else {
        saleBadge.style.display = 'none';
      }
    }

    // Update ecommerce badge (Hugo partial handles styling)
    const ecommerceBadge = clone.querySelector('[data-ecommerce-badge]');
    if (ecommerceBadge) {
      if (product.ecommerce) {
        // Hugo partial already has the right structure, just update text
        const badgeLabel = ecommerceBadge.querySelector('.product-label');
        const badgeText = ecommerceBadge.querySelector('span');
        const amazonIcon = ecommerceBadge.querySelector('.fa-amazon');

        if (badgeText) {
          badgeText.textContent = product.ecommerce;
        }

        // Update badge styling based on platform
        if (badgeLabel) {
          badgeLabel.classList.remove('bg-warning', 'bg-danger', 'bg-etsy', 'text-white');
          if (product.ecommerce === 'RedBubble') {
            badgeLabel.classList.add('bg-danger', 'text-white');
          } else if (product.ecommerce === 'Etsy') {
            badgeLabel.classList.add('bg-etsy', 'text-white');
          } else {
            badgeLabel.classList.add('bg-warning');
          }
        }

        // Show/hide Amazon icon
        if (amazonIcon) {
          amazonIcon.style.display = product.ecommerce === 'Amazon' ? '' : 'none';
        }
      } else {
        ecommerceBadge.style.display = 'none';
      }
    }

    // Set product link
    const productLink = clone.querySelector('[data-product-link]');
    if (productLink) {
      productLink.href = product.ecommerce_url || '#';
      productLink.setAttribute('aria-label', `Buy ${product.title} on ${product.ecommerce}`);
    }

    // Set product title
    const titleElement = clone.querySelector('[data-product-title]');
    if (titleElement) {
      titleElement.textContent = product.title;
    }

    // Set rating and reviews
    const ratingContainer = clone.querySelector('[data-rating-container]');
    if (ratingContainer && product.rating && product.rating > 0) {
      const ratingStars = clone.querySelector('[data-rating-stars]');
      const ratingText = clone.querySelector('[data-rating-text]');
      const reviewCount = clone.querySelector('[data-review-count]');

      ratingContainer.style.display = '';

      // Generate star icons
      if (ratingStars) {
        const fullStars = Math.floor(product.rating);
        const hasHalfStar = product.rating % 1 >= 0.5;
        let starsHTML = '';

        for (let i = 0; i < fullStars; i++) {
          starsHTML += '★';
        }
        if (hasHalfStar) {
          starsHTML += '⯨';
        }
        for (let i = fullStars + (hasHalfStar ? 1 : 0); i < 5; i++) {
          starsHTML += '☆';
        }

        ratingStars.innerHTML = starsHTML;
      }

      if (ratingText) {
        ratingText.textContent = product.rating.toFixed(1);
      }

      if (reviewCount && product.review_count && product.review_count > 0) {
        reviewCount.textContent = `(${product.review_count.toLocaleString()})`;
      }
    } else if (ratingContainer) {
      ratingContainer.style.display = 'none';
    }

    // Set price
    const priceElement = clone.querySelector('[data-product-price]');
    if (priceElement) {
      priceElement.textContent = `$${finalPrice}`;
    }

    // Set discount info
    const discountInfo = clone.querySelector('[data-discount-info]');
    if (discountInfo) {
      if (hasDiscount) {
        const originalPrice = clone.querySelector('[data-original-price]');
        const discountBadge = clone.querySelector('[data-discount-badge]');

        discountInfo.style.display = '';
        if (originalPrice) {
          originalPrice.textContent = `$${price.toFixed(2)}`;
        }
        if (discountBadge) {
          discountBadge.textContent = `-${discount}%`;
        }
      } else {
        discountInfo.style.display = 'none';
      }
    }

    // Create a temporary container to get the HTML
    const temp = document.createElement('div');
    temp.appendChild(clone);
    return temp.innerHTML;
  }

  setupInfiniteScroll() {
    const trigger = document.getElementById('load-more-trigger');

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.isLoading && this.currentPage < this.totalPages) {
          trigger.classList.remove('d-none');
          console.log('Loading more products...');
          this.loadProducts(this.currentPage + 1);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '100px' // Start loading before reaching the trigger
    });

    this.observer.observe(trigger);
  }

  preloadData() {
    // Preload next page of current selection in background
    if (this.selectedOccasion && this.selectedPerson && this.selectedInterest && this.currentPage < this.totalPages) {
      const nextPage = this.currentPage + 1;
      const path = `/gifts/${this.selectedOccasion}/${this.selectedPerson}/${this.selectedInterest}/page/${nextPage}/index.json`;

      // Create a link element for preloading
      const preloadLink = document.createElement('link');
      preloadLink.rel = 'prefetch';
      preloadLink.href = path;
      preloadLink.as = 'fetch';

      // Remove any existing preload links for the same path
      const existingPreload = document.querySelector(`link[href="${path}"]`);
      if (existingPreload) {
        existingPreload.remove();
      }

      // Add the new preload link to the document head
      document.head.appendChild(preloadLink);

      console.log(`Preloading next page: ${path}`);
    }
  }

  showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.remove('d-none');
    }
  }

  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('d-none');
    }
  }

  showNoResults() {
    const container = document.getElementById('products-container');
    container.innerHTML = `
      <div class="col-12 text-center text-muted py-5">
        <i class="bi bi-search fs-1 mb-3 d-block" aria-hidden="true"></i>
        <p class="h5">No gifts found for this combination</p>
        <p class="small mt-2">Try adjusting your criteria or selecting different options</p>
      </div>
    `;
    document.getElementById('load-more-trigger').classList.add('d-none');
  }

  showNoMoreResults() {
    document.getElementById('load-more-trigger').classList.add('d-none');
    const noMore = document.getElementById('no-more-results');
    if (noMore && this.products.length > 0) {
      noMore.classList.remove('d-none');
    }
  }

  show404Error() {
    const container = document.getElementById('products-container');
    // Use your existing 404 image/design
    container.innerHTML = `
      <div class="col-12 text-center py-5">
        <div class="error-404">
          <i class="bi bi-exclamation-triangle-fill fs-1 text-warning mb-3 d-block" aria-hidden="true"></i>
          <h2 class="h4 mb-3">Oops! Something went wrong</h2>
          <p class="text-muted mb-4">We couldn't load the products. Please try again later.</p>
          <button class="btn btn-primary" onclick="location.reload()" aria-label="Reload page">
            <i class="bi bi-arrow-clockwise me-2"></i>Retry
          </button>
        </div>
      </div>
    `;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new GiftFinder());
} else {
  new GiftFinder();
}