-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : JMC vehicles only
-- Objectif  : Restreindre les types de véhicules aux modèles JMC.
--             Changer le préfixe d'identifiant de "FM-" à "AT-".
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Mettre à jour la fonction d'attribution d'identifiant ────────────
-- Préfixe "AT-" au lieu de "FM-" (AutoTrack au lieu de Faso Mebo).

CREATE OR REPLACE FUNCTION public.fn_next_vehicle_id(p_type_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INT;
BEGIN
  INSERT INTO public.vehicle_type_sequences (type_code, next_seq)
  VALUES (p_type_code, 2)
  ON CONFLICT (type_code) DO UPDATE
    SET next_seq = vehicle_type_sequences.next_seq + 1
  RETURNING next_seq - 1 INTO v_seq;

  RETURN 'AT-' || p_type_code || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;

-- ─── 2. Contrainte CHECK sur vehicle_category ────────────────────────────
-- Accepter les nouvelles catégories JMC + les anciennes pour compatibilité.

ALTER TABLE public.devices
  DROP CONSTRAINT IF EXISTS chk_vehicle_category;

ALTER TABLE public.devices
  ADD CONSTRAINT chk_vehicle_category
  CHECK (vehicle_category IS NULL OR vehicle_category IN (
    'pickup', 'suv', 'utilitaire',
    'terrassement', 'transport', 'levage'
  ));
