-- Keep the ownership check semantics unchanged while evaluating auth.uid()
-- once per statement, as recommended for Supabase RLS policies.
DROP POLICY IF EXISTS "Users can manage their own scans" ON public.scans;
CREATE POLICY "Users can manage their own scans"
  ON public.scans
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage their own ai notes" ON public.ai_notes;
CREATE POLICY "Users can manage their own ai notes"
  ON public.ai_notes
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Deletes from auth.users cascade through ai_notes by user_id, so index the
-- foreign key for predictable cleanup and user-scoped queries.
CREATE INDEX IF NOT EXISTS ai_notes_user_id_idx ON public.ai_notes (user_id);
