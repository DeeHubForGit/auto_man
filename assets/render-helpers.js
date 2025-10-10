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
    if (service.cost) {
      // Add alternative pricing if available
      const altText = service.priceAlt 
        ? `<br><span class="text-sm text-blue-600">${service.priceAlt}</span>` 
        : '';
      
      priceDisplay = `<p class="text-base font-semibold text-blue-600 mt-2">${service.cost}${altText}</p>`;
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
            ${service.name}
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

  const packages = window.SITE_CONFIG.PACKAGES;
  
  container.innerHTML = packages.map(pkg => {
    const isPopular = pkg.popular;
    const popularBadge = isPopular 
      ? '<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-sky-400 to-blue-400 text-white text-base font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-1"><span class="text-xl">⭐</span> Most Popular</span>'
      : '';
    
    const cardClasses = isPopular
      ? 'bg-white rounded-2xl shadow-xl p-6 border-2 border-sky-400 relative transform scale-105 ring-4 ring-sky-400/30'
      : 'bg-white rounded-2xl shadow p-6 border relative';
    
    const buttonClasses = isPopular
      ? 'mt-5 w-full bg-gradient-to-r from-sky-400 to-blue-500 text-white px-4 py-3 rounded-lg hover:from-sky-500 hover:to-blue-600 text-center block font-bold shadow-lg'
      : 'mt-5 w-full bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 text-center block';
    
    const features = pkg.features.map(f => `<li>${f}</li>`).join('');
    const perLessonPrice = pkg.lessons ? (pkg.price / pkg.lessons).toFixed(0) : null;
    const perLessonText = perLessonPrice ? `<p class="text-lg font-bold mt-1" style="color:#3b82f6">$${perLessonPrice}/lesson</p>` : '';
    
    // Calculate savings compared to individual lesson price ($85/lesson)
    const individualPrice = 85;
    const savings = pkg.lessons ? (individualPrice * pkg.lessons - pkg.price) : 0;
    const savingsText = savings > 0 ? `<p class="text-base font-bold mt-1" style="color:#10b981">Save $${savings}</p>` : '';
    
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
        <a href="simplybook.html" class="${buttonClasses}">Book Now</a>
      </div>
    `;
  }).join('');
}

/**
 * Update price displays throughout the page
 * @param {string} serviceId - Service ID to update prices for
 */
function updatePriceDisplay(serviceId) {
  const service = window.SITE_CONFIG.getService(serviceId);
  if (!service || !service.price) return;

  // Update all elements with data-price attribute matching the service
  document.querySelectorAll(`[data-price="${serviceId}"]`).forEach(el => {
    el.textContent = `$${service.price}`;
  });
}

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
