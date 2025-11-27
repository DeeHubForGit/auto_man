/**
 * Supabase Edge Function: validate-bookings
 * 
 * Validates mobile numbers and pickup locations for bookings.
 * Can be triggered manually, via cron, or by webhook.
 * 
 * Usage:
 *   POST /validate-bookings
 *   Body (optional): { "all": true } or { "since": "2024-01-01" }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Australian mobile number validation
function validateMobile(mobile: string | null): boolean | null {
  if (!mobile) return null;
  
  const cleaned = mobile.replace(/\s+/g, ''); // Remove spaces
  const australianMobileRegex = /^(\+61|0)[4-5]\d{8}$/;
  
  return australianMobileRegex.test(cleaned);
}

// Basic pickup location validation
function validatePickupLocation(location: string | null): boolean | null {
  if (!location) return null;
  
  const trimmed = location.trim();
  
  // Basic checks
  if (trimmed.length < 5) return false;
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return false; // At least 2 letters
  
  // Check for obvious test data
  const testPatterns = ['test', 'asdf', 'qwerty', '123', 'xxx', 'n/a', 'tbd', 'none'];
  const lowerLocation = trimmed.toLowerCase();
  if (testPatterns.some(pattern => lowerLocation === pattern || lowerLocation.includes(pattern + ' '))) {
    return false;
  }
  
  return true;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for options
    let validateAll = false;
    let sinceDate: string | null = null;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        validateAll = body.all === true;
        sinceDate = body.since || null;
      } catch {
        // No body or invalid JSON, use defaults
      }
    }

    console.log(`[validate-bookings] Starting validation. All: ${validateAll}, Since: ${sinceDate || 'today'}`);

    // Build query - only validate bookings that haven't been checked yet
    let query = supabase
      .from('booking')
      .select('id, mobile, pickup_location, start_time')
      .eq('is_booking', true) // Only actual bookings
      .is('validation_checked_at', null); // Only unchecked bookings

    if (!validateAll) {
      const cutoffDate = sinceDate || new Date().toISOString().split('T')[0];
      query = query.gte('start_time', cutoffDate);
    }

    const { data: bookings, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch bookings: ${fetchError.message}`);
    }

    if (!bookings || bookings.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No bookings found to validate',
          validated: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Validate each booking
    let validatedCount = 0;
    let mobileInvalidCount = 0;
    let locationInvalidCount = 0;
    const invalidMobiles: string[] = [];
    const invalidLocations: string[] = [];

    for (const booking of bookings) {
      const isMobileValid = validateMobile(booking.mobile);
      const isLocationValid = validatePickupLocation(booking.pickup_location);

      // Update booking with validation results
      const { error: updateError } = await supabase
        .from('booking')
        .update({
          is_mobile_valid: isMobileValid,
          is_pickup_location_valid: isLocationValid,
          validation_checked_at: new Date().toISOString(),
        })
        .eq('id', booking.id);

      if (updateError) {
        console.error(`[validate-bookings] Error updating booking ${booking.id}:`, updateError);
        continue;
      }

      validatedCount++;

      // Track invalid data for reporting
      if (isMobileValid === false) {
        mobileInvalidCount++;
        invalidMobiles.push(`${booking.id}: ${booking.mobile}`);
      }
      if (isLocationValid === false) {
        locationInvalidCount++;
        invalidLocations.push(`${booking.id}: ${booking.pickup_location}`);
      }

      console.log(
        `[validate-bookings] ${booking.id}: ` +
        `Mobile ${isMobileValid === null ? 'NULL' : isMobileValid ? 'VALID' : 'INVALID'}, ` +
        `Location ${isLocationValid === null ? 'NULL' : isLocationValid ? 'VALID' : 'INVALID'}`
      );
    }

    // Prepare response
    const response = {
      success: true,
      validated: validatedCount,
      total_bookings: bookings.length,
      mobile_invalid_count: mobileInvalidCount,
      location_invalid_count: locationInvalidCount,
      invalid_mobiles: invalidMobiles.slice(0, 10), // Limit to first 10
      invalid_locations: invalidLocations.slice(0, 10), // Limit to first 10
      timestamp: new Date().toISOString(),
    };

    console.log(`[validate-bookings] Complete. Validated ${validatedCount}/${bookings.length} bookings`);
    console.log(`[validate-bookings] Invalid mobiles: ${mobileInvalidCount}, Invalid locations: ${locationInvalidCount}`);

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[validate-bookings] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: (error as Error).message || 'Unknown error occurred' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
