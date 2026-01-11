# Google Analytics Setup Instructions

Google Analytics has been added to all pages of the Auto-Man Driving School website.

## How to Activate Google Analytics

1. **Create a Google Analytics Account** (if you don't have one):
   - Go to https://analytics.google.com/
   - Sign in with your Google account
   - Click "Start measuring"
   - Follow the setup wizard

2. **Create a Property**:
   - Property name: "Auto-Man Driving School"
   - Reporting time zone: Australia/Melbourne
   - Currency: Australian Dollar (AUD)

3. **Set up a Data Stream**:
   - Choose "Web"
   - Website URL: Your actual website URL
   - Stream name: "Auto-Man Website"
   - Click "Create stream"

4. **Get Your Measurement ID**:
   - After creating the stream, you'll see a Measurement ID (format: G-XXXXXXXXXX)
   - Copy this ID

5. **Update the Website**:
   - Open the file: `partials/analytics.html`
   - Replace **both** instances of `G-XXXXXXXXXX` with your actual Measurement ID
   - Example: If your ID is `G-ABC123DEF4`, replace:
     ```html
     <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4"></script>
     <script>
       window.dataLayer = window.dataLayer || [];
       function gtag(){dataLayer.push(arguments);}
       gtag('js', new Date());
       gtag('config', 'G-ABC123DEF4');
     </script>
     ```

6. **Deploy and Verify**:
   - Upload the updated website to your server
   - Visit your website
   - In Google Analytics, go to "Realtime" to see if your visit is being tracked

## What's Being Tracked

Google Analytics will automatically track:
- Page views
- User sessions
- Traffic sources (where visitors come from)
- Device types (mobile, desktop, tablet)
- Geographic location
- User behavior and navigation patterns

## Pages with Analytics

Analytics has been added to:
- ✅ Homepage (index.html)
- ✅ Beginner Drivers
- ✅ Driving Test Package
- ✅ Senior Drivers
- ✅ Nervous Drivers
- ✅ Overseas Licence Conversion

## Privacy Compliance

Consider adding a privacy policy page that mentions Google Analytics usage and cookie consent if required by Australian privacy laws.
