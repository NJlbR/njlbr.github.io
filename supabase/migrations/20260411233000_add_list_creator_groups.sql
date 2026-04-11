/*
  # List groups created by a user (creator fallback)
*/

CREATE OR REPLACE FUNCTION list_creator_groups(creator_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  invite_code text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_public boolean,
  members_count bigint,
  is_member boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    g.id,
    g.name,
    g.invite_code,
    g.created_by,
    g.created_at,
    g.updated_at,
    COALESCE(g.is_public, false) AS is_public,
    (
      SELECT COUNT(*)
      FROM group_members gm_count
      WHERE gm_count.group_id = g.id
    ) AS members_count,
    true AS is_member
  FROM groups g
  WHERE g.created_by = creator_id
  ORDER BY g.updated_at DESC, g.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION list_creator_groups(uuid) TO authenticated;
