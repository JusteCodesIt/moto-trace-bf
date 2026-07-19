ALTER TABLE public.devices ALTER COLUMN name SET DEFAULT 'AutoTrack';
UPDATE public.devices SET name = 'AutoTrack' WHERE name = 'MotoTrack';