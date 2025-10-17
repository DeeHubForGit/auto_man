-- Migration: Auto-create client record when user signs up
-- This trigger automatically creates a client record in the public.client table
-- whenever a new user is created in auth.users

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a new client record with the user's email
  INSERT INTO public.client (id, email, created_at, updated_at)
  VALUES (
    NEW.id,  -- Use the same UUID as auth.users for easy linking
    NEW.email,
    NOW(),
    NOW()
  )
  ON CONFLICT (email) DO NOTHING;  -- Skip if email already exists
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.client TO postgres, anon, authenticated, service_role;

-- Add comment for documentation
COMMENT ON FUNCTION public.handle_new_user() IS 
  'Automatically creates a client record when a new user signs up via Supabase Auth';
