import { useEffect, useState } from 'react';
import { Plus, Search, Rss, Lock, Globe, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CreateChannelModal } from '../components/channels/CreateChannelModal';
import { ChannelPreviewPanel } from '../components/channels/ChannelPreviewPanel';
import { JoinChannelModal } from '../components/channels/JoinChannelModal';
import { ChannelChatWindow } from '../components/channels/ChannelChatWindow';
import { ChannelSettingsModal } from '../components/channels/ChannelSettingsModal';
import type { Database } from '../lib/database.types';

type Channel = Database['public']['Tables']['channels']['Row'];

interface ChannelsPageProps {
  onNavigateAuth: () => void;
  initialInviteCode?: string | null;
}

export function ChannelsPage({ onNavigateAuth, initialInviteCode = null }: ChannelsPageProps) {
  const { user, profile } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinByCode, setShowJoinByCode] = useState(false);
  const [showNameSearch, setShowNameSearch] = useState(false);
  const [publicSearchQuery, setPublicSearchQuery] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [previewChannelId, setPreviewChannelId] = useState<string | null>(null);
  const [previewInviteCode, setPreviewInviteCode] = useState<string | null>(initialInviteCode);
  const [showChannelInfo, setShowChannelInfo] = useState(false);
  const [joiningChannelId, setJoiningChannelId] = useState<string | null>(null);

  useEffect(() => {
    void fetchChannels();
  }, [user?.id]);

  useEffect(() => {
    setSelectedChannelId(null);
    setPreviewChannelId(null);
    setPreviewInviteCode(initialInviteCode ?? null);
  }, [initialInviteCode]);

  async function fetchChannels() {
    setLoading(true);

    try {
      const { data: channelsData, error } = await supabase.rpc('list_visible_channels' as any, {
        viewer_id: user?.id ?? null,
      });

      if (error || !channelsData) {
        setChannels([]);
        setLoading(false);
        return;
      }

      setChannels(channelsData as any);
    } catch (err) {
      console.error('Error in fetchChannels:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredChannels = channels.filter(channel =>
    (channel.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const myChannels = filteredChannels.filter(channel => channel.is_owner || channel.is_subscribed);
  const otherChannels = filteredChannels.filter(channel => !(channel.is_owner || channel.is_subscribed));
  const publicChannels = channels.filter(
    channel => !channel.is_owner && !channel.is_subscribed && !channel.is_private
  );
  const publicSearchResults = publicChannels.filter(channel =>
    channel.name.toLowerCase().includes(publicSearchQuery.toLowerCase()) ||
    (channel.username || '').toLowerCase().includes(publicSearchQuery.toLowerCase())
  );

  const canCreateChannel = !!user && profile?.approval_status === 'approved';

  function setInviteUrl(code: string | null) {
    const url = new URL(window.location.href);

    if (code) {
      url.searchParams.set('channel', code);
    } else {
      url.searchParams.delete('channel');
    }

    window.history.replaceState({}, '', url.toString());
  }

  function openPreview(params: { channelId?: string | null; inviteCode?: string | null }) {
    setSelectedChannelId(null);
    setPreviewChannelId(params.channelId ?? null);
    setPreviewInviteCode(params.inviteCode ?? null);
    setInviteUrl(params.inviteCode ?? null);
  }

  function openChat(channelId: string) {
    setSelectedChannelId(channelId);
    setPreviewChannelId(null);
    setPreviewInviteCode(null);
    setInviteUrl(null);
  }

  function clearPreview() {
    setSelectedChannelId(null);
    setPreviewChannelId(null);
    setPreviewInviteCode(null);
    setInviteUrl(null);
  }

  const formatTime = (timestamp?: string | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins}м назад`;
    if (diffHours < 24) return `${diffHours}ч назад`;
    if (diffDays === 1) return 'вчера';
    if (diffDays < 7) return `${diffDays}д назад`;

    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  async function handleJoinPublicChannel(channelId: string) {
    if (!user) {
      onNavigateAuth();
      return;
    }

    if (!profile || profile.approval_status !== 'approved') {
      alert('Для подписки учетная запись должна быть одобрена');
      return;
    }

    setJoiningChannelId(channelId);

    try {
      const { data, error } = await supabase.rpc('join_public_channel' as any, {
        target_channel_id: channelId,
        joining_user_id: user.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; channel_id?: string; error?: string };

      if (!result.success || !result.channel_id) {
        alert(result.error || 'Не удалось подписаться');
        setJoiningChannelId(null);
        return;
      }

      await fetchChannels();
      openChat(result.channel_id);
    } catch (err: any) {
      alert(err.message || 'Не удалось подписаться');
    } finally {
      setJoiningChannelId(null);
    }
  }

  return (
    <div className="h-[calc(100vh-73px)] flex bg-gray-50 dark:bg-gray-900">
      <div className="w-full md:w-96 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Каналы
            </h2>
            <div className="flex gap-2">
            <button
              onClick={() => {
                if (user) {
                  setShowJoinByCode(true);
                } else {
                  onNavigateAuth();
                }
              }}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              По коду
            </button>
            <button
              onClick={() => setShowNameSearch(true)}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              По названию/юзернейму
            </button>
            {canCreateChannel && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                  Создать канал
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по моим каналам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-lg bg-gray-100 dark:bg-gray-700">
                  <div className="w-12 h-12 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-2/3 mb-2"></div>
                    <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : myChannels.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm text-center p-4">
              {searchQuery ? 'Каналы не найдены' : 'Пока нет ваших каналов'}
            </div>
          ) : (
            <div className="space-y-4">
              {myChannels.length > 0 && (
                <div className="pt-4">
                  <div className="px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Мои каналы
                  </div>
                  {myChannels.map((channel) => {
                    const isSelected = channel.id === selectedChannelId;

                    return (
                      <div
                        key={channel.id}
                        className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                          isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => openChat(channel.id)}
                          className="flex items-start gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                            <Rss size={22} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-semibold text-gray-900 dark:text-white truncate">
                                {channel.name}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                {formatTime(channel.updated_at)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {channel.username ? `@${channel.username}` : 'Канал по коду'}
              </p>
                              <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                {channel.subscriber_count || 0} подписч.
                              </span>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedChannelId ? (
          <ChannelChatWindow
            channelId={selectedChannelId}
            onBack={clearPreview}
            onShowInfo={() => setShowChannelInfo(true)}
          />
        ) : previewInviteCode || previewChannelId ? (
          <ChannelPreviewPanel
            inviteCode={previewInviteCode}
            channelId={previewChannelId}
            onNavigateAuth={onNavigateAuth}
            onJoinSuccess={() => {
              fetchChannels();
              if (previewChannelId) {
                openChat(previewChannelId);
              } else {
                clearPreview();
              }
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <div className="text-6xl mb-4">📣</div>
              <p className="text-lg font-medium mb-2">Выберите канал</p>
              <p className="text-sm">или откройте канал из списка</p>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateChannelModal
          onClose={() => setShowCreateModal(false)}
          onChannelCreated={() => {
            setShowCreateModal(false);
            fetchChannels();
          }}
        />
      )}

      {showJoinByCode && (
        <JoinChannelModal
          onClose={() => setShowJoinByCode(false)}
          onChannelJoined={() => {
            setShowJoinByCode(false);
            fetchChannels();
          }}
        />
      )}

      {showNameSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold">
                <Globe size={18} />
                Открытые каналы
              </div>
              <button
                type="button"
                onClick={() => setShowNameSearch(false)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <div className="relative mb-4">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={publicSearchQuery}
                  onChange={(e) => setPublicSearchQuery(e.target.value)}
                  placeholder="Поиск открытых каналов по названию или юзернейму..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>

              {publicSearchResults.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                  Каналы не найдены
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {publicSearchResults.map((channel) => (
                    <div
                      key={channel.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 dark:text-white truncate">
                          {channel.name}
                        </div>
                        {channel.username && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            @{channel.username}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleJoinPublicChannel(channel.id)}
                        disabled={joiningChannelId === channel.id}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium"
                      >
                        {joiningChannelId === channel.id ? '...' : 'Подписаться'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showChannelInfo && selectedChannelId && (
        <ChannelSettingsModal
          channelId={selectedChannelId}
          onClose={() => setShowChannelInfo(false)}
          onChannelUpdated={() => {
            setShowChannelInfo(false);
            fetchChannels();
          }}
        />
      )}
    </div>
  );
}
