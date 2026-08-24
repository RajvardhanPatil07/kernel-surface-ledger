CREATE TABLE public.scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  host_label TEXT NOT NULL DEFAULT 'unnamed host',
  kernel_release TEXT NOT NULL,
  arch TEXT NOT NULL,
  distro TEXT NOT NULL,
  trace_backend TEXT,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  total_surface_weight NUMERIC NOT NULL,
  reachable_surface_weight NUMERIC NOT NULL,
  reachable_cve_count INTEGER NOT NULL,
  orphan_ratio NUMERIC NOT NULL,
  report JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scans TO authenticated;
GRANT ALL ON public.scans TO service_role;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own scans" ON public.scans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX scans_user_collected_idx ON public.scans (user_id, collected_at DESC);

CREATE TABLE public.ai_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  scan_id UUID REFERENCES public.scans ON DELETE CASCADE,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  prompt_kind TEXT NOT NULL,
  model TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_notes TO authenticated;
GRANT ALL ON public.ai_notes TO service_role;
ALTER TABLE public.ai_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own ai notes" ON public.ai_notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX ai_notes_scan_idx ON public.ai_notes (scan_id, created_at DESC);