-- Ingest uploads bucket: large documents (PDF/DOCX/images) are uploaded here by
-- the browser via a server-minted signed upload URL, then the server downloads
-- them for OCR. This sidesteps the ~4.5MB serverless request-body limit on the
-- extract route.
--
-- The browser never touches this bucket with its own credentials — it uploads
-- through a signed URL issued by the server (service role), and the server reads
-- files back with the service role. Both paths bypass RLS, so no per-user
-- policies on storage.objects are required. The bucket is also created
-- idempotently at deploy time by scripts/create-ingest-bucket.mjs; this
-- migration keeps the definition in version control.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ingest-uploads',
  'ingest-uploads',
  false,
  20971520, -- 20 MB hard cap at the bucket level
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
