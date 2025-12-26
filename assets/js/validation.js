/**
 * Shared validation helpers for Auto-Man Driving School
 * Used across contact forms, portal, and admin pages
 */

(function() {
  // Normalise value to digits only
  function digitsOnly(v) {
    return (v || '').replace(/\D+/g, '');
  }

  // Validate Australian mobile number
  function isValidAuMobile(v) {
    if (!v) return false;
    const cleaned = v.trim();
    const digits = digitsOnly(cleaned);
    
    // Must be exactly 10 digits starting with 04, or 11 digits starting with 614
    if (!/^(04\d{8}|614\d{8})$/.test(digits)) return false;
    
    // Ensure no invalid characters (only digits, spaces, +, -, parentheses)
    if (!/^[\d\s+\-()]+$/.test(cleaned)) return false;
    
    // If starts with +, must be +61
    if (cleaned.startsWith('+') && !cleaned.startsWith('+61')) return false;
    
    return true;
  }

  // Validate Australian landline number
  function isValidAuLandline(v) {
    if (!v) return false;
    const cleaned = v.trim();
    const digits = digitsOnly(cleaned);
    
    // Accept: 8-digit local, 10-digit national (0X), or 11-digit international (61X)
    if (!/^(\d{8}|0[2-9]\d{8}|61[2-9]\d{8})$/.test(digits)) return false;
    
    // Ensure no invalid characters (only digits, spaces, +, -, parentheses)
    if (!/^[\d\s+\-()]+$/.test(cleaned)) return false;
    
    // If starts with +, must be +61
    if (cleaned.startsWith('+') && !cleaned.startsWith('+61')) return false;
    
    return true;
  }

  // Accept either mobile or landline
  function isValidAuPhone(v) {
    if (!v) return true; // Optional field
    return isValidAuMobile(v) || isValidAuLandline(v);
  }

  // Basic email validation
  function isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  // Sanitize phone input (removes invalid characters, keeps valid formatting)
  function sanitizePhoneInput(input, errorId) {
    input.addEventListener('input', function() {
      let val = this.value;
      
      // Remove any characters that aren't digits, spaces, +, -, or parentheses
      val = val.replace(/[^\d\s+\-()]/g, '');
      
      // Only allow + at the start
      const hasPlus = val.startsWith('+');
      val = val.replace(/\+/g, '');
      if (hasPlus) val = '+' + val;
      
      // Remove trailing special characters
      val = val.replace(/[\s\-()]+$/, '');
      
      this.value = val;
      
      // Clear error if value becomes valid or empty
      if (!val || isValidAuPhone(val)) {
        const error = document.getElementById(errorId);
        if (error) {
          error.textContent = '';
          error.classList.add('hidden');
        }
        input.classList.remove('border-red-500');
      }
    });
  }

  // Export to window for global access
  window.Validation = {
    digitsOnly: digitsOnly,
    isValidAuMobile: isValidAuMobile,
    isValidAuLandline: isValidAuLandline,
    isValidAuPhone: isValidAuPhone,
    isValidEmail: isValidEmail,
    sanitizePhoneInput: sanitizePhoneInput
  };
})();
