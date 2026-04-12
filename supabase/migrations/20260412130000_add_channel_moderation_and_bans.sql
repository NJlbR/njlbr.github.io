/*
  # Channel moderation and bans
*/

CREATE TABLE IF NOT EXISTS channel_banned_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  banned_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  reason text,
  banned_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE channel_banned_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_channel_moderator_or_creator(
  check_channel_id uuid,
  check_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM channels c
    WHERE c.id = check_channel_id
      AND c.created_by = check_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM channel_admins ca
    WHERE ca.channel_id = check_channel_id
      AND ca.user_id = check_user_id
      AND ca.can_post = true
  );
$$;

DROP POLICY IF EXISTS "Channel moderators can view bans" ON channel_banned_users;
CREATE POLICY "Channel moderators can view bans"
  ON channel_banned_users FOR SELECT
  TO authenticated
  USING (
    is_channel_moderator_or_creator(channel_id, auth.uid())
  );

DROP POLICY IF EXISTS "Channel moderators can manage bans" ON channel_banned_users;
CREATE POLICY "Channel moderators can manage bans"
  ON channel_banned_users FOR ALL
  TO authenticated
  USING (
    is_channel_moderator_or_creator(channel_id, auth.uid())
  )
  WITH CHECK (
    is_channel_moderator_or_creator(channel_id, auth.uid())
  );

CREATE OR REPLACE FUNCTION list_channel_subscribers(
  channel_id_param uuid,
  viewer_id uuid
)
RETURNS TABLE (
  user_id uuid,
  subscribed_at timestamptz,
  username text,
  is_admin boolean,
  is_moderator boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH can_manage AS (
    SELECT is_channel_moderator_or_creator(channel_id_param, viewer_id) AS allowed
  )
  SELECT
    cs.user_id,
    cs.subscribed_at,
    up.username,
    up.is_admin,
    EXISTS (
      SELECT 1
      FROM channel_admins ca
      WHERE ca.channel_id = channel_id_param
        AND ca.user_id = cs.user_id
        AND ca.can_post = true
    ) AS is_moderator
  FROM channel_subscribers cs
  JOIN user_profiles up ON up.id = cs.user_id
  JOIN can_manage cm ON cm.allowed
  WHERE cs.channel_id = channel_id_param
  ORDER BY cs.subscribed_at ASC;
$$;

CREATE OR REPLACE FUNCTION list_channel_banned_users(
  channel_id_param uuid,
  viewer_id uuid
)
RETURNS TABLE (
  user_id uuid,
  banned_at timestamptz,
  reason text,
  username text,
  banned_by_username text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH can_manage AS (
    SELECT is_channel_moderator_or_creator(channel_id_param, viewer_id) AS allowed
  )
  SELECT
    cb.user_id,
    cb.banned_at,
    cb.reason,
    up.username,
    ub.username AS banned_by_username
  FROM channel_banned_users cb
  JOIN user_profiles up ON up.id = cb.user_id
  LEFT JOIN user_profiles ub ON ub.id = cb.banned_by
  JOIN can_manage cm ON cm.allowed
  WHERE cb.channel_id = channel_id_param
  ORDER BY cb.banned_at DESC;
$$;

CREATE OR REPLACE FUNCTION promote_channel_moderator(
  target_channel_id uuid,
  target_user_id uuid,
  promoting_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_channel_moderator_or_creator(target_channel_id, promoting_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Недостаточно прав');
  END IF;

  IF EXISTS (
    SELECT 1 FROM channels
    WHERE id = target_channel_id
      AND created_by = target_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Создатель уже администратор');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM channel_subscribers
    WHERE channel_id = target_channel_id
      AND user_id = target_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Пользователь не подписан');
  END IF;

  INSERT INTO channel_admins (channel_id, user_id, can_post)
  VALUES (target_channel_id, target_user_id, true)
  ON CONFLICT (channel_id, user_id) DO UPDATE SET can_post = true;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION demote_channel_moderator(
  target_channel_id uuid,
  target_user_id uuid,
  demoting_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_channel_moderator_or_creator(target_channel_id, demoting_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Недостаточно прав');
  END IF;

  IF EXISTS (
    SELECT 1 FROM channels
    WHERE id = target_channel_id
      AND created_by = target_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нельзя снять роль с создателя');
  END IF;

  DELETE FROM channel_admins
  WHERE channel_id = target_channel_id
    AND user_id = target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION ban_channel_subscriber(
  target_channel_id uuid,
  target_user_id uuid,
  banning_user_id uuid,
  ban_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_channel_moderator_or_creator(target_channel_id, banning_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Недостаточно прав');
  END IF;

  IF EXISTS (
    SELECT 1 FROM channels
    WHERE id = target_channel_id
      AND created_by = target_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Нельзя забанить создателя');
  END IF;

  DELETE FROM channel_subscribers
  WHERE channel_id = target_channel_id
    AND user_id = target_user_id;

  DELETE FROM channel_admins
  WHERE channel_id = target_channel_id
    AND user_id = target_user_id;

  INSERT INTO channel_banned_users (channel_id, user_id, banned_by, reason)
  VALUES (target_channel_id, target_user_id, banning_user_id, ban_reason)
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION unban_channel_subscriber(
  target_channel_id uuid,
  target_user_id uuid,
  unbanning_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_channel_moderator_or_creator(target_channel_id, unbanning_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Недостаточно прав');
  END IF;

  DELETE FROM channel_banned_users
  WHERE channel_id = target_channel_id
    AND user_id = target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION list_visible_channels(viewer_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  username text,
  name text,
  description text,
  avatar_url text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_private boolean,
  access_code text,
  subscriber_count bigint,
  is_subscribed boolean,
  is_owner boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    c.id,
    c.username,
    c.name,
    c.description,
    c.avatar_url,
    c.created_by,
    c.created_at,
    c.updated_at,
    COALESCE(c.is_private, false) AS is_private,
    c.access_code,
    (
      SELECT COUNT(*)
      FROM channel_subscribers cs_count
      WHERE cs_count.channel_id = c.id
    ) AS subscriber_count,
    CASE
      WHEN viewer_id IS NULL THEN false
      ELSE EXISTS (
        SELECT 1
        FROM channel_subscribers cs_member
        WHERE cs_member.channel_id = c.id
          AND cs_member.user_id = viewer_id
      )
    END AS is_subscribed,
    CASE
      WHEN viewer_id IS NULL THEN false
      ELSE c.created_by = viewer_id
    END AS is_owner
  FROM channels c
  WHERE (
      viewer_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM channel_banned_users cb
        WHERE cb.channel_id = c.id
          AND cb.user_id = viewer_id
      )
    )
    AND (
      COALESCE(c.is_private, false) = false
      OR (
        viewer_id IS NOT NULL
        AND (
          c.created_by = viewer_id
          OR EXISTS (
            SELECT 1
            FROM channel_subscribers cs_visible
            WHERE cs_visible.channel_id = c.id
              AND cs_visible.user_id = viewer_id
          )
        )
      )
    )
  ORDER BY c.updated_at DESC, c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_channel_preview(
  access_code_param text DEFAULT NULL,
  channel_id_param uuid DEFAULT NULL,
  viewer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  target_channel channels%ROWTYPE;
  viewer_is_subscribed boolean := false;
BEGIN
  IF access_code_param IS NULL AND channel_id_param IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Не передан код или идентификатор канала'
    );
  END IF;

  IF access_code_param IS NOT NULL THEN
    SELECT *
    INTO target_channel
    FROM channels
    WHERE access_code = access_code_param
    LIMIT 1;
  ELSE
    SELECT *
    INTO target_channel
    FROM channels
    WHERE id = channel_id_param
    LIMIT 1;
  END IF;

  IF target_channel.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Канал не найден'
    );
  END IF;

  IF viewer_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM channel_banned_users cb
      WHERE cb.channel_id = target_channel.id
        AND cb.user_id = viewer_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Вы заблокированы в этом канале'
      );
    END IF;
  END IF;

  IF viewer_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM channel_subscribers
      WHERE channel_id = target_channel.id
        AND user_id = viewer_id
    )
    INTO viewer_is_subscribed;
  END IF;

  IF COALESCE(target_channel.is_private, false) = true
     AND access_code_param IS NULL
     AND viewer_is_subscribed = false
     AND (viewer_id IS NULL OR target_channel.created_by != viewer_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Канал недоступен'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'channel', jsonb_build_object(
      'id', target_channel.id,
      'username', target_channel.username,
      'name', target_channel.name,
      'description', target_channel.description,
      'avatar_url', target_channel.avatar_url,
      'created_by', target_channel.created_by,
      'created_at', target_channel.created_at,
      'updated_at', target_channel.updated_at,
      'is_private', COALESCE(target_channel.is_private, false),
      'access_code', target_channel.access_code,
      'subscriber_count', (
        SELECT COUNT(*)
        FROM channel_subscribers cs_count
        WHERE cs_count.channel_id = target_channel.id
      ),
      'is_subscribed', viewer_is_subscribed
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION join_public_channel(target_channel_id uuid, joining_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_channel channels%ROWTYPE;
  already_subscribed boolean := false;
BEGIN
  SELECT *
  INTO target_channel
  FROM channels
  WHERE id = target_channel_id
  LIMIT 1;

  IF target_channel.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Канал не найден'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM channel_banned_users
    WHERE channel_id = target_channel_id
      AND user_id = joining_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Вы заблокированы в этом канале'
    );
  END IF;

  IF COALESCE(target_channel.is_private, false) = true THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Этот канал закрыт. Нужен код приглашения'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = joining_user_id
      AND approval_status = 'approved'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ваша учетная запись должна быть одобрена администратором'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM channel_subscribers
    WHERE channel_id = target_channel_id
      AND user_id = joining_user_id
  )
  INTO already_subscribed;

  IF already_subscribed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Вы уже подписаны на этот канал',
      'channel_id', target_channel_id
    );
  END IF;

  INSERT INTO channel_subscribers (channel_id, user_id)
  VALUES (target_channel_id, joining_user_id)
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  UPDATE channels
  SET updated_at = now()
  WHERE id = target_channel_id;

  RETURN jsonb_build_object(
    'success', true,
    'channel_id', target_channel_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION join_channel_by_code(code text, joining_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_channel_id uuid;
  already_subscribed boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = joining_user_id
      AND approval_status = 'approved'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ваша учетная запись должна быть одобрена администратором'
    );
  END IF;

  SELECT id INTO target_channel_id
  FROM channels
  WHERE access_code = code;

  IF target_channel_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Канал с таким кодом не найден'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM channel_banned_users
    WHERE channel_id = target_channel_id
      AND user_id = joining_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Вы заблокированы в этом канале'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM channel_subscribers
    WHERE channel_id = target_channel_id
      AND user_id = joining_user_id
  )
  INTO already_subscribed;

  IF already_subscribed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Вы уже подписаны на этот канал'
    );
  END IF;

  INSERT INTO channel_subscribers (channel_id, user_id)
  VALUES (target_channel_id, joining_user_id)
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  UPDATE channels
  SET updated_at = now()
  WHERE id = target_channel_id;

  RETURN jsonb_build_object(
    'success', true,
    'channel_id', target_channel_id
  );
END;
$$;

DROP POLICY IF EXISTS "Anyone can view channel posts" ON channel_posts;
CREATE POLICY "Subscribers and channel staff can view channel posts"
  ON channel_posts FOR SELECT
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1
      FROM channel_banned_users cb
      WHERE cb.channel_id = channel_posts.channel_id
        AND cb.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM channels c
        WHERE c.id = channel_posts.channel_id
          AND c.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM channel_subscribers cs
        WHERE cs.channel_id = channel_posts.channel_id
          AND cs.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM channel_admins ca
        WHERE ca.channel_id = channel_posts.channel_id
          AND ca.user_id = auth.uid()
      )
    )
  );

GRANT EXECUTE ON FUNCTION is_channel_moderator_or_creator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION list_channel_subscribers(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION list_channel_banned_users(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION promote_channel_moderator(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION demote_channel_moderator(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ban_channel_subscriber(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION unban_channel_subscriber(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION list_visible_channels(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_channel_preview(text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION join_public_channel(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION join_channel_by_code(text, uuid) TO authenticated;
