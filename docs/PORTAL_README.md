# Client Portal Documentation

## Overview

The client portal is a secure area where logged-in users can manage their account details and view their bookings.

## Files Created

### Main Portal Page
- **`portal.html`** - Main portal page with sidebar navigation

### Portal Partials
- **`partials/portal-details.html`** - Client details form
- **`partials/portal-bookings.html`** - Bookings list (upcoming & past)

### Updated Files
- **`assets/js/auth.js`** - Now redirects to portal after login

## Features

### 1. Sidebar Navigation
- **User Info Display**: Shows user's email and initials
- **My Details**: Manage personal information
- **My Bookings**: View upcoming and past bookings
- **Log Out**: Secure logout with confirmation

### 2. My Details Section

**Personal Information:**
- First Name (required)
- Last Name (required)
- Mobile Number (required)
- Date of Birth
- Address
- Learner Permit Number

**Emergency Contact:**
- Contact Name
- Contact Phone

**Medical & Learning Information:**
- Medical Conditions (textarea)
- Checkboxes for:
  - Anxious/nervous driver
  - Complete beginner
  - Senior driver
- Other learning needs (textarea)
- Additional notes (textarea)

**Features:**
- Auto-loads existing data from database
- Real-time save to Supabase
- Reset button to reload original data
- Success/error notifications via Modal
- Required field validation

### 3. My Bookings Section

**Two Tabs:**
- **Upcoming Bookings**: Future lessons (confirmed status)
- **Past Bookings**: Completed, cancelled, or past lessons

**Booking Card Information:**
- Service name and duration
- Date and time
- Pickup location (if provided)
- Price
- Status badge (Confirmed, Cancelled, Completed, No Show)

**Actions:**
- View in Google Calendar (for upcoming bookings)
- Cancel booking (with confirmation dialog)

**Features:**
- Auto-loads bookings from database
- Real-time status updates
- Empty state messages
- Loading indicators
- Responsive design

## Authentication Flow

1. User logs in via `login.html`
2. Redirected to `portal.html` after successful login
3. Portal checks authentication status
4. If not logged in, redirects to `login.html?next=portal.html`
5. Loads client data from `public.client` table
6. Loads bookings from `public.booking` table

## Database Requirements

### Tables Used

**`public.client`:**
- id (UUID, matches auth.users.id)
- email
- first_name
- last_name
- mobile
- date_of_birth
- address
- learner_permit_number
- emergency_contact_name
- emergency_contact_phone
- medical_conditions
- is_anxious_nervous
- is_beginner
- is_senior
- learning_needs_other
- notes
- created_at
- updated_at

**`public.booking`:**
- id (UUID)
- client_id (FK to client)
- google_event_id
- service_code
- price_cents
- start_time
- end_time
- status (confirmed, cancelled, completed, no_show)
- pickup_location
- google_html_link
- created_at
- updated_at
- cancelled_at

## Design Guidelines Followed

### Layout
✅ Responsive sidebar navigation (collapses on mobile)
✅ Sticky sidebar on desktop
✅ Clean card-based design
✅ Consistent spacing and padding

### Forms
✅ Clear labels with required field indicators
✅ Helpful placeholder text
✅ Input validation
✅ Success/error feedback
✅ Grouped related fields
✅ Logical tab order

### Colors & Typography
✅ Consistent with site theme
✅ Blue primary color (#3b82f6)
✅ Clear visual hierarchy
✅ Readable font sizes
✅ Proper contrast ratios

### User Experience
✅ Loading states
✅ Empty states with helpful messages
✅ Confirmation dialogs for destructive actions
✅ Clear action buttons
✅ Responsive on all devices
✅ Keyboard navigation support

## Usage

### For Users

1. **Access Portal:**
   - Log in at `login.html`
   - Automatically redirected to portal

2. **Update Details:**
   - Click "My Details" in sidebar
   - Fill in/update information
   - Click "Save Changes"
   - See success confirmation

3. **View Bookings:**
   - Click "My Bookings" in sidebar
   - Switch between "Upcoming" and "Past" tabs
   - View booking details
   - Cancel if needed (upcoming only)

4. **Log Out:**
   - Click "Log Out" in sidebar
   - Confirm logout
   - Redirected to home page

### For Developers

**Add New Section:**

1. Create partial file: `partials/portal-newsection.html`
2. Add navigation item in `portal.html`:
```html
<a href="#newsection" onclick="showSection('newsection')" id="nav-newsection"
   class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg...">
  <svg>...</svg>
  <span class="font-medium">New Section</span>
</a>
```

3. Add content container:
```html
<div id="section-newsection" class="section-content hidden">
  <div data-include="partials/portal-newsection.html"></div>
</div>
```

**Access Client Data:**
```javascript
// Wait for data to load
window.addEventListener('clientDataLoaded', function(e) {
  const clientData = e.detail;
  // Use clientData...
});

// Or access directly
if (window.clientData) {
  // Use window.clientData...
}
```

**Make Database Queries:**
```javascript
// Query bookings
const { data, error } = await window.supabaseClient
  .from('booking')
  .select('*')
  .eq('client_id', window.currentUser.id);

// Update client
const { error } = await window.supabaseClient
  .from('client')
  .update({ first_name: 'John' })
  .eq('id', window.currentUser.id);
```

## Security

✅ Authentication required to access portal
✅ Row Level Security (RLS) on Supabase tables
✅ Users can only access their own data
✅ Secure logout with session clearing
✅ HTTPS required in production

## Future Enhancements

Consider adding:
- [ ] Profile photo upload
- [ ] Change password functionality
- [ ] Email preferences
- [ ] Notification settings
- [ ] Payment history
- [ ] Package/credit balance display
- [ ] Booking reschedule functionality
- [ ] Direct messaging with instructor
- [ ] Progress tracking
- [ ] Certificate downloads

## Troubleshooting

### "Not authenticated" error
- User session expired
- Solution: Log in again

### Data not loading
- Check Supabase connection
- Check browser console for errors
- Verify RLS policies allow user access

### Can't save changes
- Check required fields are filled
- Verify Supabase permissions
- Check network connection

### Bookings not showing
- Verify bookings exist in database
- Check client_id matches auth user id
- Verify RLS policies
