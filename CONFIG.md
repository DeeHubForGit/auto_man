# Site Configuration

## Overview
Site-wide settings (owner name, phone number, services, and pricing) are centrally managed in `assets/config.js` to ensure consistency across the entire website. This configuration is designed to be easily replaced with API data in the future.

## Configuration Files
- **Main Config:** `assets/config.js` - Contains all site data
- **Render Helpers:** `assets/render-helpers.js` - Functions to dynamically render content from config

### Configuration Structure

```javascript
const SITE_CONFIG = {
  OWNER_NAME: 'Darren',
  PHONE_NUMBER: '0403 632 313',
  PHONE_NUMBER_LINK: '0403632313',
  PHONE_NUMBER_DISPLAY: '0403 632 313',
  
  // Service overviews for marketing/homepage
  SERVICE_OVERVIEWS: [
    {
      id: 'beginner-drivers',
      name: 'Beginner Drivers',
      slug: 'beginner-drivers',
      description: '...',
      image: 'images/beginner-driver.jpg',
      page: 'beginner-drivers.html',
      duration: '1 hour',
      cost: 80,
      costNote: null
    },
    {
      id: 'driving-test-package',
      name: 'Driving Test Package',
      slug: 'driving-test-package',
      description: '...',
      image: 'images/driving-test.jpg',
      page: 'driving-test-package.html',
      duration: '45-60 min warm-up + test',
      cost: 250,
      costNote: 'Our Driving Test Package fee does not include VicRoads testing fee.'
    },
    // ... more service overviews
  ],
  
  // Bookable services (from booking system API)
  SERVICES: [],
  
  // Individual lesson pricing
  LESSON_PRICING: [
    { duration: '1 hour', durationShort: '1hr', price: 85 },
    { duration: '1.5 hour', durationShort: '1.5hr', price: 125 },
    { duration: '2 hour', durationShort: '2hr', price: 165 }
  ],
  
  PACKAGES: [
    {
      id: '3-lesson-pack',
      name: '3 Lesson Pack',
      price: 240,
      lessons: 3,
      duration: '1-hour',
      validity: '12 months',
      popular: false,
      features: ['3 × 1-hour lessons', 'Valid 12 months']
    },
    {
      id: '5-lesson-pack',
      name: '5 Lesson Pack',
      price: 390,
      lessons: 5,
      duration: '1-hour',
      validity: '12 months',
      popular: true,
      features: ['5 × 1-hour lessons', 'Valid 12 months']
    },
    {
      id: '10-lesson-pack',
      name: '10 Lesson Pack',
      price: 760,
      lessons: 10,
      duration: '1-hour',
      validity: '12 months',
      popular: false,
      features: ['10 × 1-hour lessons', 'Valid 12 months']
    }
  ]
};
```

## How to Update Settings

### Owner Name
1. Open `assets/config.js`
2. Update `OWNER_NAME` value
3. Save the file

Use `{{OWNER}}` placeholder in HTML to automatically insert the owner's name.

### Phone Number
1. Open `assets/config.js`
2. Update the phone number values:
   - `PHONE_NUMBER_LINK`: Phone number without spaces (for `tel:` links)
   - `PHONE_NUMBER_DISPLAY`: Phone number with spaces (for display)
3. Save the file

Use `{{PHONE}}` placeholder in HTML to automatically insert the phone number.

### Service Overviews (Marketing)
1. Open `assets/config.js`
2. Update the `SERVICE_OVERVIEWS` array
3. Each service overview should have:
   - `id`: Unique identifier
   - `name`: Display name
   - `slug`: URL-friendly name
   - `description`: Service description
   - `image`: Path to service image
   - `page`: Link to service page
   - `duration`: Service duration (e.g., "1 hour")
   - `cost`: Service cost in dollars
   - `costNote`: Optional note about pricing
4. Save the file

### Individual Lesson Pricing
1. Open `assets/config.js`
2. Update the `LESSON_PRICING` array
3. Each lesson option should have: `duration`, `durationShort`, `price`
4. Save the file

### Packages & Pricing
1. Open `assets/config.js`
2. Update the `PACKAGES` array
3. Each package should have: `id`, `name`, `price`, `lessons`, `duration`, `validity`, `popular`, `features`
4. Save the file

### Bookable Services
The `SERVICES` array is reserved for actual bookable services from your booking system API.
These will be services like "Auto Driving Lesson 1 hour", "Manual Driving Lesson 1 hour", etc.

## Current Settings
- **Owner Name:** Darren
- **Phone Number:** 0403 632 313
- **Service Overviews:** 5 (Beginner Drivers, Driving Test Package, Overseas Licence, Nervous Drivers, Senior Drivers)
- **Bookable Services:** 0 (will be loaded from booking system API)
- **Lesson Pricing:** 3 options ($85/hr, $125/1.5hr, $165/2hr)
- **Packages:** 3 ($240, $390, $760)

## Pages Updated
All HTML pages now include the config file:
- index.html
- driving-test-package.html
- beginner-drivers.html
- simplybook.html
- simplybook-packages.html
- signup.html
- setmore.html
- picktime.html
- login.html
- booking.html
- booking-custom.html
- book.html

## API Integration (Future)

The configuration is designed to be easily replaced with API data. To load from an API:

```javascript
// Example: Load config from API
SITE_CONFIG.loadFromAPI('https://api.example.com/config')
  .then(data => {
    console.log('Config loaded from API:', data);
    // Content will automatically re-render
  });
```

### API Response Format
```json
{
  "ownerName": "Darren",
  "phoneNumber": "0403 632 313",
  "services": [
    {
      "id": "beginner-drivers",
      "name": "Beginner Drivers",
      "description": "...",
      "image": "images/beginner-driver.jpg",
      "page": "beginner-drivers.html"
    }
  ],
  "packages": [
    {
      "id": "3-lesson-pack",
      "name": "3 Lesson Pack",
      "price": 240,
      "lessons": 3,
      "features": ["3 × 1-hour lessons", "Valid 12 months"]
    }
  ]
}
```

## Helper Functions

### Access Config Data
```javascript
// Get a service overview (marketing)
const overview = SITE_CONFIG.getServiceOverview('beginner-drivers');

// Get a bookable service (from booking system)
const service = SITE_CONFIG.getService('auto-lesson-1hr');

// Get a specific package
const package = SITE_CONFIG.getPackage('5-lesson-pack');

// Get the popular package
const popular = SITE_CONFIG.getPopularPackage();
```

### Dynamic Rendering
To use dynamic rendering on a page:

1. Add the render-helpers script:
```html
<script src="assets/render-helpers.js" defer></script>
```

2. Add container elements with specific IDs:
```html
<div id="services-container" class="grid md:grid-cols-3 gap-6"></div>
<div id="packages-container" class="grid md:grid-cols-3 gap-6"></div>
```

3. Content will automatically render from config on page load.

## Technical Details
- Config file is loaded before other scripts
- Automatically replaces `{{OWNER}}` and `{{PHONE}}` placeholders throughout the site
- Supports dynamic rendering of services and packages
- Ready for API integration with `loadFromAPI()` method
- Fires `configUpdated` event when config changes
