/**
 * Unified Infinite Scroll for Hugo Static Site
 * Handles pagination with placeholder animations, SPA navigation, and SEO-friendly fallbacks
 */

class InfiniteScrollManager {
    constructor(options = {}) {
        // Configuration
        this.config = {
            gridSelector: options.gridSelector || '#product-grid',
            categoryNavSelector: options.categoryNavSelector || '#category-nav',
            paginationInfoSelector: options.paginationInfoSelector || '#pagination-info',
            triggerDistance: options.triggerDistance || 400, // pixels from bottom
            pageSize: options.pageSize || 12, // products per page
            retryAttempts: options.retryAttempts || 2,
            retryDelay: options.retryDelay || 200, // ms
            enableHistory: options.enableHistory !== false,
            ...options
        };

        // State management
        this.state = {
            currentPage: 1,
            totalPages: 1,
            baseURL: '',
            isLoading: false,
            loadedPages: new Set([1]), // Track successfully loaded pages
            failedPages: new Map(), // Track failed attempts per page
            products: [],
            preloadedPages: new Map(), // Cache preloaded page data
            preloading: false,
            lastPreloadedPage: 0
        };

        // DOM elements
        this.elements = {
            grid: null,
            categoryNav: null,
            sentinel: null,
            paginationInfo: null
        };

        // Observer
        this.observer = null;

        this.init();
    }

    /**
     * Initialize the infinite scroll
     */
    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    /**
     * Setup DOM elements and observers
     */
    setup() {
        // Get DOM elements
        this.elements.grid = document.querySelector(this.config.gridSelector);
        this.elements.categoryNav = document.querySelector(this.config.categoryNavSelector);

        if (!this.elements.grid) {
            console.warn('InfiniteScroll: Grid container not found');
            return;
        }

        // Read initial state from data attributes
        this.readInitialState();

        // Create and setup sentinel element for intersection observer
        this.createSentinel();

        // Setup intersection observer for infinite scroll
        this.setupIntersectionObserver();

        this.setupPreloadObserver();

        // Setup category navigation (SPA)
        if (this.elements.categoryNav) {
            this.setupCategoryNavigation();
        }

        // Setup browser back/forward navigation
        if (this.config.enableHistory) {
            this.setupHistoryNavigation();
        }

        // Mark initially rendered products as loaded
        this.markInitialProductsLoaded();

        console.log('InfiniteScroll: Initialized', this.state);
    }

    /**
     * Read initial pagination state from DOM
     */
    readInitialState() {
        const container = this.elements.grid.closest('[data-current-page]');

        if (container) {
            this.state.currentPage = parseInt(container.dataset.currentPage || '1', 10);
            this.state.totalPages = parseInt(container.dataset.totalPages || '1', 10);
            this.state.baseURL = container.dataset.baseUrl || window.location.pathname;
        } else {
            // Fallback: parse from URL
            this.state.baseURL = window.location.pathname.replace(/\/page\/\d+\/?$/, '');
            this.state.currentPage = this.getCurrentPageFromURL();
        }

        // Ensure baseURL ends with /
        if (!this.state.baseURL.endsWith('/')) {
            this.state.baseURL += '/';
        }
    }

    /**
     * Get current page number from URL
     */
    getCurrentPageFromURL() {
        const match = window.location.pathname.match(/\/page\/(\d+)/);
        return match ? parseInt(match[1], 10) : 1;
    }

    /**
     * Mark initial server-rendered products as loaded
     */
    markInitialProductsLoaded() {
        const productCards = this.elements.grid.querySelectorAll('.card');
        productCards.forEach(card => {
            card.classList.add('loaded');
            // Remove any placeholder classes if present
            card.querySelectorAll('.placeholder-glow, .placeholder').forEach(el => {
                el.classList.remove('placeholder-glow', 'placeholder');
            });
        });
    }

    setupPreloadObserver() {
        // Create a sentinel at 50% of page height
        this.elements.preloadSentinel = document.createElement('div');
        this.elements.preloadSentinel.id = 'preload-sentinel';
        this.elements.preloadSentinel.style.cssText = 'height: 1px; pointer-events: none;';

        // Insert it in the middle of the grid
        const updatePreloadPosition = () => {
            const gridHeight = this.elements.grid.offsetHeight;
            const scrollPosition = window.scrollY + window.innerHeight;
            const gridTop = this.elements.grid.offsetTop;
            const midPoint = gridTop + (gridHeight * 0.5); // 50% through current content

            if (scrollPosition > midPoint && !this.state.preloading) {
                this.preloadNextPage();
            }
        };

        // Use scroll listener with throttle
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            scrollTimeout = setTimeout(() => {
                updatePreloadPosition();
                scrollTimeout = null;
            }, 150);
        }, { passive: true });
    }

    async preloadNextPage() {
        const nextPage = this.state.currentPage + 1;

        // Don't preload if already cached or at end
        if (this.state.preloadedPages.has(nextPage) ||
            nextPage > this.state.totalPages ||
            this.state.lastPreloadedPage >= nextPage) {
            return;
        }

        this.state.preloading = true;
        this.state.lastPreloadedPage = nextPage;

        try {
            const pageURL = this.state.baseURL.endsWith('/')
                ? `${this.state.baseURL}page/${nextPage}/`
                : `${this.state.baseURL}/page/${nextPage}/`;
            const url = `${pageURL}index.json`;

            console.log(`InfiniteScroll: Preloading page ${nextPage}...`);

            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                // Cache the data
                this.state.preloadedPages.set(nextPage, data);
                console.log(`InfiniteScroll: Page ${nextPage} preloaded and cached`);
            }
        } catch (error) {
            console.warn(`InfiniteScroll: Preload failed for page ${nextPage}:`, error);
        } finally {
            this.state.preloading = false;
        }
    }

    /**
     * Create sentinel element for intersection observer
     */
    createSentinel() {
        this.elements.sentinel = document.createElement('div');
        this.elements.sentinel.id = 'infinite-scroll-sentinel';
        this.elements.sentinel.className = 'py-3 text-center';
        this.elements.sentinel.style.minHeight = '1px';
        this.elements.sentinel.setAttribute('aria-hidden', 'true');

        // Insert after grid
        this.elements.grid.parentNode.insertBefore(
            this.elements.sentinel,
            this.elements.grid.nextSibling
        );
    }

    /**
     * Setup intersection observer for infinite scroll
     */
    setupIntersectionObserver() {
        const options = {
            root: null,
            rootMargin: `0px 0px ${this.config.triggerDistance}px 0px`,
            threshold: 0
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !this.state.isLoading) {
                    this.loadNextPage();
                }
            });
        }, options);

        this.observer.observe(this.elements.sentinel);
    }

    /**
     * Load next page of products
     */
    async loadNextPage() {
        // Check if we can load more
        if (this.state.currentPage >= this.state.totalPages) {
            this.showEndMessage();
            return;
        }

        const nextPage = this.state.currentPage + 1;

        // Check if already loaded
        if (this.state.loadedPages.has(nextPage)) {
            this.state.currentPage = nextPage;
            return;
        }

        // Check if we've exceeded retry attempts
        const failCount = this.state.failedPages.get(nextPage) || 0;
        if (failCount >= this.config.retryAttempts) {
            console.warn(`InfiniteScroll: Skipping page ${nextPage} after ${failCount} failed attempts`);
            this.state.currentPage = nextPage;
            this.loadNextPage(); // Try next page
            return;
        }

        this.state.isLoading = true;

        // Create placeholder products immediately
        const placeholders = this.createPlaceholderProducts(this.config.pageSize);

        try {
            let data;

            // Check if already preloaded
            if (this.state.preloadedPages.has(nextPage)) {
                console.log(`InfiniteScroll: Using cached page ${nextPage}`);
                data = this.state.preloadedPages.get(nextPage);
                this.state.preloadedPages.delete(nextPage); // Remove from cache

                // Instant replacement since data is ready
                setTimeout(() => {
                    this.replacePlaceholders(placeholders, data.products || []);
                }, 100); // Tiny delay just for smooth animation

            } else {
                // Normal fetch if not preloaded
                const pageURL = this.state.baseURL.endsWith('/')
                    ? `${this.state.baseURL}page/${nextPage}/`
                    : `${this.state.baseURL}/page/${nextPage}/`;
                const url = `${pageURL}index.json`;

                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                data = await response.json();
                this.replacePlaceholders(placeholders, data.products || []);
            }

            // Update state
            this.state.currentPage = nextPage;
            this.state.totalPages = data.totalPages || this.state.totalPages;
            this.state.loadedPages.add(nextPage);
            this.state.products.push(...(data.products || []));

            // Start preloading next page
            this.preloadNextPage();

            console.log(`InfiniteScroll: Loaded page ${nextPage}/${this.state.totalPages}`);

        } catch (error) {
            console.error(`InfiniteScroll: Failed to load page ${nextPage}:`, error);

            // Track failure
            this.state.failedPages.set(nextPage, failCount + 1);

            // Remove placeholders on error
            placeholders.forEach(p => p.remove());

            // Retry after delay
            if (failCount < this.config.retryAttempts) {
                setTimeout(() => {
                    this.state.isLoading = false;
                    this.loadNextPage();
                }, this.config.retryDelay * (failCount + 1)); // Exponential backoff
                return;
            } else {
                // Skip to next page after max retries
                this.state.currentPage = nextPage;
                setTimeout(() => {
                    this.state.isLoading = false;
                    this.loadNextPage();
                }, 500);
                return;
            }
        }

        this.state.isLoading = false;
    }

    /**
     * Create placeholder product cards with Bootstrap animations
     */
    createPlaceholderProducts(count) {
        const placeholders = [];
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < count; i++) {
            const col = document.createElement('div');
            col.className = 'col-6 col-md-4 col-lg-3 placeholder-product';
            col.style.opacity = '0';
            col.style.animation = `fadeIn 0.3s ease-in-out ${i * 0.05}s forwards`;

            col.innerHTML = `
        <div class="card glass border-0 h-100">
          <div class="ratio ratio-1x1 bg-light placeholder-glow">
            <span class="placeholder w-100 h-100"></span>
          </div>
          <div class="card-body">
            <p class="card-title h5 placeholder-glow">
              <span class="placeholder col-10"></span>
              <span class="placeholder col-8"></span>
            </p>
            <p class="placeholder-glow mb-0">
              <span class="placeholder col-4"></span>
            </p>
          </div>
        </div>
      `;

            placeholders.push(col);
            fragment.appendChild(col);
        }

        this.elements.grid.appendChild(fragment);
        return placeholders;
    }

    /**
     * Replace placeholder products with real product cards
     */
    replacePlaceholders(placeholders, products) {
        products.forEach((product, index) => {
            if (index < placeholders.length) {
                const placeholder = placeholders[index];
                const productCard = this.createProductCard(product, index);

                // Fade out placeholder
                placeholder.style.animation = 'fadeOut 0.2s ease-in-out forwards';

                setTimeout(() => {
                    placeholder.replaceWith(productCard);
                    // Trigger reflow for animation
                    productCard.offsetHeight;
                    productCard.classList.add('loaded');
                }, 200);
            }
        });

        // Remove excess placeholders if products < pageSize
        if (products.length < placeholders.length) {
            placeholders.slice(products.length).forEach(p => {
                p.style.animation = 'fadeOut 0.2s ease-in-out forwards';
                setTimeout(() => p.remove(), 200);
            });
        }
    }

    /**
     * Create product card element from data
     */
    createProductCard(product, index) {
        const col = document.createElement('div');
        col.className = 'col-6 col-md-4 col-lg-3 product-item';
        col.style.opacity = '0';
        col.style.animation = `fadeIn 0.4s ease-in-out ${index * 0.05}s forwards`;

        const hasDiscount = product.discount > 0;
        const discountedPrice = hasDiscount
            ? (product.price * (1 - product.discount / 100)).toFixed(2)
            : product.price.toFixed(2);

        const hasMultipleImages = product.images && product.images.length > 1;

        col.innerHTML = `
      <div class="card glass cursor-pointer border-0" data-id="${product.id || ''}">
        ${hasDiscount ? this.getOnSaleLabel(product.discount) : ''}
        <img src="${product.images[0] || ''}" 
             class="w-100 product-image ${hasMultipleImages ? 'sec' : ''}" 
             alt="${product.title} ${product.category || ''}" 
             loading="lazy">
        ${hasMultipleImages ? `
          <img src="${product.images[1]}" 
               loading="lazy" 
               class="w-100 product-image" 
               alt="${product.title} ${product.category || ''}">
        ` : ''}
        ${this.getPurchaseLabel(product.ecommerce)}
        <a class="my-2 hover-link stretched-link" href="${product.ecommerce_url}" target="_blank" rel="noopener">
          <p class="card-title product-title h5 mt-2 mb-0 limit-text">${product.title}</p>
          ${product.price ? `<p class="product-price mb-0">$${discountedPrice}</p>` : ''}
          ${hasDiscount ? `
            <p class="product-price product-discount">
              Original price:
              <del>$${product.price.toFixed(2)}</del>
              <span class="badge bg-danger">-${product.discount}%</span>
            </p>
          ` : ''}
        </a>
      </div>
    `;

        return col;
    }

    /**
     * Get on-sale label HTML (customize based on your partial)
     */
    getOnSaleLabel(discount) {
        return `<span class="badge bg-danger position-absolute top-0 start-0 m-2">-${discount}%</span>`;
    }

    /**
     * Get purchase label HTML (customize based on your partial)
     */
    getPurchaseLabel(ecommerce) {
        if (!ecommerce) return '';
        return `<span class="badge bg-primary position-absolute top-0 end-0 m-2">${ecommerce}</span>`;
    }

    /**
     * Show end of results message
     */
    showEndMessage() {
        if (this.observer) {
            this.observer.disconnect();
        }

        if (this.elements.sentinel && !this.elements.sentinel.querySelector('.end-message')) {
            this.elements.sentinel.innerHTML = `
        <div class="end-message text-muted py-4">
          <i class="bi bi-check-circle me-2"></i>
          You've reached the end
        </div>
      `;
        }
    }

    /**
     * Setup SPA category navigation
     */
    setupCategoryNavigation() {
        const categoryLinks = this.elements.categoryNav.querySelectorAll('.category-link');

        categoryLinks.forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();

                const url = link.getAttribute('href');
                if (!url) return;

                // Update active state
                categoryLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                // Load new category
                await this.loadCategory(url);
            });
        });
    }

    /**
     * Load a new category (SPA navigation)
     */
    async loadCategory(url) {
        try {
            this.state.isLoading = true;

            // Show loading state
            this.elements.grid.style.opacity = '0.5';
            this.elements.grid.style.pointerEvents = 'none';

            // Fetch new category data
            const jsonURL = url.endsWith('/') ? `${url}index.json` : `${url}/index.json`;
            const response = await fetch(jsonURL);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Reset state
            this.state.currentPage = 1;
            this.state.totalPages = data.totalPages || 1;
            this.state.baseURL = url.endsWith('/') ? url : `${url}/`;
            this.state.loadedPages = new Set([1]);
            this.state.failedPages.clear();
            this.state.products = data.products || [];

            // Clear grid and render new products
            this.elements.grid.innerHTML = '';
            this.renderProducts(data.products || []);

            // Update browser history
            if (this.config.enableHistory) {
                history.pushState({ url, page: 1 }, '', url);
            }

            // Restore grid
            this.elements.grid.style.opacity = '1';
            this.elements.grid.style.pointerEvents = 'auto';

            // Reconnect observer if it was disconnected
            if (this.observer && this.elements.sentinel) {
                this.observer.observe(this.elements.sentinel);
            }

            console.log('InfiniteScroll: Category loaded', url);

        } catch (error) {
            console.error('InfiniteScroll: Failed to load category:', error);
            // Fallback to normal navigation
            window.location.href = url;
        } finally {
            this.state.isLoading = false;
        }
    }

    /**
     * Render products to grid
     */
    renderProducts(products) {
        const fragment = document.createDocumentFragment();

        products.forEach((product, index) => {
            const productCard = this.createProductCard(product, index);
            fragment.appendChild(productCard);
        });

        this.elements.grid.appendChild(fragment);

        // Trigger animations
        requestAnimationFrame(() => {
            this.elements.grid.querySelectorAll('.product-item').forEach(item => {
                item.classList.add('loaded');
            });
        });
    }

    /**
     * Setup browser history navigation (back/forward buttons)
     */
    setupHistoryNavigation() {
        window.addEventListener('popstate', (event) => {
            // Reload page on back/forward
            // Could be enhanced to restore state from history.state
            window.location.reload();
        });

        // Save initial state
        history.replaceState({
            url: window.location.pathname,
            page: this.state.currentPage
        }, '');
    }

    /**
     * Destroy the infinite scroll instance
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.elements.sentinel) {
            this.elements.sentinel.remove();
        }

        console.log('InfiniteScroll: Destroyed');
    }
}

// CSS animations (add to your stylesheet or inject)
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  .product-item {
    transition: opacity 0.3s ease-in-out;
  }

  .cursor-pointer {
    cursor: pointer;
  }
`;
document.head.appendChild(style);

function activateInfiniteScrolling() {
    if (document.querySelector('#product-grid')) {
        window.infiniteScroll = new InfiniteScrollManager();
        const fallback = document.getElementById('pagination-fallback');

        // Hide pagination fallback when infinite scroll is active
        if (fallback && window.infiniteScroll) {
            fallback.style.display = 'none';
        }
    }
}

// Auto-initialize if grid exists
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        activateInfiniteScrolling();
    });
} else {
    activateInfiniteScrolling();
}