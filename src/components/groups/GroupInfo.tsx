import { useState, useEffect } from 'react';
import { X, Copy, Check, Users as UsersIcon, LogOut, Trash2, Shield, ShieldOff, UserX, UserCheck, Ban, Globe, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface GroupInfoProps {
  groupId: string;
  onClose: () => void;
  onLeaveGroup: () => void;
}

interface GroupMember {
  id: string;
  user_id: string;
  is_admin: boolean;
  is_moderator: boolean;
  joined_at: string;
  user_profiles?: {
    username: string;
    is_admin: boolean;
  };
}

interface BannedUser {
  id: string;
  user_id: string;
  banned_by: string | null;
  reason: string | null;
  banned_at: string;
  user_profiles?: {
    username: string;
  };
  banned_by_profile?: {
    username: string;
  };
}

export function GroupInfo({ groupId, onClose, onLeaveGroup }: GroupInfoProps) {
  const { user, profile } = useAuth();
  const [groupData, setGroupData] = useState<any>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'members' | 'banned'>('members');
  const [updatingType, setUpdatingType] = useState(false);

  useEffect(() => {
    if (groupId) {
      fetchGroupData();
      fetchMembers();
      fetchBannedUsers();
    }
  }, [groupId]);

  async function fetchGroupData() {
    const { data } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle();

    if (data) {
      setGroupData(data);
    }
  }

  async function fetchMembers() {
    setLoading(true);

    const { data } = await supabase
      .from('group_members')
      .select(`
        *,
        user_profiles (
          username,
          is_admin
        )
      `)
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });

    if (data) {
      setMembers(data as any);
    }

    setLoading(false);
  }

  async function fetchBannedUsers() {
    const { data } = await supabase
      .from('group_banned_users')
      .select(`
        *,
        user_profiles!group_banned_users_user_id_fkey (username),
        banned_by_profile:user_profiles!group_banned_users_banned_by_fkey (username)
      `)
      .eq('group_id', groupId)
      .order('banned_at', { ascending: false });

    if (data) {
      setBannedUsers(data as any);
    }
  }

  const handleCopyLink = () => {
    if (groupData?.invite_code) {
      navigator.clipboard.writeText(`${window.location.origin}/?group=${groupData.invite_code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeaveGroup = async () => {
    if (!user || !confirm('Вы уверены, что хотите покинуть группу?')) return;

    try {
      const { data, error } = await supabase.rpc('leave_group', {
        leaving_group_id: groupId,
        leaving_user_id: user.id,
      } as any);

      if (error) throw error;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        alert(result.error || 'Ошибка выхода из группы');
        return;
      }

      onLeaveGroup();
      onClose();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleDeleteGroup = async () => {
    if (!user || !confirm('Вы уверены, что хотите удалить группу? Это действие необратимо!')) return;

    try {
      const { error } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;

      alert('Группа удалена');
      onLeaveGroup();
      onClose();
    } catch (err: any) {
      alert('Ошибка удаления: ' + err.message);
    }
  };

  const handlePromoteModerator = async (userId: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('promote_to_moderator', {
        target_group_id: groupId,
        target_user_id: userId,
        promoting_user_id: user.id,
      } as any);

      if (error) throw error;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        alert(result.error || 'Ошибка назначения модератора');
        return;
      }

      alert('Модератор назначен');
      fetchMembers();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleDemoteModerator = async (userId: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('demote_from_moderator', {
        target_group_id: groupId,
        target_user_id: userId,
        demoting_user_id: user.id,
      } as any);

      if (error) throw error;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        alert(result.error || 'Ошибка снятия модератора');
        return;
      }

      alert('Роль модератора снята');
      fetchMembers();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleKickUser = async (userId: string) => {
    if (!user) return;

    const reason = prompt('Причина исключения (необязательно):');
    if (reason === null) return;

    if (!confirm('Выгнать этого пользователя из группы?')) return;

    try {
      const { data, error } = await supabase.rpc('kick_user_from_group', {
        target_group_id: groupId,
        target_user_id: userId,
        kicking_user_id: user.id,
        kick_reason: reason || null,
      } as any);

      if (error) throw error;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        alert(result.error || 'Ошибка исключения пользователя');
        return;
      }

      alert('Пользователь исключен из группы');
      fetchMembers();
      fetchBannedUsers();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    if (!user || !confirm('Убрать пользователя из черного списка?')) return;

    try {
      const { data, error } = await supabase.rpc('unban_user_from_group', {
        target_group_id: groupId,
        target_user_id: userId,
        unbanning_user_id: user.id,
      } as any);

      if (error) throw error;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        alert(result.error || 'Ошибка разблокировки пользователя');
        return;
      }

      alert('Пользователь убран из черного списка');
      fetchBannedUsers();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  const isCreator = groupData?.created_by === user?.id;
  const currentMember = members.find(m => m.user_id === user?.id);
  const isModerator = currentMember?.is_moderator || false;
  const canModerate = isCreator || isModerator;

  const handleGroupTypeChange = async (nextIsPublic: boolean) => {
    if (!isCreator || !groupData) return;

    if (groupData.is_public === nextIsPublic) return;

    setUpdatingType(true);

    try {
      const { error } = await supabase
        .from('groups')
        .update({
          is_public: nextIsPublic,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', groupId);

      if (error) throw error;

      await fetchGroupData();
    } catch (err: any) {
      alert(err.message || 'Не удалось изменить тип группы');
    } finally {
      setUpdatingType(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Информация о группе
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {groupData && (
            <>
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white">
                  <UsersIcon size={40} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white text-center">
                  {groupData.name}
                </h3>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                  {groupData.is_public ? <Globe size={16} /> : <Lock size={16} />}
                  {groupData.is_public ? 'Открытая группа' : 'Закрытая группа'}
                </div>
              </div>

              {isCreator && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                    Тип группы
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleGroupTypeChange(true)}
                      disabled={updatingType}
                      className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                        groupData.is_public
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="font-medium">Открытая</div>
                      <div className="text-xs mt-1 opacity-80">Видна всем пользователям</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGroupTypeChange(false)}
                      disabled={updatingType}
                      className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                        !groupData.is_public
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="font-medium">Закрытая</div>
                      <div className="text-xs mt-1 opacity-80">Вступление по коду или ссылке</div>
                    </button>
                  </div>
                </div>
              )}

              {!groupData.is_public && canModerate && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Ссылка-приглашение:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg font-mono text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 break-all">
                      {`${window.location.origin}/?group=${groupData.invite_code}`}
                    </code>
                    <button
                      onClick={handleCopyLink}
                      className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      title="Скопировать ссылку"
                    >
                      {copied ? <Check size={20} /> : <Copy size={20} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    По этой ссылке откроется профиль группы с кнопкой вступления
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-3 border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setActiveTab('members')}
                    className={`flex items-center gap-2 px-4 py-2 font-semibold transition-colors ${
                      activeTab === 'members'
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <UsersIcon size={18} />
                    Участники ({members.length})
                  </button>
                  {canModerate && (
                    <button
                      onClick={() => setActiveTab('banned')}
                      className={`flex items-center gap-2 px-4 py-2 font-semibold transition-colors ${
                        activeTab === 'banned'
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      <Ban size={18} />
                      Черный список ({bannedUsers.length})
                    </button>
                  )}
                </div>

                {activeTab === 'members' && (
                  <>
                    {loading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="animate-pulse flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                            <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                            <div className="flex-1">
                              <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-2/3"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {members.map((member) => {
                          const isMemberCreator = member.user_id === groupData.created_by;
                          const isSelf = member.user_id === user?.id;
                          const showActions = canModerate && !isMemberCreator && !isSelf;

                          return (
                            <div
                              key={member.id}
                              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                            >
                              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                                {member.user_profiles?.username?.[0]?.toUpperCase() || '?'}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {member.user_profiles?.username || 'Пользователь'}
                                  </span>
                                  {member.user_profiles?.is_admin && (
                                    <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded">
                                      admin
                                    </span>
                                  )}
                                  {isMemberCreator && (
                                    <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded">
                                      создатель
                                    </span>
                                  )}
                                  {member.is_moderator && (
                                    <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded">
                                      модератор
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(member.joined_at).toLocaleDateString('ru-RU')}
                                </p>
                              </div>
                              {showActions && (
                                <div className="flex items-center gap-1">
                                  {isCreator && !member.is_moderator && (
                                    <button
                                      onClick={() => handlePromoteModerator(member.user_id)}
                                      className="p-2 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                                      title="Назначить модератором"
                                    >
                                      <Shield size={18} />
                                    </button>
                                  )}
                                  {isCreator && member.is_moderator && (
                                    <button
                                      onClick={() => handleDemoteModerator(member.user_id)}
                                      className="p-2 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                                      title="Снять модератора"
                                    >
                                      <ShieldOff size={18} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleKickUser(member.user_id)}
                                    className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                    title="Исключить из группы"
                                  >
                                    <UserX size={18} />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'banned' && canModerate && (
                  <div className="space-y-2">
                    {bannedUsers.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <Ban size={48} className="mx-auto mb-2 opacity-50" />
                        <p>Черный список пуст</p>
                      </div>
                    ) : (
                      bannedUsers.map((bannedUser) => (
                        <div
                          key={bannedUser.id}
                          className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                            {bannedUser.user_profiles?.username?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {bannedUser.user_profiles?.username || 'Пользователь'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                              <p>
                                Забанен: {new Date(bannedUser.banned_at).toLocaleDateString('ru-RU')}
                              </p>
                              {bannedUser.banned_by_profile?.username && (
                                <p>
                                  Кем: {bannedUser.banned_by_profile.username}
                                </p>
                              )}
                              {bannedUser.reason && (
                                <p className="text-red-600 dark:text-red-400">
                                  Причина: {bannedUser.reason}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnbanUser(bannedUser.user_id)}
                            className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors flex-shrink-0"
                            title="Разблокировать"
                          >
                            <UserCheck size={18} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                {isCreator ? (
                  <button
                    onClick={handleDeleteGroup}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
                  >
                    <Trash2 size={20} />
                    Удалить группу
                  </button>
                ) : (
                  <button
                    onClick={handleLeaveGroup}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
                  >
                    <LogOut size={20} />
                    Покинуть группу
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
