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
function validateMobile(mobile: string | null): boolean {
  if (!mobile || mobile.trim() === '') return false; // Required field
  
  const cleaned = mobile.replace(/\s+/g, ''); // Remove spaces
  const australianMobileRegex = /^(\+61|0)[4-5]\d{8}$/;
  
  return australianMobileRegex.test(cleaned);
}

// Extract the leading street number from the input, e.g. "23 West Street" -> "23"
function getStreetNumberFromInput(address: string): string | null {
  const match = address.trim().match(/^(\d+)\s+/);
  return match ? match[1] : null;
}

// Extract the suburb (part after the last comma), e.g. "23 West Street, Grovedale" -> "Grovedale"
function getSuburbFromInput(address: string): string | null {
  const parts = address.split(',');
  if (parts.length < 2) return null;
  const suburb = parts[parts.length - 1].trim();
  return suburb || null;
}

// Google Maps Address Validation
async function validateAddressWithGoogle(address: string): Promise<boolean> {
  // Use backend-only key from Supabase secrets
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');

  if (!apiKey) {
    console.warn('[validate-bookings] No Google Maps API key found. Skipping Google validation.');
    return true; // Fallback to true if no key (do not block users)
  }

  const url =
    'https://maps.googleapis.com/maps/api/geocode/json' +
    `?address=${encodeURIComponent(address)}` +
    `&key=${apiKey}` +
    '&components=country:AU';

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      if (data.status === 'ZERO_RESULTS') {
        return false; // Definitely not found
      }
      console.warn('[validate-bookings] Google API Error:', data.status, data.error_message);
      return true; // Fail open on weird API errors
    }

    const result: any = data.results[0];

    // 1) If Google only has a partial match, treat as invalid
    if (result.partial_match) {
      console.warn(
        '[validate-bookings] Partial match from Google for address:',
        address,
        '→',
        result.formatted_address,
      );
      return false;
    }

    const components: any[] = Array.isArray(result.address_components)
      ? result.address_components
      : [];

    // 2) Compare street numbers. If Google "fixes" the house number, treat as invalid.
    const inputStreetNumber = getStreetNumberFromInput(address);
    if (inputStreetNumber && components.length > 0) {
      const streetNumberComponent = components.find(
        (c) => Array.isArray(c.types) && c.types.includes('street_number'),
      );
      const googleStreetNumber = streetNumberComponent?.long_name as string | undefined;

      if (googleStreetNumber && googleStreetNumber !== inputStreetNumber) {
        console.warn(
          '[validate-bookings] Street number mismatch:',
          'input =',
          inputStreetNumber,
          'google =',
          googleStreetNumber,
          'formatted =',
          result.formatted_address,
        );
        return false;
      }
    }

    // 3) Compare suburb/locality. If Google moves it to another suburb, treat as invalid.
    const inputSuburb = getSuburbFromInput(address);
    if (inputSuburb && components.length > 0) {
      const localityComponent = components.find(
        (c) =>
          Array.isArray(c.types) &&
          (c.types.includes('locality') ||
            c.types.includes('sublocality') ||
            c.types.includes('postal_town')),
      );
      const googleSuburb = localityComponent?.long_name as string | undefined;

      if (googleSuburb) {
        const inputLower = inputSuburb.toLowerCase();
        const googleLower = googleSuburb.toLowerCase();

        if (!googleLower.includes(inputLower) && !inputLower.includes(googleLower)) {
          console.warn(
            '[validate-bookings] Suburb mismatch:',
            'input =',
            inputSuburb,
            'google =',
            googleSuburb,
            'formatted =',
            result.formatted_address,
          );
          return false;
        }
      }
    }

    // 4) Compare street name (route). If Google gives a different street, treat as invalid.
    const inputStreetLine = address.split(',')[0].trim(); // "23 West Street"
    const inputStreetName = inputStreetLine.replace(/^\d+\s+/, '').toLowerCase(); // "west street"

    if (inputStreetName) {
      const routeComponent = components.find(
        (c) => Array.isArray(c.types) && c.types.includes('route'),
      );
      const googleRoute = routeComponent?.long_name?.toLowerCase();

      if (googleRoute) {
        const inputFirstWord = inputStreetName.split(/\s+/)[0]; // "west"
        if (inputFirstWord && !googleRoute.includes(inputFirstWord)) {
          console.warn(
            '[validate-bookings] Street name mismatch:',
            'input =',
            inputStreetName,
            'google =',
            googleRoute,
            'formatted =',
            result.formatted_address,
          );
          return false;
        }
      }
    }

    // Passed all checks → treat as valid
    return true;
  } catch (err) {
    console.error('[validate-bookings] Network error calling Google Maps:', err);
    return true; // Fail open on network issues
  }
}

// Basic pickup location validation + Google Check
async function validatePickupLocation(location: string | null): Promise<boolean> {
  if (!location || location.trim() === '') return false; // Required field
  
  const trimmed = location.trim();
  
  // Basic checks first (save API calls)
  if (trimmed.length < 5) return false;
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return false; // At least 2 letters
  
  // Check for obvious test data (exact matches only)
  const testPatterns = [/^test$/i, /^asdf/i, /^qwerty/i, /^xxx/i, /^temp$/i, /^sample$/i, /^n\/?a$/i, /^tbd$/i, /^none$/i];
  if (testPatterns.some(pattern => pattern.test(trimmed))) {
    return false;
  }
  
  // Perform deep validation with Google Maps
  return await validateAddressWithGoogle(trimmed);
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
      // Await the async location validation
      const isLocationValid = await validatePickupLocation(booking.pickup_location);

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
        `Mobile ${isMobileValid ? 'VALID' : 'INVALID'}, ` +
        `Location ${isLocationValid ? 'VALID' : 'INVALID'}`
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
