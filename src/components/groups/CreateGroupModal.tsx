import { useState } from 'react';
import { X, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../lib/database.types';

interface CreateGroupModalProps {
  onClose: () => void;
  onGroupCreated: (group: GroupRow) => void;
}

type GroupRow = Database['public']['Tables']['groups']['Row'];

export function CreateGroupModal({ onClose, onGroupCreated }: CreateGroupModalProps) {
  const { user } = useAuth();
  const [groupName, setGroupName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();

    if (!user || !groupName.trim()) return;

    if (groupName.trim().length < 2) {
      alert('Название группы должно быть не менее 2 символов');
      return;
    }

    if (groupName.trim().length > 100) {
      alert('Название группы слишком длинное (максимум 100 символов)');
      return;
    }

    setCreating(true);

    try {
      const { data: inviteCode, error: codeError } = await supabase.rpc('generate_invite_code');

      if (codeError) throw codeError;

      const { data: newGroup, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: groupName.trim(),
          invite_code: inviteCode,
          created_by: user.id,
          is_public: isPublic,
        } as any)
        .select()
        .single();

      if (groupError) throw groupError;

      const { error: memberError } = await supabase
        .from('group_members')
        .upsert(
          {
            group_id: newGroup.id,
            user_id: user.id,
            is_admin: true,
          },
          { onConflict: 'group_id,user_id' }
        );

      if (memberError) throw memberError;

      onGroupCreated(newGroup as GroupRow);
      onClose();
    } catch (err: any) {
      alert('Ошибка создания группы: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Создать группу
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleCreateGroup} className="p-4 space-y-4">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white">
              <Users size={40} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Название группы
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Введите название..."
              autoFocus
              maxLength={100}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {groupName.length}/100 символов
            </p>
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Тип группы
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  isPublic
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="font-medium">Открытая</div>
                <div className="text-xs mt-1 opacity-80">Видна во вкладке групп всем пользователям</div>
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  !isPublic
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="font-medium">Закрытая</div>
                <div className="text-xs mt-1 opacity-80">Вступление только по коду или ссылке-приглашению</div>
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!groupName.trim() || creating}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              {creating ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

