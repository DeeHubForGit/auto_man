# Modal Dialog Usage Guide

The site now uses a professional, reusable modal dialog system instead of browser alerts.

## Features

- ✅ Professional design matching your site's theme
- ✅ No "localhost" or domain name in messages
- ✅ Animated transitions
- ✅ Keyboard support (ESC to close)
- ✅ Backdrop click to close
- ✅ Different types with appropriate icons and colors
- ✅ Confirm dialogs with callbacks

## Usage

### Basic Methods

```javascript
// Success message
Modal.success('Your account has been created!');
Modal.success('Operation completed', 'Custom Title');

// Error message
Modal.error('Something went wrong');
Modal.error('Invalid credentials', 'Login Failed');

// Warning message
Modal.warning('This action cannot be undone');

// Info message
Modal.info('Please check your email for confirmation');

// Confirmation dialog
Modal.confirm(
  'Are you sure you want to delete this?',
  function() {
    // User clicked Confirm
    console.log('Confirmed');
  },
  function() {
    // User clicked Cancel
    console.log('Cancelled');
  },
  'Delete Item' // Optional title
);
```

### Advanced Usage

```javascript
// Full control with options
Modal.show({
  title: 'Custom Title',
  message: 'Your custom message here',
  type: 'success', // 'success', 'error', 'warning', 'info', 'confirm'
  confirmText: 'OK',
  cancelText: 'Cancel',
  onConfirm: function() {
    // Handle confirm
  },
  onCancel: function() {
    // Handle cancel
  }
});
```

## Modal Types

| Type | Icon | Color | Use Case |
|------|------|-------|----------|
| `success` | ✓ | Green | Successful operations |
| `error` | ✕ | Red | Errors and failures |
| `warning` | ⚠ | Yellow | Warnings and cautions |
| `info` | ℹ | Blue | Information messages |
| `confirm` | ? | Blue | Confirmation dialogs |

## Integration

The modal is already integrated into:
- ✅ Sign up page
- ✅ Login page
- ✅ Auth system (auth.js)

To use in other pages, simply include the script:
```html
<script src="assets/js/modal.js"></script>
```

## Examples in the Site

### Sign Up Success
```javascript
Modal.success('Please check your email to confirm your account.', 'Account Created');
```

### Login Error
```javascript
Modal.error('Invalid email or password', 'Login Error');
```

### Auth Not Configured
```javascript
Modal.error('Authentication is not configured. Please contact support.');
```

## Styling

The modal automatically adapts to your site's dark theme and uses Tailwind CSS classes for consistent styling.
