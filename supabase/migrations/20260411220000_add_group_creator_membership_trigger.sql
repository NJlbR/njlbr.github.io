/*
  # Ensure group creators are members
  - Backfill missing creator memberships
  - Add trigger to auto-insert creator into group_members
*/

-- Backfill: add creator as admin member if missing
INSERT INTO group_members (group_id, user_id, is_admin, is_moderator)
SELECT g.id, g.created_by, true, false
FROM groups g
WHERE g.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = g.id
      AND gm.user_id = g.created_by
  );

CREATE OR REPLACE FUNCTION ensure_group_creator_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO group_members (group_id, user_id, is_admin, is_moderator)
  VALUES (NEW.id, NEW.created_by, true, false)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_group_creator_membership ON groups;
CREATE TRIGGER trg_ensure_group_creator_membership
AFTER INSERT ON groups
FOR EACH ROW
EXECUTE FUNCTION ensure_group_creator_membership();

GRANT EXECUTE ON FUNCTION ensure_group_creator_membership() TO authenticated;
