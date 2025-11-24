// Site-wide configuration
const SITE_CONFIG = {
  // Supabase configuration (ANON_KEY is safe to expose - RLS protects your data)
  SUPABASE_URL: 'https://ugxxxvhanwckgciaedna.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVneHh4dmhhbndja2djaWFlZG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MTczMzIsImV4cCI6MjA3NDE5MzMzMn0.NmfWAs0ySO6RKf0sLWmuXZ6R_RhtDoObC-5NWWbCFtM',
  
  // Admin access list
  ADMIN_EMAILS: [
    'darren@automandrivingschool.com.au'
  ],
  
  OWNER_NAME: 'Darren',
  PHONE_NUMBER: '0403 632 313',
  PHONE_NUMBER_LINK: '0403632313', // For tel: links (no spaces)
  PHONE_NUMBER_DISPLAY: '0403 632 313', // For display (with spaces)
  EMAIL: 'info@automandrivingschool.com.au',
  
  // Business hours
  WORKING_HOURS: '10 am to 5 pm on weekends',
  
  // Social media
  FACEBOOK_URL: 'https://www.facebook.com/auto.man.driving',
  FACEBOOK_HANDLE: '@auto.man.driving',
  
  // Service overviews for marketing/homepage (high-level categories)
  SERVICE_OVERVIEWS: [
    {
      id: 'beginner-drivers',
      name: 'Beginner Drivers',
      slug: 'beginner-drivers',
      description: 'Learn with patient, experienced instructors at your own pace in a safe and supportive environment.',
      image: 'images/beginner-driver.jpg',
      icon: 'images/icons/l-plate.svg', // L-plate for learner drivers
      page: 'beginner-drivers.html',
      duration: '1 hour', // Default lesson duration
      cost: '$85', // Base price
      costDescription: '$85 per hour', // Full description for service cards
      // priceAlt: 'or $76 per hour in a package', // Alternative pricing text  PACKAGES LATER
      priceAlt: 'or $82.50 per hour for a 2 hour lesson',
      costNote: null
    },
    {
      id: 'driving-test-package',
      name: 'Driving Test Package',
      slug: 'driving-test-package',
      description: 'Get a warm-up lesson and use of our instructor\'s car for your driving test. Maximise your chances of success with confidence.',
      image: 'images/driving-test.jpg',
      icon: 'images/icons/traffic-cone.svg', // Traffic cone for driving test
      page: 'driving-test-package.html',
      duration: '1 hour pre-test + test',
      cost: '$300', // Base price
      costDescription: '$300', // Full description for service cards
      priceAlt: null, // No alternative pricing
      costNote: 'Our Driving Test Package fee does not include VicRoads testing fee.'
    },
    {
      id: 'overseas-licence',
      name: 'Overseas Licence Conversion',
      slug: 'overseas-licence',
      description: 'Convert your overseas licence to Australian standards and gain confidence with local road rules.',
      image: 'images/overseas-driver.jpg',
      icon: '🌏', // Globe for international
      page: 'overseas-licence.html',
      duration: '1 hour',
      cost: '$85', // Base price
      costDescription: '$85 per hour', // Full description for service cards
      //priceAlt: 'or $76 per hour in a package',  PACKAGES LATER
      priceAlt: 'or $82.50 per hour for a 2 hour lesson',
      costNote: null
    },
    {
      id: 'nervous-drivers',
      name: 'Nervous Drivers',
      slug: 'nervous-drivers',
      description: 'Specialised support for nervous or anxious drivers. Build confidence with patient and understanding instruction.',
      image: 'images/nervous-driver.jpg',
      icon: '💙', // Heart for care/support
      page: 'nervous-drivers.html',
      duration: '1 hour',
      cost: '$85', // Base price
      costDescription: '$85 per hour', // Full description for service cards
      // priceAlt: 'or $76 per hour in a package',  PACKAGES LATER
      priceAlt: 'or $82.50 per hour for a 2 hour lesson',
      costNote: null
    },
    {
      id: 'senior-drivers',
      name: 'Senior Driver Retests',
      slug: 'senior-drivers',
      description: 'Refresher lessons and test preparation tailored for senior drivers. Maintain your independence with confidence.',
      image: 'images/older-driver.jpg',
      icon: 'images/icons/green-star.svg', // Green star for experienced drivers
      page: 'senior-drivers.html',
      duration: '1 hour',
      cost: '$75', // Base price (pensioner discount)
      costDescription: '$75 per hour', // Full description for service cards
      priceAlt: null, // No package pricing for seniors
      costNote: 'Pensioner discount included'
    },
    {
      id: 'special-needs',
      name: 'Special Requirements',
      slug: 'special-needs',
      description: 'Have unique needs or circumstances? We offer customised lessons tailored to your specific requirements. Contact us to discuss how we can help.',
      image: 'images/medium-shot-smiley-woman-car.jpg',
      icon: '🤝', // Handshake for personalized support
      page: 'special-requirements.html',
      duration: 'Custom',
      cost: null,
      costDescription: null,
      priceAlt: null,
      costNote: ''
    }
  ],
  
  // Bookable services (for booking system integration)
  // This will be populated from the booking system API
  SERVICES: [],

  // Booking service categories with services
  BOOKING_CATEGORIES: [
    {
      id: 'automatic',
      name: 'Automatic Lessons',
      icon: 'images/auto-gearbox.png',
      services: [
        {
          id: 'auto-1hr',
          name: 'Automatic Driving Lesson',
          duration: '1 hour',
          price: 85,
          description: 'Perfect for beginners and skill improvement',
          bookingUrl: 'https://calendar.app.google/3ehp4B9MRcF83CEE9'
        },
        {
          id: 'auto-1-5hr',
          name: 'Automatic Driving Lesson',
          duration: '1.5 hours',
          price: 125,
          description: 'Extra time for complex skills',
          bookingUrl: 'https://calendar.app.google/tTykRfbx3w9izTY86'
        },
        {
          id: 'auto-2hr',
          name: 'Automatic Driving Lesson',
          duration: '2 hours',
          price: 165,
          description: 'Extended session for comprehensive practice',
          bookingUrl: 'https://calendar.app.google/QtGWGiyNpcqq9C1z8'
        }
      ]
    },
    {
      id: 'manual',
      name: 'Manual Lessons',
      icon: 'images/manual-gearbox.png',
      comingSoon: true,
      services: [
        /* Manual services coming soon - no manual vehicle available yet
        {
          id: 'manual-1hr',
          name: 'Manual Driving Lesson',
          duration: '1 hour',
          price: 85,
          description: 'Clutch control and gear work',
          bookingUrl: 'https://calendar.app.google/REPLACE_WITH_MANUAL_1H_LINK'
        },
        {
          id: 'manual-1-5hr',
          name: 'Manual Driving Lesson',
          duration: '1.5 hours',
          price: 125,
          description: 'More time for traffic and hills',
          bookingUrl: 'https://calendar.app.google/REPLACE_WITH_MANUAL_1_5H_LINK'
        },
        {
          id: 'manual-2hr',
          name: 'Manual Driving Lesson',
          duration: '2 hours',
          price: 165,
          description: 'Extended manual transmission practice',
          bookingUrl: 'https://calendar.app.google/REPLACE_WITH_MANUAL_2H_LINK'
        }
        */
      ]
    },
    {
      id: 'senior',
      name: 'Senior Lessons',
      icon: 'images/elderly-couple.png',
      services: [
        {
          id: 'senior-auto-1hr',
          name: 'Senior Automatic Driving Lesson',
          duration: '1 hour',
          price: 75,
          description: 'Includes pensioner discount',
          bookingUrl: 'https://calendar.app.google/vvE6utyXe4aa7BQb9'
        }
        /* Manual services coming soon - no manual vehicle available yet
        {
          id: 'senior-manual-1hr',
          name: 'Senior Manual Driving Lesson',
          duration: '1 hour',
          price: 75,
          description: 'Includes pensioner discount',
          bookingUrl: 'https://calendar.app.google/REPLACE_WITH_SENIOR_MANUAL_1H_LINK'
        }
        */
      ]
    }
  ],
  
  // Individual lesson pricing (by duration) - used on service pages
  // googleCalendarUrl is the direct Google Calendar link that gets embedded in google-booking.html
  LESSON_PRICING: [
    { duration: '1 hour',   durationShort: '1hr',   price: 85,  googleCalendarUrl: 'https://calendar.app.google/3ehp4B9MRcF83CEE9' },
    { duration: '1.5 hour', durationShort: '1.5hr', price: 125, googleCalendarUrl: 'https://calendar.app.google/tTykRfbx3w9izTY86' },
    { duration: '2 hour',   durationShort: '2hr',   price: 165, googleCalendarUrl: 'https://calendar.app.google/QtGWGiyNpcqq9C1z8' }
  ],
  
  // Discounted pricing (e.g. senior) - used on senior-drivers.html
  LESSON_PRICING_DISCOUNTED: [
    { duration: '1 hour', durationShort: '1hr', price: 75, googleCalendarUrl: 'https://calendar.app.google/vvE6utyXe4aa7BQb9', note: 'Including pensioner discount' }
  ],

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
      ],
      bookingPackageId: 1
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
      ],
      bookingPackageId: 2
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
      ],
      bookingPackageId: 3
    }
  ]
  ,
  // Driving tasks checklist for admin client progress
  DRIVING_TASKS: [
    'Parallel park',
    'Reverse park',
    'Three-point turn',
    'Hill start',
    'Lane change',
    'Merging',
    'Roundabouts',
    'Overtaking',
    'Observation',
    'Speed control',
    'Parking (angle/perpendicular)',
    'School zones'
  ]
};

// Make config available globally
window.SITE_CONFIG = SITE_CONFIG;

// Also expose Supabase config as global variables for compatibility
window.SUPABASE_URL = SITE_CONFIG.SUPABASE_URL;
window.SUPABASE_ANON_KEY = SITE_CONFIG.SUPABASE_ANON_KEY;

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
  function replacePhoneNumbers(){
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
    const walkerPhone = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const phoneNodesToReplace = [];
    let node;
    while (node = walkerPhone.nextNode()) {
      if (node.textContent.includes('{{PHONE}}') || node.textContent.includes('{{OWNER}}') || node.textContent.includes('{{EMAIL}}') || node.textContent.includes('{{HOURS}}')) {
        phoneNodesToReplace.push(node);
      }
    }

    phoneNodesToReplace.forEach(n => {
      n.textContent = n.textContent
        .replace(/\{\{PHONE\}\}/g, SITE_CONFIG.PHONE_NUMBER_DISPLAY)
        .replace(/\{\{OWNER\}\}/g, SITE_CONFIG.OWNER_NAME)
        .replace(/\{\{EMAIL\}\}/g, SITE_CONFIG.EMAIL)
        .replace(/\{\{HOURS\}\}/g, SITE_CONFIG.WORKING_HOURS);
    });

    // Replace {{PHONE_LINK}} in href attributes
    document.querySelectorAll('a[href*="{{PHONE_LINK}}"]').forEach(link => {
      link.href = link.href.replace(/\{\{PHONE_LINK\}\}/g, SITE_CONFIG.PHONE_NUMBER_LINK);
    });

    // Replace {{EMAIL}} in href attributes
    document.querySelectorAll('a[href*="{{EMAIL}}"]').forEach(link => {
      link.href = link.href.replace(/\{\{EMAIL\}\}/g, SITE_CONFIG.EMAIL);
    });

    // Replace {{PHONE_LINK}} in href attributes
    document.querySelectorAll('a[href*="{{PHONE_LINK}}"]').forEach(link => {
      link.href = link.href.replace(/\{\{PHONE_LINK\}\}/g, SITE_CONFIG.PHONE_NUMBER_LINK);
    });

    // Replace {{FACEBOOK_URL}} in href attributes
    document.querySelectorAll('a[href*="{{FACEBOOK_URL}}"]').forEach(link => {
      link.href = link.href.replace(/\{\{FACEBOOK_URL\}\}/g, SITE_CONFIG.FACEBOOK_URL);
    });

    // Replace {{FACEBOOK}} in href attributes
    document.querySelectorAll('a[href*="{{FACEBOOK}}"]').forEach(link => {
      link.href = link.href.replace(/\{\{FACEBOOK\}\}/g, SITE_CONFIG.FACEBOOK_HANDLE);
    });

    // Replace placeholders in all text nodes (robust)
    const TOKEN_MAP = new Map([
      ['{{EMAIL}}', SITE_CONFIG.EMAIL],
      ['{{PHONE}}', SITE_CONFIG.PHONE_NUMBER_DISPLAY || ''],
      ['{{FACEBOOK}}', SITE_CONFIG.FACEBOOK_HANDLE || ''],
      ['{{HOURS}}', SITE_CONFIG.WORKING_HOURS || ''],
    ]);
    const walkerTokens = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walkerTokens.nextNode()) textNodes.push(walkerTokens.currentNode);
    textNodes.forEach(n => {
      let txt = n.nodeValue;
      let changed = false;
      TOKEN_MAP.forEach((val, key) => {
        if (txt && txt.includes(key)) {
          txt = txt.split(key).join(val);
          changed = true;
        }
      });
      if (changed) n.nodeValue = txt;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replacePhoneNumbers);
  } else {
    replacePhoneNumbers();
  }

  // Also run after config is updated from API
  window.addEventListener('configUpdated', replacePhoneNumbers);
  // Run after shared partials are injected
  window.addEventListener('partialsLoaded', replacePhoneNumbers);
  // As a final safety, run after full window load
  window.addEventListener('load', replacePhoneNumbers);
  
  // Ensure favicon and title branding across all pages
  function ensureBrandingHead(){
    try {
      const href = 'images/auto-man-small-logo120x120.png';
      let link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.type = 'image/png';
      link.sizes = '120x120';
      link.href = href;

      // Apple touch icon too
      let apple = document.querySelector('link[rel="apple-touch-icon"]');
      if (!apple) {
        apple = document.createElement('link');
        apple.rel = 'apple-touch-icon';
        document.head.appendChild(apple);
      }
      apple.sizes = '120x120';
      apple.href = href;

      if (!document.title || document.title === 'Driving Test Package Geelong | Auto-Man Driving School' || document.title.includes('Auto-Man Driving School') || document.title.includes('Book a Lesson')) {
        document.title = 'Auto-Man';
      }
    } catch (e) {
      console.warn('Branding head update failed', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureBrandingHead);
  } else {
    ensureBrandingHead();
  }
  window.addEventListener('partialsLoaded', ensureBrandingHead);
})();
