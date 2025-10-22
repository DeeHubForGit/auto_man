# Legal Pages - Summary

## Created Pages

### 1. Terms & Conditions (`terms.html`)
**URL:** `https://automandrivingschool.com.au/terms.html`

**Sections included:**
- ✅ Cancellation Policy (24-hour notice required)
- ✅ Refund Policy
- ✅ Lesson Start Time (punctuality requirements)
- ✅ Pricing (GST included)
- ✅ Unused Lessons (transfer policy)
- ✅ Lesson Packages (12-month expiry)
- ✅ Cancellation by Auto-Man Driving School

**Key policies:**
- 24-hour cancellation notice required for refunds
- Full fee charged for late cancellations, no-shows, or being 15+ minutes late
- Must provide valid Learner's Permit
- Prepaid lessons can be transferred with written permission
- Packages expire after 12 months

### 2. Privacy Policy (`privacy.html`)
**URL:** `https://automandrivingschool.com.au/privacy.html`

**Sections included:**
- ✅ Collecting Personal Information
- ✅ Online Bookings (data collection)
- ✅ Cookies (tracking and analytics)
- ✅ Facebook Pixel
- ✅ Aggregation of Data
- ✅ Payment Information (security)
- ✅ Secure Online Payment (encryption)
- ✅ Access to Information (5 business days)
- ✅ Changing and Deleting Information
- ✅ Storage of Information (secure servers)
- ✅ Password and Login (user responsibility)
- ✅ Links to External Websites
- ✅ Changes to This Policy

**Compliance:**
- Privacy Act 1988 compliant
- Google Analytics disclosure
- Facebook Pixel opt-out information
- Payment security (PCI compliance)
- Data retention and deletion policies

## Footer Updates

Updated `partials/footer.html` to include:
- Terms & Conditions link
- Privacy Policy link
- Visual separator (|) between main nav and legal links

## Design Features

Both pages follow the same design pattern as other site pages:
- ✅ Consistent header with navigation
- ✅ Blue gradient hero section
- ✅ White content cards with rounded corners and shadows
- ✅ Responsive layout (mobile-friendly)
- ✅ Clear typography and spacing
- ✅ Call-to-action to contact page
- ✅ Shared footer with legal links

## Next Steps

1. **Review content** - Ensure all policies match your actual business practices
2. **Legal review** - Consider having a lawyer review for compliance
3. **Update as needed** - Adjust specific details (e.g., email addresses, timeframes)
4. **Link from booking flow** - Add checkboxes to booking forms requiring users to accept terms
5. **Email templates** - Reference these pages in confirmation emails

## Important Notes

- The content is adapted from the Newton Driving School sample you provided
- All references changed from "Newton Driving School" to "Auto-Man Driving School"
- Domain changed to `automandrivingschool.com.au`
- Policies are standard for driving schools in Australia
- Consider adding a "Last Updated" date to both pages

## Booking Integration

Consider adding to your booking flow:
```html
<label class="flex items-start gap-2">
  <input type="checkbox" required class="mt-1">
  <span class="text-sm">
    I agree to the 
    <a href="terms.html" target="_blank" class="text-blue-600 hover:underline">Terms & Conditions</a>
    and 
    <a href="privacy.html" target="_blank" class="text-blue-600 hover:underline">Privacy Policy</a>
  </span>
</label>
```
