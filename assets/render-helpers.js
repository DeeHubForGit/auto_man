// Helper functions to render services and packages from config

/**
 * Render service overviews section on the homepage
 * @param {string} containerId - ID of the container element
 */
function renderServices(containerId = 'services-container') {
  const container = document.getElementById(containerId);
  if (!container || !window.SITE_CONFIG) return;

  const services = window.SITE_CONFIG.SERVICE_OVERVIEWS;
  
  container.innerHTML = services.map(service => {
    const linkTag = service.page ? 'a' : 'div';
    const href = service.page ? `href="${service.page}"` : '';
    
    // Format pricing display
    let priceDisplay = '';
    if (service.costDescription) {
      // Add alternative pricing if available
      const altText = service.priceAlt 
        ? `<br><span class="text-sm text-blue-600">${service.priceAlt}</span>` 
        : '';
      
      priceDisplay = `<p class="text-base font-semibold text-blue-600 mt-2">${service.costDescription}${altText}</p>`;
    } else if (service.costNote) {
      priceDisplay = `<p class="text-sm font-semibold text-gray-500 mt-2">${service.costNote}</p>`;
    }
    
    return `
      <${linkTag} ${href} class="bg-white rounded-2xl shadow-lg overflow-hidden group hover:shadow-xl transition-shadow duration-300 block">
        <div class="aspect-w-16 aspect-h-10 bg-gray-200">
          <img src="${service.image}" 
               alt="${service.name}" 
               class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
        <div class="p-6">
          <h3 class="font-semibold text-lg mb-2 flex items-center justify-between">
            <span class="flex items-center gap-2">
              ${service.icon ? (service.icon.endsWith('.svg') ? `<img src="${service.icon}" alt="" width="28" height="28" class="inline-block">` : `<span class="text-2xl">${service.icon}</span>`) : ''}
              ${service.name}
            </span>
            <span class="text-blue-600">→</span>
          </h3>
          <p class="text-sm text-gray-600">${service.description}</p>
          ${priceDisplay}
        </div>
      </${linkTag}>
    `;
  }).join('');
}

/**
 * Render lesson packages section on the homepage
 * @param {string} containerId - ID of the container element
 */
function renderPackages(containerId = 'packages-container') {
  const container = document.getElementById(containerId);
  if (!container || !window.SITE_CONFIG) return;

  const packages = Array.isArray(SITE_CONFIG.PACKAGES) ? SITE_CONFIG.PACKAGES : [];

  const bookingUrl = (pkg) =>
    (pkg && pkg.simplybookPackageId != null && pkg.simplybookPackageId !== '')
      ? `simplybook-packages.html?package=${encodeURIComponent(pkg.simplybookPackageId)}`
      : `simplybook-packages.html`;

  container.innerHTML = packages.map(pkg => {
    const isPopular = !!pkg.popular;

    const popularBadge = isPopular
      ? '<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-sky-400 to-blue-400 text-white text-base font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-1"><span class="text-xl">⭐</span> Most Popular</span>'
      : '';

    const cardClasses = isPopular
      ? 'bg-white rounded-2xl shadow-xl p-6 border-2 border-sky-400 relative transform scale-105 ring-4 ring-sky-400/30'
      : 'bg-white rounded-2xl shadow p-6 border relative';

    const buttonClasses = isPopular
      ? 'mt-5 w-full bg-gradient-to-r from-sky-400 to-blue-500 text-white px-4 py-3 rounded-lg hover:from-sky-500 hover:to-blue-600 text-center block font-bold shadow-lg'
      : 'mt-5 w-full bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 text-center block font-semibold';

    const features = (pkg.features || []).map(f => `<li>${f}</li>`).join('');

    // Per-lesson and savings
    const lessonsCount = Number(pkg.lessons) || 0;
    const perLessonPrice = lessonsCount ? (Number(pkg.price) / lessonsCount) : null;
    const perLessonText = perLessonPrice != null
      ? `<p class="text-lg font-bold mt-1" style="color:#3b82f6">$${perLessonPrice.toFixed(0)} per lesson</p>`
      : '';

    // Savings vs. $85 individual lesson
    const INDIVIDUAL = 85;
    const savings = lessonsCount ? (INDIVIDUAL * lessonsCount - Number(pkg.price)) : 0;
    const savingsText = savings > 0
      ? `<p class="text-base font-bold mt-1" style="color:#10b981">Save $${savings}</p>`
      : '';

    return `
      <div class="${cardClasses}">
        ${popularBadge}
        <h3 class="text-lg font-semibold text-gray-900">${pkg.name}</h3>
        <p class="text-3xl font-extrabold mt-2 text-gray-900">$${pkg.price}</p>
        ${perLessonText}
        ${savingsText}
        <ul class="mt-3 text-sm text-gray-700 list-disc list-inside">
          ${features}
        </ul>
        <a href="${bookingUrl(pkg)}" class="${buttonClasses}">Book Now</a>
      </div>
    `;
  }).join('');
}

/**
 * Update price displays throughout the page
 * @param {string} serviceId - Service ID to update prices for
 */
function updatePriceDisplay(serviceId) {
  const service = window.SITE_CONFIG.getServiceOverview(serviceId);
  if (!service || !service.cost) return;

  // Update all elements with data-price attribute matching the service
  document.querySelectorAll(`[data-price="${serviceId}"]`).forEach(el => {
    el.textContent = service.cost;
  });
}

/**
 * Update FAQ pricing from config
 */
function updateFAQPricing() {
  if (!window.SITE_CONFIG || !window.SITE_CONFIG.LESSON_PRICING) return;
  
  const pricing = window.SITE_CONFIG.LESSON_PRICING;
  
  // Update 1 hour price
  const price1hr = pricing.find(p => p.duration === '1 hour');
  if (price1hr) {
    const el = document.getElementById('price-1hr');
    if (el) el.textContent = '$' + price1hr.price;
  }
  
  // Update 1.5 hour price
  const price1_5hr = pricing.find(p => p.duration === '1.5 hour');
  if (price1_5hr) {
    const el = document.getElementById('price-1-5hr');
    if (el) el.textContent = '$' + price1_5hr.price;
  }
  
  // Update 2 hour price
  const price2hr = pricing.find(p => p.duration === '2 hour');
  if (price2hr) {
    const el = document.getElementById('price-2hr');
    if (el) el.textContent = '$' + price2hr.price;
  }
}

/**
 * Render lesson pricing cards (for sidebar on service pages)
 * Populates #lesson-pricing-grid using SITE_CONFIG.LESSON_PRICING
 */
function renderLessonPricing(containerId = 'lesson-pricing-grid') {
  const container = document.getElementById(containerId);
  if (!container || !window.SITE_CONFIG) return;

  const currentPage = window.location.pathname.toLowerCase();
  const useDiscounted = currentPage.includes('senior');

  const lessons = useDiscounted
    ? SITE_CONFIG.LESSON_PRICING_DISCOUNTED
    : SITE_CONFIG.LESSON_PRICING;

  if (!Array.isArray(lessons) || !lessons.length) return;

  const bookingUrl = (lesson) =>
    lesson?.simplybookId
      ? `simplybook.html?service=${encodeURIComponent(lesson.simplybookId)}`
      : 'simplybook.html';

  container.innerHTML = lessons
    .map(
      (lesson) => `
        <a href="${bookingUrl(lesson)}"
           style="display:block;padding:12px;background:#1e3a8a22;border:1px solid #3b82f655;
                  border-radius:8px;text-decoration:none;transition:all .2s;cursor:pointer"
           onmouseover="this.style.background='#1e3a8a44';this.style.borderColor='#3b82f6'"
           onmouseout="this.style.background='#1e3a8a22';this.style.borderColor='#3b82f655'">
          <p style="margin:0;font-size:14px;color:var(--muted)">${lesson.duration} lesson</p>
          <p style="margin:4px 0 0 0;font-size:24px;font-weight:700;color:#e5e7eb">$${lesson.price}</p>
          ${
            lesson.note
              ? `<p style="margin:8px 0 0 0;font-size:12px;color:var(--muted);font-style:italic">${lesson.note}</p>`
              : ''
          }
        </a>`
    )
    .join('');
}

// Make globally accessible
window.renderLessonPricing = renderLessonPricing;

/**
 * Initialize dynamic rendering on page load
 */
function initDynamicContent() {
  // Auto-render if containers exist
  if (document.getElementById('services-container')) {
    renderServices();
  }
  
  if (document.getElementById('packages-container')) {
    renderPackages();
  }
  
  if (document.getElementById('lesson-pricing-grid')) {
    renderLessonPricing();
  }

  // Update FAQ pricing if on FAQ page
  updateFAQPricing();
}

// Listen for config updates from API
window.addEventListener('configUpdated', () => {
  initDynamicContent();
});

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDynamicContent);
} else {
  initDynamicContent();
}

// Export functions for manual use
window.renderServices = renderServices;
window.renderPackages = renderPackages;
window.updatePriceDisplay = updatePriceDisplay;
