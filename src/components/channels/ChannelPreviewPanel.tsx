import { Lock, LogIn, Users, Globe, ArrowRight, Rss } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ChannelPreview {
  id: string;
  username: string | null;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_private: boolean;
  access_code: string | null;
  subscriber_count: number;
  is_subscribed: boolean;
}

interface ChannelPreviewPanelProps {
  inviteCode?: string | null;
  channelId?: string | null;
  onNavigateAuth: () => void;
  onJoinSuccess: () => void;
}

export function ChannelPreviewPanel({
  inviteCode = null,
  channelId = null,
  onNavigateAuth,
  onJoinSuccess,
}: ChannelPreviewPanelProps) {
  const { user, profile } = useAuth();
  const [channel, setChannel] = useState<ChannelPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchPreview();
  }, [inviteCode, channelId, user?.id]);

  async function fetchPreview() {
    if (!inviteCode && !channelId) {
      setChannel(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: previewError } = await supabase.rpc('get_channel_preview' as any, {
      access_code_param: inviteCode,
      channel_id_param: channelId,
      viewer_id: user?.id ?? null,
    });

    if (previewError) {
      setError(previewError.message);
      setChannel(null);
      setLoading(false);
      return;
    }

    const result = data as { success: boolean; error?: string; channel?: ChannelPreview };

    if (!result?.success || !result.channel) {
      setError(result?.error || 'Канал не найден');
      setChannel(null);
      setLoading(false);
      return;
    }

    setChannel(result.channel);
    setLoading(false);
  }

  async function handleJoin() {
    if (!channel) return;

    if (!user) {
      onNavigateAuth();
      return;
    }

    if (!profile || profile.approval_status !== 'approved') {
      setError('Для подписки учетная запись должна быть одобрена');
      return;
    }

    setJoining(true);
    setError('');

    try {
      const { data, error: joinError } = channel.is_private
        ? await supabase.rpc('join_channel_by_code' as any, {
            code: channel.access_code,
            joining_user_id: user.id,
          })
        : await supabase.rpc('join_public_channel' as any, {
            target_channel_id: channel.id,
            joining_user_id: user.id,
          });

      if (joinError) throw joinError;

      const result = data as { success: boolean; channel_id?: string; error?: string };

      if (!result.success) {
        setError(result.error || 'Не удалось подписаться');
        setJoining(false);
        return;
      }

      onJoinSuccess();
    } catch (err: any) {
      setError(err.message || 'Не удалось подписаться');
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
        Загрузка канала...
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center text-gray-500 dark:text-gray-400">
        {error || 'Канал не найден'}
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white mb-4">
            <Rss size={36} />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 mb-4">
            {channel.is_private ? <Lock size={16} /> : <Globe size={16} />}
            {channel.is_private ? 'Закрытый канал' : 'Открытый канал'}
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {channel.name}
          </h2>
          {channel.username && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              @{channel.username}
            </p>
          )}
          {channel.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {channel.description}
            </p>
          )}

          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {channel.subscriber_count} подписчиков
          </p>

          {channel.is_private && channel.access_code && (
            <div className="w-full rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 p-4 mb-6 text-left">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Код приглашения
              </p>
              <code className="block font-mono text-sm text-gray-900 dark:text-white break-all">
                {channel.access_code}
              </code>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Канал можно открыть по ссылке или подписаться по коду.
              </p>
            </div>
          )}

          {error && (
            <div className="w-full p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {channel.is_subscribed ? (
            <button
              type="button"
              onClick={onJoinSuccess}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
            >
              Открыть канал
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors font-medium"
            >
              {!user ? <LogIn size={18} /> : <Users size={18} />}
              {!user ? 'Войти и подписаться' : joining ? 'Подписка...' : 'Подписаться'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
