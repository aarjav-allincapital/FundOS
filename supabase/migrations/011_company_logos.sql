-- Company logos: small public WebP files in storage, URL on the company row.
-- Run this in Supabase SQL Editor BEFORE scripts/fetch-company-logos.mts

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN companies.logo_url IS
  'Public URL to a compressed logo (typically company-logos/{id}.webp in storage).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  262144, -- 256 KB cap per logo
  array['image/webp', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
  SET public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
