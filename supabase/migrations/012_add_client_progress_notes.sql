-- Migration: Add instructor notes to client_progress

alter table public.client_progress
add column if not exists notes text;
