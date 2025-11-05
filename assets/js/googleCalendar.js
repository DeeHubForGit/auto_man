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
    console.log('[GoogleCalendar] Cancelling event:', { googleEventId, bookingId });

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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[GoogleCalendar] ✅ Event cancelled successfully:', result);
      return { success: true };

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
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function cancelBooking(bookingId, googleEventId) {
    console.log('[GoogleCalendar] Starting booking cancellation:', { bookingId, googleEventId });

    try {
      // Step 1: Cancel in Google Calendar first (if event ID exists)
      if (googleEventId) {
        const googleResult = await cancelEvent(googleEventId, bookingId);
        if (!googleResult.success) {
          // Google cancellation failed - ABORT the entire operation
          console.error('[GoogleCalendar] ❌ Google Calendar cancellation failed, aborting database update');
          return { 
            success: false, 
            error: 'Failed to cancel in Google Calendar: ' + googleResult.error + '. Database not updated.'
          };
        }
        console.log('[GoogleCalendar] ✅ Google Calendar event cancelled successfully');
      } else {
        console.warn('[GoogleCalendar] No Google event ID - will update database only');
      }

      // Step 2: Update booking status in our database (only if Google succeeded or no Google event)
      if (!window.supabaseClient) {
        throw new Error('Supabase client not available');
      }

      const { error: dbError } = await window.supabaseClient
        .from('booking')
        .update({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (dbError) {
        throw new Error('Database update failed: ' + dbError.message);
      }

      console.log('[GoogleCalendar] ✅ Booking cancelled successfully in database');
      return { success: true };

    } catch (error) {
      console.error('[GoogleCalendar] ❌ Error cancelling booking:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to cancel booking'
      };
    }
  }

  // Public API
  return {
    cancelEvent,
    cancelBooking
  };
})();
