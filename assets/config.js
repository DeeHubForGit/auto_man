// Site-wide configuration
const SITE_CONFIG = {
  OWNER_NAME: 'Darren',
  PHONE_NUMBER: '0403 632 313',
  PHONE_NUMBER_LINK: '0403632313', // For tel: links (no spaces)
  PHONE_NUMBER_DISPLAY: '0403 632 313', // For display (with spaces)
  
  // Service overviews for marketing/homepage (high-level categories)
  SERVICE_OVERVIEWS: [
    {
      id: 'beginner-drivers',
      name: 'Beginner Drivers',
      slug: 'beginner-drivers',
      description: 'Learn with patient, experienced instructors at your own pace in a safe and supportive environment.',
      image: 'images/beginner-driver.jpg',
      page: 'beginner-drivers.html',
      duration: '1 hour', // Default lesson duration
      cost: 80, // Per hour cost
      costNote: null
    },
    {
      id: 'driving-test-package',
      name: 'Driving Test Package',
      slug: 'driving-test-package',
      description: 'Get a warm-up lesson and use of our instructor\'s car for your driving test. Maximise your chances of success with confidence.',
      image: 'images/driving-test.jpg',
      page: 'driving-test-package.html',
      duration: '45-60 min warm-up + test',
      cost: 250,
      costNote: 'Our Driving Test Package fee does not include VicRoads testing fee.',
      // Legacy support
      price: 250,
      priceNote: 'Our Driving Test Package fee does not include VicRoads testing fee.'
    },
    {
      id: 'overseas-licence',
      name: 'Overseas Licence Conversion',
      slug: 'overseas-licence',
      description: 'Convert your overseas licence to Australian standards and gain confidence with local road rules.',
      image: 'images/overseas-driver.jpg',
      page: 'overseas-licence.html',
      duration: '1 hour',
      cost: 80,
      costNote: null
    },
    {
      id: 'nervous-drivers',
      name: 'Nervous Drivers',
      slug: 'nervous-drivers',
      description: 'Specialised support for nervous or anxious drivers. Build confidence with patient and understanding instruction.',
      image: 'images/nervous-driver.jpg',
      page: 'nervous-drivers.html',
      duration: '1 hour',
      cost: 80,
      costNote: null
    },
    {
      id: 'senior-drivers',
      name: 'Senior Driver Retests',
      slug: 'senior-drivers',
      description: 'Refresher lessons and test preparation tailored for senior drivers. Maintain your independence with confidence.',
      image: 'images/older-driver.jpg',
      page: 'senior-drivers.html',
      duration: '1 hour',
      cost: 80,
      costNote: null
    }
  ],
  
  // Bookable services (for booking system integration)
  // This will be populated from the booking system API
  SERVICES: [],
  
  // Lesson packages
  PACKAGES: [
    {
      id: '3-lesson-pack',
      name: '3 Lesson Pack',
      price: 240,
      lessons: 3,
      duration: '1-hour',
      validity: '12 months',
      popular: false,
      features: [
        '3 × 1-hour lessons',
        'Valid 12 months'
      ]
    },
    {
      id: '5-lesson-pack',
      name: '5 Lesson Pack',
      price: 390,
      lessons: 5,
      duration: '1-hour',
      validity: '12 months',
      popular: true,
      features: [
        '5 × 1-hour lessons',
        'Valid 12 months'
      ]
    },
    {
      id: '10-lesson-pack',
      name: '10 Lesson Pack',
      price: 760,
      lessons: 10,
      duration: '1-hour',
      validity: '12 months',
      popular: false,
      features: [
        '10 × 1-hour lessons',
        'Valid 12 months'
      ]
    }
  ]
};

// Make config available globally
window.SITE_CONFIG = SITE_CONFIG;

// Helper functions for accessing config data
window.SITE_CONFIG.getServiceOverview = function(id) {
  return this.SERVICE_OVERVIEWS.find(s => s.id === id || s.slug === id);
};

window.SITE_CONFIG.getService = function(id) {
  return this.SERVICES.find(s => s.id === id || s.slug === id);
};

window.SITE_CONFIG.getPackage = function(id) {
  return this.PACKAGES.find(p => p.id === id);
};

window.SITE_CONFIG.getPopularPackage = function() {
  return this.PACKAGES.find(p => p.popular);
};

// API integration placeholder
// In the future, you can replace static config with API data:
window.SITE_CONFIG.loadFromAPI = async function(apiUrl) {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error('Failed to load config from API');
    const data = await response.json();
    
    // Merge API data with existing config
    if (data.serviceOverviews) this.SERVICE_OVERVIEWS = data.serviceOverviews;
    if (data.services) this.SERVICES = data.services; // Bookable services from booking system
    if (data.packages) this.PACKAGES = data.packages;
    if (data.ownerName) this.OWNER_NAME = data.ownerName;
    if (data.phoneNumber) {
      this.PHONE_NUMBER = data.phoneNumber;
      this.PHONE_NUMBER_DISPLAY = data.phoneNumber;
      this.PHONE_NUMBER_LINK = data.phoneNumber.replace(/\s/g, '');
    }
    
    // Trigger a custom event to notify pages that config has been updated
    window.dispatchEvent(new CustomEvent('configUpdated', { detail: data }));
    
    return data;
  } catch (error) {
    console.error('Error loading config from API:', error);
    return null;
  }
};

// Auto-replace phone number placeholders on page load
(function() {
  function replacePhoneNumbers() {
    // Replace tel: links
    document.querySelectorAll('a[href^="tel:"]').forEach(link => {
      if (link.href.includes('{{PHONE}}') || link.href.includes('{{PHONE_LINK}}') || link.href.includes('0410166232') || link.href.includes('04XXXXXXXX')) {
        link.href = `tel:${SITE_CONFIG.PHONE_NUMBER_LINK}`;
      }
      // Update display text if it contains phone number
      if (link.textContent.includes('0410 166 232') || link.textContent.includes('04XX XXX XXX')) {
        link.textContent = link.textContent.replace(/0410 166 232|04XX XXX XXX/g, SITE_CONFIG.PHONE_NUMBER_DISPLAY);
      }
      if (link.textContent.includes('Call Darren') || link.textContent.includes('Call Paul')) {
        link.textContent = link.textContent.replace(/0410 166 232|0410166232/g, SITE_CONFIG.PHONE_NUMBER_DISPLAY);
      }
    });

    // Replace text content and href attributes with placeholders
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const nodesToReplace = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.includes('{{PHONE}}') || node.textContent.includes('{{OWNER}}')) {
        nodesToReplace.push(node);
      }
    }

    nodesToReplace.forEach(node => {
      node.textContent = node.textContent
        .replace(/\{\{PHONE\}\}/g, SITE_CONFIG.PHONE_NUMBER_DISPLAY)
        .replace(/\{\{OWNER\}\}/g, SITE_CONFIG.OWNER_NAME);
    });

    // Replace {{PHONE_LINK}} in href attributes
    document.querySelectorAll('a[href*="{{PHONE_LINK}}"]').forEach(link => {
      link.href = link.href.replace(/\{\{PHONE_LINK\}\}/g, SITE_CONFIG.PHONE_NUMBER_LINK);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replacePhoneNumbers);
  } else {
    replacePhoneNumbers();
  }

  // Re-run after partials are loaded
  window.addEventListener('partialsLoaded', replacePhoneNumbers);
})();
