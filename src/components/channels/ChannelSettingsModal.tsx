import { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Copy, Check, Globe, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ChannelSettingsModalProps {
  channelId: string;
  onClose: () => void;
  onChannelUpdated: () => void;
}

export function ChannelSettingsModal({
  channelId,
  onClose,
  onChannelUpdated,
}: ChannelSettingsModalProps) {
  const { user } = useAuth();
  const [channel, setChannel] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameValidation, setUsernameValidation] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    fetchChannel();
  }, [channelId]);

  async function fetchChannel() {
    const { data } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle();

    if (data) {
      setChannel(data);
      setUsername(data.username);
      setName(data.name);
      setDescription(data.description || '');
      setIsPrivate(!!data.is_private);
      setAccessCode(data.access_code || null);
    }
  }

  const validateUsername = async (value: string) => {
    if (!value) {
      setUsernameValidation(null);
      return;
    }

    if (value === channel?.username) {
      setUsernameValidation({ valid: true, message: 'Текущий username' });
      return;
    }

    if (value.length < 4) {
      setUsernameValidation({ valid: false, message: 'Минимум 4 символа' });
      return;
    }

    if (!/^[a-z0-9_]+$/.test(value)) {
      setUsernameValidation({
        valid: false,
        message: 'Только буквы, цифры и подчеркивание',
      });
      return;
    }

    try {
      const { data } = await supabase.rpc('is_username_available', {
        username_to_check: value,
      } as any);

      if (data) {
        setUsernameValidation({ valid: true, message: 'Доступен' });
      } else {
        setUsernameValidation({ valid: false, message: 'Уже занят' });
      }
    } catch (err) {
      setUsernameValidation({ valid: false, message: 'Ошибка проверки' });
    }
  };

  const handleUsernameChange = (value: string) => {
    const normalized = value.toLowerCase();
    setUsername(normalized);
    validateUsername(normalized);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!username || !name) {
      setError('Заполните все обязательные поля');
      return;
    }

    setLoading(true);

    try {
      let nextAccessCode = accessCode;

      if (isPrivate && !nextAccessCode) {
        const { data: codeData, error: codeError } = await supabase.rpc('generate_channel_access_code');
        if (codeError) throw codeError;
        nextAccessCode = codeData as string;
        setAccessCode(nextAccessCode);
      }

      // Обновляем username если он изменился
      if (username !== channel.username) {
        const { data: updateUsernameResult, error: usernameError } =
          await supabase.rpc('update_channel_username', {
            channel_id_param: channelId,
            new_username: username,
          } as any);

        if (usernameError) throw usernameError;

        const result = updateUsernameResult as { success: boolean; error?: string };
        if (!result.success) {
          setError(result.error || 'Ошибка изменения username');
          setLoading(false);
          return;
        }
      }

      // Обновляем остальные поля
      const { error: updateError } = await supabase
        .from('channels')
        .update({
          name,
          description: description || null,
          is_private: isPrivate,
          access_code: isPrivate ? nextAccessCode : null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', channelId);

      if (updateError) throw updateError;

      onChannelUpdated();
      onClose();
    } catch (err: any) {
      console.error('Error updating channel:', err);
      setError(err.message || 'Ошибка при обновлении канала');
    } finally {
      setLoading(false);
    }
  }

  const handleCopyLink = () => {
    if (!accessCode) return;
    navigator.clipboard.writeText(`${window.location.origin}/?channel=${accessCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  async function handleDeleteChannel() {
    if (
      !confirm(
        'Вы уверены, что хотите удалить этот канал? Это действие необратимо!'
      )
    )
      return;

    try {
      const { error } = await supabase.from('channels').delete().eq('id', channelId);

      if (error) throw error;

      onChannelUpdated();
      onClose();
    } catch (err: any) {
      alert('Ошибка удаления: ' + err.message);
    }
  }

  if (!channel) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="text-gray-900 dark:text-white">Загрузка...</div>
        </div>
      </div>
    );
  }

  const isCreator = channel?.created_by === user?.id;
  const channelIsPrivate = !!channel?.is_private;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Настройки канала
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
              Юзернейм канала
            </label>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="например, my_channel"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                maxLength={30}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {usernameValidation && (
                <div
                  className={`flex items-center gap-2 text-sm ${
                    usernameValidation.valid
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {usernameValidation.valid ? (
                    <CheckCircle size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  {usernameValidation.message}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
              Название канала
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
              Описание (необязательно)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="space-y-3">
            <p className="block text-sm font-medium text-gray-900 dark:text-white">
              Тип канала
            </p>
            {isCreator ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      !isPrivate
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <Globe size={16} />
                      Открытый
                    </div>
                    <div className="text-xs mt-1 opacity-80">Виден всем пользователям</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      isPrivate
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <Lock size={16} />
                      Закрытый
                    </div>
                    <div className="text-xs mt-1 opacity-80">Подписка по коду или ссылке</div>
                  </button>
                </div>

                {isPrivate && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Ссылка-приглашение
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg font-mono text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 break-all">
                        {accessCode ? `${window.location.origin}/?channel=${accessCode}` : 'Код будет создан при сохранении'}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        disabled={!accessCode}
                        className="p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                        title="Скопировать ссылку"
                      >
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                {channelIsPrivate ? <Lock size={16} /> : <Globe size={16} />}
                {channelIsPrivate ? 'Закрытый канал' : 'Открытый канал'}
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle
                size={18}
                className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
              />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading || (usernameValidation && !usernameValidation.valid)}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleDeleteChannel}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Удалить канал
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
