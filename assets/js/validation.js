/**
 * Shared validation helpers for Auto-Man Driving School
 * Used across contact forms, portal, and admin pages
 */

(function() {
  // Normalise value to digits only
  function digitsOnly(v) {
    return (v || '').replace(/\D+/g, '');
  }

  // Check if mobile has allowed characters only
  function isAllowedMobileChars(raw) {
    if (!raw) return false;
    const str = raw.toString();

    // If + exists and is not at position 0, reject
    const plusIndex = str.indexOf('+');
    if (plusIndex > 0) return false;

    // Allow only: digits, spaces, brackets, and + at start
    return /^[0-9()+\s]*$/.test(str);
  }
  
  // Normalise mobile to canonical storage format (0404096768 or +61404096768)
  // Returns {ok: boolean, value: string}
  function normaliseMobileForStorage(raw) {
    if (!raw) return { ok: false, value: '' };
    const trimmed = raw.trim();
    
    if (trimmed.startsWith('+')) {
      // International format: must be +61
      const digitsAfterPlus = digitsOnly(trimmed.substring(1));
      
      // Must be 11 digits starting with 614
      if (digitsAfterPlus.length === 11 && digitsAfterPlus.startsWith('614')) {
        return { ok: true, value: '+' + digitsAfterPlus };
      }
      return { ok: false, value: '' };
    } else {
      // Local format: must be 10 digits starting with 04
      const digits = digitsOnly(trimmed);
      if (digits.length === 10 && digits.startsWith('04')) {
        return { ok: true, value: digits };
      }
      return { ok: false, value: '' };
    }
  }
  
  // Alias for consistency with naming convention
  const normaliseAuMobileForStorage = normaliseMobileForStorage;
  const formatAuMobileForDisplay = formatAuMobileDisplay;

  // Validate Australian mobile number (supports 0404... and +61404...)
  function isValidAuMobile(raw) {
    if (!raw) return false;
    if (!isAllowedMobileChars(raw)) return false;
    
    const result = normaliseMobileForStorage(raw);
    return result.ok;
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
      
      // Remove any characters that aren't digits, spaces, +, or parentheses (no hyphens)
      val = val.replace(/[^\d\s+()]/g, '');
      
      // Only allow + at the start
      const hasPlus = val.startsWith('+');
      val = val.replace(/\+/g, '');
      if (hasPlus) val = '+' + val;
      
      // Remove trailing brackets only (keep spaces for typing)
      val = val.replace(/[()]+$/, '');
      
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

  // Format AU mobile for display (0404 096 768 or +61 404 096 768)
  function formatAuMobileDisplay(stored) {
    if (!stored) return '';
    
    // Handle {ok, value} object from normaliseAuMobileForStorage
    if (typeof stored === 'object' && stored.value !== undefined) {
      stored = stored.value;
    }
    
    // Ensure stored is a string
    const str = String(stored);
    
    // Handle +61 format
    if (str.startsWith('+61')) {
      const digitsAfter61 = str.substring(3);
      if (digitsAfter61.length === 9) {
        return `+61 ${digitsAfter61.slice(0,3)} ${digitsAfter61.slice(3,6)} ${digitsAfter61.slice(6,9)}`;
      }
      return str;
    }
    
    // Handle local 04 format
    const clean = digitsOnly(str);
    if (clean.length === 10 && clean.startsWith('04')) {
      return `${clean.slice(0,4)} ${clean.slice(4,7)} ${clean.slice(7,10)}`;
    }
    
    return str;
  }

  // Format AU phone (mobile or landline) for display
  function formatAuPhoneDisplay(stored) {
    if (!stored) return '';
    
    // Handle {ok, value} object from normaliseAuMobileForStorage
    if (typeof stored === 'object' && stored.value !== undefined) {
      stored = stored.value;
    }
    
    // Ensure stored is a string
    const str = String(stored);
    
    // If it's a mobile, use mobile formatter
    if (str.startsWith('+61') || (str.startsWith('04') && digitsOnly(str).length === 10)) {
      return formatAuMobileDisplay(str);
    }
    
    const digits = digitsOnly(str);
    
    // 10-digit landline: (0X) XXXX XXXX
    if (digits.length === 10 && /^0[2378]/.test(digits)) {
      return `(${digits.slice(0,2)}) ${digits.slice(2,6)} ${digits.slice(6,10)}`;
    }
    
    // 8-digit local landline: XXXX XXXX
    if (digits.length === 8) {
      return `${digits.slice(0,4)} ${digits.slice(4,8)}`;
    }
    
    return stored;
  }

  // Normalise phone (mobile or landline) for storage
  function normalisePhoneForStorage(raw) {
    if (!raw) return '';
    const trimmed = raw.trim();
    
    // Check allowed characters
    const str = trimmed.toString();
    const plusIndex = str.indexOf('+');
    if (plusIndex > 0) return '';
    if (!/^[0-9()+\s-]*$/.test(str)) return '';
    
    // Try mobile first
    const mobileResult = normaliseMobileForStorage(trimmed);
    if (mobileResult.ok) return mobileResult.value;
    
    // Try landline
    const digits = digitsOnly(trimmed);
    
    // 10-digit landline starting with 02/03/07/08
    if (digits.length === 10 && /^0[2378]/.test(digits)) {
      return digits;
    }
    
    // 8-digit local landline
    if (digits.length === 8) {
      return digits;
    }
    
    return '';
  }

  // Maps backend issue codes to human-friendly messages for the client portal
  const PICKUP_LOCATION_ISSUE_MESSAGES = {
    partial_match:
      'We found a similar address but it is not an exact match. Please check the street number and suburb.',
    street_number_mismatch:
      'The street number looks different to what Google Maps found. Please check the number.',
    street_mismatch:
      'We could not match this street or suffix (road, drive, etc). Please check the spelling of the street name or suffix.',
    suburb_mismatch:
      'We matched the street, but the suburb looks different. Please check the suburb.',
    google_no_result:
      'We could not find this address in Google Maps. Please check the number, street and suburb.',
    google_error:
      'Google address validation is currently unavailable. Please manually check the address before continuing.',
    network_error:
      'Google address validation is currently unavailable. Please manually check the address before continuing.',
    no_api_key:
      'Google address validation is currently unavailable. Please manually check the address before continuing.',
    invoke_error:
      'Google address validation is currently unavailable. Please manually check the address before continuing.',
    empty:
      'Pickup address is required.',
    too_short:
      'Please provide a valid address (minimum 5 characters).',
    not_enough_letters:
      'Please include a street name (letters) in the address.',
    test_data:
      'This looks like a test address. Please enter your real pickup address.',
    unknown:
      'Please provide a valid pickup address.',
  };
  
  // Get human-friendly message from backend issue code
  function getPickupLocationIssueMessage(issueCode) {
    if (!issueCode) return PICKUP_LOCATION_ISSUE_MESSAGES.unknown;
    return PICKUP_LOCATION_ISSUE_MESSAGES[issueCode] || PICKUP_LOCATION_ISSUE_MESSAGES.unknown;
  }

  // Check if value is blank or "none" (valid user choices)
  function isBlankOrNone(value) {
    if (!value) return true;
    const trimmed = value.trim().toLowerCase();
    return trimmed === '' || trimmed === 'none';
  }

  // Lightweight Australian address validation
  function isProbablyValidAuAddress(value) {
    if (isBlankOrNone(value)) return true;
    
    const trimmed = value.trim();
    if (trimmed.length < 8) return false;
    
    const hasDigit = /\d/.test(trimmed);
    const hasLetter = /[a-zA-Z]/.test(trimmed);
    
    if (!hasDigit || !hasLetter) return false;
    
    return true;
  }

  // Full address validation via Supabase Edge Function (async)
  async function validateAuAddressAsync(value) {
    if (isBlankOrNone(value)) {
      return { valid: true, skipped: true, meta: { mode: 'skipped', issue: 'none' } };
    }

    if (!window.supabaseClient || !window.supabaseClient.functions) {
      return {
        valid: isProbablyValidAuAddress(value),
        fallback: true,
        reason: 'Supabase client not available',
        meta: { mode: 'fallback', issue: 'regex_only' }
      };
    }

    try {
      const { data, error } = await window.supabaseClient.functions.invoke('validate-bookings', {
        body: {
          validate_address_only: true,
          address: value
        }
      });

      if (error) {
        return {
          valid: false,
          fallback: true,
          reason: error.message || 'Address validation failed',
          meta: { mode: 'error', issue: 'invoke_error' }
        };
      }

      if (data && data.validation_result) {
        const result = data.validation_result;
        const issue = (result && result.issue) ? String(result.issue) : 'none';
        const suggestion = result && result.suggestion ? String(result.suggestion) : undefined;

        // IMPORTANT:
        // VALID only when issue === 'none' (prevents fail-open regressions).
        // Always return Google's suggested address (if present) so the UI can show it
        // even when validation fails (partial_match, google_error, network_error, etc).
        const valid = result.isValid === true && issue === 'none';

        return {
          valid: valid,
          reason: issue !== 'none' ? issue : undefined,
          formatted: suggestion,
          raw: data,
          meta: { mode: 'google', issue: issue }
        };
      }

      return {
        valid: false,
        fallback: true,
        reason: 'No validation result from server',
        meta: { mode: 'error', issue: 'no_result' }
      };
    } catch (e) {
      return {
        valid: false,
        fallback: true,
        reason: e && e.message ? e.message : 'Address validation error',
        meta: { mode: 'error', issue: 'exception' }
      };
    }
  }

  // Detect when Google address validation is unavailable (warning-only scenarios).
  function isGoogleValidationUnavailable(meta) {
    const mode = meta && meta.mode ? String(meta.mode) : '';
    const issue = meta && meta.issue ? String(meta.issue) : '';
    if (mode !== 'error') return false;
    return ['invoke_error', 'google_error', 'no_api_key', 'network_error', 'exception', 'no_result'].includes(issue);
  }

  // Export to window for global access
  window.Validation = {
    digitsOnly: digitsOnly,
    isAllowedMobileChars: isAllowedMobileChars,
    normaliseMobileForStorage: normaliseMobileForStorage,
    normaliseAuMobileForStorage: normaliseAuMobileForStorage,
    normalisePhoneForStorage: normalisePhoneForStorage,
    isValidAuMobile: isValidAuMobile,
    isValidAuLandline: isValidAuLandline,
    isValidAuPhone: isValidAuPhone,
    isValidEmail: isValidEmail,
    sanitizePhoneInput: sanitizePhoneInput,
    formatAuMobileDisplay: formatAuMobileDisplay,
    formatAuMobileForDisplay: formatAuMobileForDisplay,
    formatAuPhoneDisplay: formatAuPhoneDisplay,
    isBlankOrNone: isBlankOrNone,
    isProbablyValidAuAddress: isProbablyValidAuAddress,
    validateAuAddressAsync: validateAuAddressAsync,
    isGoogleValidationUnavailable: isGoogleValidationUnavailable,
    getPickupLocationIssueMessage: getPickupLocationIssueMessage
  };
})();
