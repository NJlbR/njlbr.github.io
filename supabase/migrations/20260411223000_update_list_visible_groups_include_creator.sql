/*
  # Include group creators in list_visible_groups
*/

CREATE OR REPLACE FUNCTION list_visible_groups(viewer_id uuid DEFAULT NULL)
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
    CASE
      WHEN viewer_id IS NULL THEN false
      ELSE (
        EXISTS (
          SELECT 1
          FROM group_members gm_member
          WHERE gm_member.group_id = g.id
            AND gm_member.user_id = viewer_id
        )
        OR g.created_by = viewer_id
      )
    END AS is_member
  FROM groups g
  WHERE COALESCE(g.is_public, false) = true
     OR (
       viewer_id IS NOT NULL
       AND (
         EXISTS (
           SELECT 1
           FROM group_members gm_visible
           WHERE gm_visible.group_id = g.id
             AND gm_visible.user_id = viewer_id
         )
         OR g.created_by = viewer_id
       )
     )
  ORDER BY g.updated_at DESC, g.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION list_visible_groups(uuid) TO anon, authenticated;
