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
  APPOINTMENT_BUFFER_MINUTES: 15,
  PHONE_NUMBER: '0403 632 313',
  PHONE_NUMBER_LINK: '0403632313', // For tel: links (no spaces)
  PHONE_NUMBER_DISPLAY: '0403 632 313', // For display (with spaces)
  EMAIL: 'info@automandrivingschool.com.au',
  
  // Business hours display text (updated dynamically after loading from database/fallback)
  // NOTE: {{HOURS}} token gets replaced once during page load with whatever value WORKING_HOURS
  // contains at that time. For dynamically updated hours that reflect database changes,
  // use <div data-business-hours> instead (see contact.html for implementation).
  WORKING_HOURS: '',
  
  // Business hours data (loaded from fallback JSON then updated from database)
  BUSINESS_HOURS_ROWS: [],
  BUSINESS_HOURS_LINES: [],
  BUSINESS_HOURS_SOURCE: null, // 'fallback', 'database', or 'emergency'
  
  // Business hours used for admin warnings (soft only, not enforced)
  BUSINESS_HOURS: {
    EARLIEST_START_MINS: 8 * 60,   // 08:00
    LATEST_END_MINS: 21 * 60,      // 21:00 (9 PM)
  },
  
  // Social media
  FACEBOOK_URL: 'https://www.facebook.com/auto.man.driving',
  FACEBOOK_HANDLE: '@auto.man.driving',
  
  // Service overviews for marketing/homepage (high-level categories)
  SERVICE_OVERVIEWS: [
    {
      id: 'beginner-drivers',
      name: 'Beginner Drivers',
      slug: 'beginner-drivers',
      serviceCategoryName: 'Automatic Lessons',
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
      serviceCategoryName: 'Automatic Lessons',
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
  // Loaded from database with JSON fallback
  SERVICE_CATEGORIES: [],
  SERVICES: [],
  BOOKING_SERVICES_SOURCE: null, // 'fallback', 'database'
  
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

// Business hours helper function
window.SITE_CONFIG.getBusinessHoursLines = function() {
  return [...this.BUSINESS_HOURS_LINES];
};

// =====================================================================
// Business Hours Loading System
// =====================================================================

// Normalize and validate business hours rows
function normaliseBusinessHours(rows) {
  if (!Array.isArray(rows)) {
    console.warn('[config] Business hours data is not an array');
    return [];
  }
  
  const valid = [];
  for (const row of rows) {
    const dayOfWeek = parseInt(row.day_of_week, 10);
    const startTime = row.start_time;
    const endTime = row.end_time;
    
    // Validate day_of_week
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      console.warn('[config] Invalid day_of_week:', row);
      continue;
    }
    
    // Validate times exist
    if (!startTime || !endTime) {
      console.warn('[config] Missing start_time or end_time:', row);
      continue;
    }
    
    // Validate start < end (basic string comparison works for HH:MM:SS format)
    if (startTime >= endTime) {
      console.warn('[config] start_time must be before end_time:', row);
      continue;
    }
    
    valid.push({
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime
    });
  }
  
  return valid;
}

// Format a time string (HH:MM:SS) to display format (e.g., "9 am", "3:45 pm")
function formatBusinessTime(timeStr) {
  const parts = timeStr.split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  
  const isPM = hours >= 12;
  if (hours === 0) hours = 12; // midnight
  else if (hours > 12) hours -= 12;
  
  const period = isPM ? 'pm' : 'am';
  
  // Omit :00 for whole hours
  if (minutes === 0) {
    return `${hours} ${period}`;
  }
  return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// Build formatted display lines from business hours rows
function buildBusinessHoursLines(rows) {
  if (!rows || rows.length === 0) {
    return [];
  }
  
  // Day names in display order (Monday first)
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const displayOrder = [1, 2, 3, 4, 5, 6, 0]; // Monday to Sunday
  
  // Group periods by day
  const dayMap = new Map();
  for (const row of rows) {
    const day = row.day_of_week;
    if (!dayMap.has(day)) {
      dayMap.set(day, []);
    }
    dayMap.get(day).push({
      start: row.start_time,
      end: row.end_time
    });
  }
  
  // Sort periods within each day by start time
  for (const [day, periods] of dayMap.entries()) {
    periods.sort((a, b) => a.start.localeCompare(b.start));
  }
  
  // Build display lines in day order
  const lines = [];
  for (const dayNum of displayOrder) {
    if (!dayMap.has(dayNum)) continue;
    
    const dayName = dayNames[dayNum];
    const periods = dayMap.get(dayNum);
    
    const timeRanges = periods.map(p => 
      `${formatBusinessTime(p.start)}–${formatBusinessTime(p.end)}`
    );
    
    lines.push(`${dayName}: ${timeRanges.join(', ')}`);
  }
  
  return lines;
}

// Set business hours and update display
function setBusinessHours(rows, source) {
  SITE_CONFIG.BUSINESS_HOURS_ROWS = normaliseBusinessHours(rows);
  SITE_CONFIG.BUSINESS_HOURS_SOURCE = source;
  SITE_CONFIG.BUSINESS_HOURS_LINES = buildBusinessHoursLines(SITE_CONFIG.BUSINESS_HOURS_ROWS);
  
  // Update WORKING_HOURS for backward compatibility with {{HOURS}} token
  if (SITE_CONFIG.BUSINESS_HOURS_LINES.length > 0) {
    SITE_CONFIG.WORKING_HOURS = SITE_CONFIG.BUSINESS_HOURS_LINES.join(', ');
  } else {
    SITE_CONFIG.WORKING_HOURS = '';
  }
  
  renderBusinessHours();
  window.dispatchEvent(new CustomEvent('configUpdated'));
}

// Render business hours into all [data-business-hours] containers
function renderBusinessHours() {
  const cards = document.querySelectorAll('[data-business-hours-card]');
  const containers = document.querySelectorAll('[data-business-hours]');
  const hasHours = SITE_CONFIG.BUSINESS_HOURS_LINES.length > 0;
  
  cards.forEach(card => {
    card.classList.toggle('hidden', !hasHours);
  });
  
  containers.forEach(container => {
    container.textContent = '';
    
    if (!hasHours) {
      return;
    }
    
    SITE_CONFIG.BUSINESS_HOURS_LINES.forEach(line => {
      const p = document.createElement('p');
      const colonIndex = line.indexOf(':');
      
      if (colonIndex !== -1) {
        const daySpan = document.createElement('span');
        daySpan.className = 'font-semibold';
        daySpan.textContent = line.substring(0, colonIndex + 1);
        
        const timeSpan = document.createElement('span');
        timeSpan.textContent = line.substring(colonIndex + 1);
        
        p.appendChild(daySpan);
        p.appendChild(timeSpan);
      } else {
        p.textContent = line;
      }
      
      container.appendChild(p);
    });
  });
}

// Load business hours from fallback JSON
let fallbackLoadPromise = null;
async function loadBookingConfigFallback() {
  if (fallbackLoadPromise) {
    return fallbackLoadPromise;
  }
  
  fallbackLoadPromise = (async () => {
    try {
      const response = await fetch('assets/data/booking-services-fallback.json', {
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load fallback JSON: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Load business hours from fallback
      if (data.business_hours && Array.isArray(data.business_hours)) {
        // Don't overwrite database hours if already loaded
        if (SITE_CONFIG.BUSINESS_HOURS_SOURCE !== 'database') {
          setBusinessHours(data.business_hours, 'fallback');
        }
      } else {
        console.warn('[config] No business_hours found in fallback JSON');
      }
      
      // Load booking services from fallback
      if (data.categories && Array.isArray(data.categories)) {
        // Don't overwrite database services if already loaded
        if (SITE_CONFIG.BOOKING_SERVICES_SOURCE !== 'database') {
          const { categories, services } = normaliseBookingConfigFallback(data);
          setBookingServices(categories, services, 'fallback');
        }
      } else {
        console.warn('[config] No categories found in fallback JSON');
      }
      
      return data;
    } catch (error) {
      console.warn('[config] Could not load fallback:', error.message);
      // Set emergency fallback
      if (!SITE_CONFIG.BUSINESS_HOURS_SOURCE) {
        setBusinessHours([], 'emergency');
      }
      if (!SITE_CONFIG.BOOKING_SERVICES_SOURCE) {
        setBookingServices([], [], 'emergency');
      }
    }
  })();
  
  return fallbackLoadPromise;
}

// Load business hours from Supabase database
async function loadBusinessHoursFromDatabase() {
  if (!window.supabaseClient) {
    console.warn('[config] Cannot load business hours: supabaseClient not available');
    return;
  }
  
  try {
    const { data, error } = await window.supabaseClient
      .from('business_hours')
      .select('day_of_week, start_time, end_time')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });
    
    if (error) {
      console.warn('[config] Failed to load business hours from database:', error.message);
      // Keep fallback hours
      return;
    }
    
    // Database query succeeded - use this result even if empty
    setBusinessHours(data || [], 'database');
    
  } catch (error) {
    console.warn('[config] Error loading business hours from database:', error.message);
    // Keep fallback hours
  }
}

// Handle Supabase readiness and load database hours
async function handleBusinessHoursSupabaseReady() {
  // Wait for fallback to load first to prevent race condition
  await loadBookingConfigFallback();
  
  // Then load from database
  await loadBusinessHoursFromDatabase();
}

// Initialize business hours loading
(function initBusinessHours() {
  // Start loading fallback immediately
  loadBookingConfigFallback();
  
  // Load from database after Supabase is ready
  if (window.supabaseClient) {
    handleBusinessHoursSupabaseReady();
  } else {
    window.addEventListener('partialsLoaded', handleBusinessHoursSupabaseReady);
  }
  
  // Rerender after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderBusinessHours);
  }
  
  // Rerender after partials load
  window.addEventListener('partialsLoaded', renderBusinessHours);
})();

// =====================================================================
// Booking Services Loading System
// =====================================================================

// Normalize and validate booking config fallback data
function normaliseBookingConfigFallback(fallbackData) {
  if (!fallbackData || !Array.isArray(fallbackData.categories)) {
    console.warn('[config] Invalid fallback categories structure');
    return { categories: [], services: [] };
  }
  
  const categories = [];
  const services = [];
  
  for (const cat of fallbackData.categories) {
    // Normalize category
    if (cat.is_active === false) continue;
    
    const normalizedCat = {
      id: cat.id,
      name: cat.name,
      sort_order: cat.sort_order || 0,
      is_active: cat.is_active !== false,
      message_text: cat.message_text || null,
      icon_url: cat.icon_url || null
    };
    
    categories.push(normalizedCat);
    
    // Normalize services for this category
    if (Array.isArray(cat.services)) {
      for (const svc of cat.services) {
        if (svc.is_active === false) continue;
        
        const normalizedSvc = {
          id: svc.id || null,
          service_category_id: cat.id,
          category_name: cat.name,
          code: svc.code,
          name: svc.name,
          short_name: svc.short_name || null,
          description: svc.description || null,
          duration_minutes: svc.duration_minutes,
          price_cents: svc.price_cents,
          google_booking_url: svc.google_booking_url || null,
          sort_order: svc.sort_order || 0,
          is_active: svc.is_active !== false,
          booking_time_mode: svc.booking_time_mode || null
        };
        
        services.push(normalizedSvc);
      }
    }
  }
  
  // Process top-level uncategorised services
  if (Array.isArray(fallbackData.services)) {
    for (const svc of fallbackData.services) {
      if (svc.is_active === false) continue;
      
      const normalizedSvc = {
        id: svc.id || null,
        service_category_id: svc.service_category_id || null,
        category_name: '',
        code: svc.code,
        name: svc.name,
        short_name: svc.short_name || null,
        description: svc.description || null,
        duration_minutes: svc.duration_minutes,
        price_cents: svc.price_cents,
        google_booking_url: svc.google_booking_url || null,
        sort_order: svc.sort_order || 0,
        is_active: svc.is_active !== false,
        booking_time_mode: svc.booking_time_mode || null
      };
      
      services.push(normalizedSvc);
    }
  }
  
  return { categories, services };
}

// Set booking services and update display
function setBookingServices(categories, services, source) {
  SITE_CONFIG.SERVICE_CATEGORIES = categories || [];
  SITE_CONFIG.SERVICES = services || [];
  SITE_CONFIG.BOOKING_SERVICES_SOURCE = source;
  
  window.dispatchEvent(new CustomEvent('configUpdated'));
}

// Get service category by name
window.SITE_CONFIG.getServiceCategoryByName = function(name) {
  if (!name || !Array.isArray(this.SERVICE_CATEGORIES)) return null;
  return this.SERVICE_CATEGORIES.find(cat => cat.name === name) || null;
};

// Get active services for a category (by category name)
window.SITE_CONFIG.getServicesForCategory = function(categoryName) {
  if (!categoryName || !Array.isArray(this.SERVICES)) return [];
  
  return this.SERVICES
    .filter(svc => svc.category_name === categoryName && svc.is_active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .slice(); // Return new array
};

// Get service by code
window.SITE_CONFIG.getServiceByCode = function(code) {
  if (!code || !Array.isArray(this.SERVICES)) return null;
  
  return this.SERVICES.find(service => 
    service.code === code && service.is_active !== false
  ) || null;
};

// Format duration in minutes to display string
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '';
  
  if (minutes < 60) {
    return `${minutes} minute lesson`;
  }
  
  const hours = minutes / 60;
  
  if (hours === Math.floor(hours)) {
    return `${hours} hour lesson`;
  }
  
  return `${hours} hour lesson`;
}

// Format price in cents to display string
function formatPrice(cents) {
  if (cents == null || cents < 0) return '';
  
  const dollars = cents / 100;
  
  if (dollars === Math.floor(dollars)) {
    return `$${dollars}`;
  }
  
  return `$${dollars.toFixed(2)}`;
}

// Make format helpers available
window.SITE_CONFIG.formatDuration = formatDuration;
window.SITE_CONFIG.formatPrice = formatPrice;

// Load booking services from Supabase database
async function loadBookingServicesFromDatabase() {
  if (!window.supabaseClient) {
    console.warn('[config] Cannot load booking services: supabaseClient not available');
    return;
  }
  
  try {
    // Load categories
    const { data: catData, error: catError } = await window.supabaseClient
      .from('service_category')
      .select('id, name, sort_order, is_active, icon_path, message_text')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    
    if (catError) {
      console.warn('[config] Failed to load service categories from database:', catError.message);
      return;
    }
    
    // Normalize categories with icon URLs
    const categories = (catData || []).map(cat => ({
      id: cat.id,
      name: cat.name,
      sort_order: cat.sort_order || 0,
      is_active: cat.is_active !== false,
      message_text: cat.message_text || null,
      icon_url: cat.icon_path
        ? `${SITE_CONFIG.SUPABASE_URL}/storage/v1/object/public/service-category-icons/${cat.icon_path}`
        : null
    }));
    
    // Load all active services
    const { data: svcData, error: svcError } = await window.supabaseClient
      .from('service')
      .select('id, service_category_id, code, name, short_name, description, duration_minutes, price_cents, google_booking_url, sort_order, is_active, booking_time_mode')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    
    if (svcError) {
      console.warn('[config] Failed to load services from database:', svcError.message);
      return;
    }
    
    // Map category IDs to names
    const catIdToName = new Map(categories.map(c => [c.id, c.name]));
    
    // Normalize services with category names
    const services = (svcData || []).map(svc => ({
      id: svc.id,
      service_category_id: svc.service_category_id,
      category_name: catIdToName.get(svc.service_category_id) || '',
      code: svc.code,
      name: svc.name,
      short_name: svc.short_name || null,
      description: svc.description || null,
      duration_minutes: svc.duration_minutes,
      price_cents: svc.price_cents,
      google_booking_url: svc.google_booking_url || null,
      sort_order: svc.sort_order || 0,
      is_active: svc.is_active !== false,
      booking_time_mode: svc.booking_time_mode || null
    }));
    
    // Database query succeeded - use this result even if empty
    setBookingServices(categories, services, 'database');
    
  } catch (error) {
    console.warn('[config] Error loading booking services from database:', error.message);
    // Keep fallback services
  }
}

// Handle Supabase readiness and load database services
async function handleBookingServicesSupabaseReady() {
  // Wait for fallback to load first to prevent race condition
  await loadBookingConfigFallback();
  
  // Then load from database
  await loadBookingServicesFromDatabase();
}

// Initialize booking services loading
(function initBookingServices() {
  // Fallback is already started by business hours init
  
  // Load from database after Supabase is ready
  if (window.supabaseClient) {
    handleBookingServicesSupabaseReady();
  } else {
    window.addEventListener('partialsLoaded', handleBookingServicesSupabaseReady);
  }
})();

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
    // Early return if document.body is not available yet
    if (!document.body) {
      return;
    }
    
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
      const href = 'images/auto-man-small-logo120x120-red.png';
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
