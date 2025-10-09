# API Integration Example

This document shows how to integrate the site with a backend API for dynamic content management.

## Quick Start

### 1. Static Config (Current)
Currently, all data is stored in `assets/config.js`:
```javascript
const SITE_CONFIG = {
  OWNER_NAME: 'Darren',
  PHONE_NUMBER: '0403 632 313',
  SERVICES: [...],
  PACKAGES: [...]
};
```

### 2. Load from API (Future)
To load data from an API instead:

```javascript
// In your page or in a custom init script
document.addEventListener('DOMContentLoaded', async () => {
  // Load config from your API
  await SITE_CONFIG.loadFromAPI('https://your-api.com/api/config');
  
  // Config is now updated and content will re-render automatically
});
```

## API Endpoint Structure

### GET /api/config
Returns the complete site configuration:

```json
{
  "ownerName": "Darren",
  "phoneNumber": "0403 632 313",
  "services": [
    {
      "id": "beginner-drivers",
      "name": "Beginner Drivers",
      "slug": "beginner-drivers",
      "description": "Learn with patient, experienced instructors...",
      "image": "images/beginner-driver.jpg",
      "page": "beginner-drivers.html",
      "price": null
    },
    {
      "id": "driving-test-package",
      "name": "Driving Test Package",
      "slug": "driving-test-package",
      "description": "Get a warm-up lesson and use of our instructor's car...",
      "image": "images/driving-test.jpg",
      "page": "driving-test-package.html",
      "price": 250,
      "priceNote": "Our Driving Test Package fee does not include VicRoads testing fee."
    }
  ],
  "packages": [
    {
      "id": "3-lesson-pack",
      "name": "3 Lesson Pack",
      "price": 240,
      "lessons": 3,
      "duration": "1-hour",
      "validity": "12 months",
      "popular": false,
      "features": [
        "3 × 1-hour lessons",
        "Valid 12 months"
      ]
    },
    {
      "id": "5-lesson-pack",
      "name": "5 Lesson Pack",
      "price": 390,
      "lessons": 5,
      "duration": "1-hour",
      "validity": "12 months",
      "popular": true,
      "features": [
        "5 × 1-hour lessons",
        "Valid 12 months"
      ]
    }
  ]
}
```

## Implementation Steps

### Step 1: Create API Endpoints
Create backend endpoints that return data in the format above.

### Step 2: Add API Loading Script
Create `assets/api-init.js`:

```javascript
// Load config from API on page load
(async function() {
  const API_URL = 'https://your-api.com/api/config';
  
  try {
    await SITE_CONFIG.loadFromAPI(API_URL);
    console.log('✅ Config loaded from API');
  } catch (error) {
    console.warn('⚠️ Failed to load from API, using static config');
  }
})();
```

### Step 3: Include in HTML Pages
Add to all pages after config.js:

```html
<script src="assets/config.js"></script>
<script src="assets/api-init.js"></script>
<script src="assets/render-helpers.js" defer></script>
<script src="assets/include.js" defer></script>
```

### Step 4: Use Dynamic Rendering
Update pages to use dynamic containers:

**Before (Static HTML):**
```html
<div class="grid md:grid-cols-3 gap-6">
  <div class="bg-white rounded-2xl shadow p-6">
    <h3>3 Lesson Pack</h3>
    <p>$240</p>
  </div>
  <!-- More packages... -->
</div>
```

**After (Dynamic from Config):**
```html
<div id="packages-container" class="grid md:grid-cols-3 gap-6">
  <!-- Content will be rendered from SITE_CONFIG.PACKAGES -->
</div>
```

## Benefits

✅ **Centralized Management**: Update prices and services from one place (API)  
✅ **No Code Deploys**: Change content without redeploying the website  
✅ **Consistency**: Same data structure across all pages  
✅ **Fallback**: Falls back to static config if API fails  
✅ **Easy Migration**: Can switch between static and API with minimal changes  

## Testing

### Test with Mock API
You can test with a mock API response:

```javascript
// Create a mock API response
const mockConfig = {
  ownerName: "Test Owner",
  phoneNumber: "0400 000 000",
  services: SITE_CONFIG.SERVICES,
  packages: SITE_CONFIG.PACKAGES.map(p => ({
    ...p,
    price: p.price + 10 // Test price increase
  }))
};

// Simulate API load
SITE_CONFIG.loadFromAPI = async () => {
  return new Promise(resolve => {
    setTimeout(() => {
      Object.assign(SITE_CONFIG, mockConfig);
      window.dispatchEvent(new CustomEvent('configUpdated'));
      resolve(mockConfig);
    }, 500);
  });
};
```

## Migration Path

1. **Phase 1 (Current)**: Static config in `config.js`
2. **Phase 2**: Add API endpoints, test with static fallback
3. **Phase 3**: Enable API loading, keep static as fallback
4. **Phase 4**: Full API integration, remove static data

This approach allows gradual migration without breaking existing functionality.
