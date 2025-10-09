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
    const popularBadge = pkg.popular 
      ? '<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-700 text-white text-xs px-3 py-1 rounded-full shadow">Popular</span>'
      : '';
    
    const features = pkg.features.map(f => `<li>${f}</li>`).join('');
    
    return `
      <div class="bg-white rounded-2xl shadow p-6 border relative">
        ${popularBadge}
        <h3 class="text-lg font-semibold">${pkg.name}</h3>
        <p class="text-3xl font-extrabold mt-2">$${pkg.price}</p>
        <ul class="mt-3 text-sm text-gray-700 list-disc list-inside">
          ${features}
        </ul>
        <a href="book.html" class="mt-5 w-full bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 text-center block">Book this</a>
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
