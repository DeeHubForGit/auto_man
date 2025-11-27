/**
 * Google Calendar Integration
 * Handles cancellation of appointments in Google Calendar
 */

window.GoogleCalendar = (function() {
  'use strict';

  /**
   * Cancel a booking in Google Calendar
   * @param {string} googleEventId - The Google Calendar event ID
   * @param {string} bookingId - The booking ID from our database
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function cancelEvent(googleEventId, bookingId) {
    console.log('[GoogleCalendar] Cancelling event:', googleEventId);

    if (!googleEventId) {
      console.warn('[GoogleCalendar] No Google event ID provided, skipping Google Calendar cancellation');
      return { success: true }; // Not an error - booking might not have been synced to Google yet
    }

    try {
      // Get Supabase URL and key from config
      const supabaseUrl = window.SITE_CONFIG?.SUPABASE_URL || window.SUPABASE_URL;
      const supabaseKey = window.SITE_CONFIG?.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        console.error('[GoogleCalendar] Config check:', {
          SITE_CONFIG: window.SITE_CONFIG,
          SUPABASE_URL: window.SUPABASE_URL,
          SUPABASE_ANON_KEY: window.SUPABASE_ANON_KEY
        });
        throw new Error('Supabase configuration not found');
      }

      // Call Supabase Edge Function to cancel the Google Calendar event
      const functionUrl = `${supabaseUrl}/functions/v1/cancel-google-event`;
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          eventId: googleEventId,
          bookingId: bookingId
        })
      });

      // Success (200) or Not Found/Gone (404/410) => treat as success
      // 404/410 means event is already deleted, which is our goal
      if (response.ok || response.status === 404 || response.status === 410) {
        console.log('[GoogleCalendar] ✅ Google Calendar event cancelled');
        return { success: true };
      }

      // Other errors - actually fail
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);

    } catch (error) {
      console.error('[GoogleCalendar] ❌ Error cancelling event:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to cancel Google Calendar event'
      };
    }
  }

  /**
   * Cancel a booking (updates database and Google Calendar)
   * @param {string} bookingId - The booking ID
   * @param {string} googleEventId - The Google Calendar event ID (optional)
   * @param {string} cancelledBy - Email of person who cancelled (optional)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function cancelBooking(bookingId, googleEventId, cancelledBy = null) {
    console.log('[GoogleCalendar] Starting cancellation for booking:', bookingId);

    try {
      // Step 1: Cancel in Google Calendar first (if event ID exists)
      if (googleEventId) {
        const googleResult = await cancelEvent(googleEventId, bookingId);
        if (!googleResult.success) {
          // Google cancellation failed - ABORT the entire operation
          console.error('[GoogleCalendar] ❌ Google Calendar cancellation failed, aborting');
          return { 
            success: false, 
            error: 'Failed to cancel in Google Calendar: ' + googleResult.error + '. Database not updated.'
          };
        }
      }

      // Step 2: Update booking status in our database (only if Google succeeded or no Google event)
      if (!window.supabaseClient) {
        throw new Error('Supabase client not available');
      }

      const updateData = { 
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      };
      
      // Add cancelled_by if provided
      if (cancelledBy) {
        updateData.cancelled_by = cancelledBy;
      }

      const { error: dbError } = await window.supabaseClient
        .from('booking')
        .update(updateData)
        .eq('id', bookingId);

      if (dbError) {
        throw new Error('Database update failed: ' + dbError.message);
      }

      console.log('[GoogleCalendar] ✅ Booking cancelled successfully');
      return { success: true };

    } catch (error) {
      console.error('[GoogleCalendar] ❌ Error cancelling booking:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to cancel booking'
      };
    }
  }

  /**
   * Unified cancellation handler with confirmation, loading state, and success message
   * @param {Object} options - Configuration options
   * @param {string} options.bookingId - The booking ID
   * @param {string} options.googleEventId - The Google Calendar event ID (optional)
   * @param {string} options.cancelledBy - Email of person who cancelled
   * @param {string} options.confirmMessage - Custom confirmation message (optional)
   * @param {Function} options.onSuccess - Callback after successful cancellation (optional)
   * @param {Function} options.onError - Callback after error (optional)
   * @param {Function} options.onCancel - Callback when user aborts cancellation (optional)
   * @param {HTMLElement} options.triggerElement - The element that triggered cancellation (for loading state)
   * @param {boolean} options.showSuccessMessage - Whether to show success modal (default: true)
   * @returns {Promise<void>}
   */
  async function cancelWithConfirmation(options) {
    const {
      bookingId,
      googleEventId,
      cancelledBy,
      confirmMessage = 'Are you sure you want to cancel this booking? This action cannot be undone.',
      onSuccess = null,
      onError = null,
      onCancel = null,
      triggerElement = null,
      showSuccessMessage = true
    } = options;

    // Show confirmation modal
    const confirmed = await new Promise((resolve) => {
      if (window.Modal && window.Modal.confirm) {
        window.Modal.confirm(
          confirmMessage,
          () => resolve(true),
          () => resolve(false),
          'Cancel Booking'
        );
      } else {
        resolve(confirm(confirmMessage));
      }
    });

    if (!confirmed) {
      console.log('[GoogleCalendar] Cancellation aborted by user');
      if (onCancel) {
        onCancel();
      }
      return;
    }

    // Show loading indicator
    let loadingModal = null;
    if (window.Modal && window.Modal.loading) {
      loadingModal = window.Modal.loading('Cancelling booking...', 'Please wait');
    }

    // Disable trigger element if provided
    let originalText = '';
    let originalDisabled = false;
    if (triggerElement) {
      originalDisabled = triggerElement.disabled;
      triggerElement.disabled = true;
      
      if (triggerElement.tagName === 'BUTTON') {
        originalText = triggerElement.textContent;
        triggerElement.textContent = 'Cancelling...';
      } else if (triggerElement.tagName === 'SELECT') {
        triggerElement.style.backgroundColor = '#fef3c7'; // yellow-100
      }
    }

    try {
      // Perform the cancellation
      const result = await cancelBooking(bookingId, googleEventId, cancelledBy);

      // Hide loading indicator
      if (loadingModal && loadingModal.close) {
        loadingModal.close();
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel booking');
      }

      // Call success callback BEFORE showing success message
      if (onSuccess) {
        await onSuccess();
      }

      // Show success message (if enabled)
      if (showSuccessMessage) {
        if (window.Modal && window.Modal.success) {
          window.Modal.success('The booking has been cancelled successfully.', 'Booking Cancelled');
        } else {
          alert('The booking has been cancelled successfully.');
        }
      }

    } catch (error) {
      console.error('[GoogleCalendar] Cancellation failed:', error);

      // Hide loading indicator
      if (loadingModal && loadingModal.close) {
        loadingModal.close();
      }

      // Show error message
      if (window.Modal && window.Modal.error) {
        window.Modal.error('Failed to cancel booking: ' + error.message, 'Cancellation Failed');
      } else {
        alert('Failed to cancel booking: ' + error.message);
      }

      // Call error callback
      if (onError) {
        onError(error);
      }

    } finally {
      // Restore trigger element
      if (triggerElement) {
        triggerElement.disabled = originalDisabled;
        
        if (triggerElement.tagName === 'BUTTON' && originalText) {
          triggerElement.textContent = originalText;
        } else if (triggerElement.tagName === 'SELECT') {
          triggerElement.style.backgroundColor = '';
        }
      }
    }
  }

  // Public API
  return {
    cancelEvent,
    cancelBooking,
    cancelWithConfirmation
  };
})();
