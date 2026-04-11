import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GroupsList } from '../components/groups/GroupsList';
import { GroupChatWindow } from '../components/groups/GroupChatWindow';
import { CreateGroupModal } from '../components/groups/CreateGroupModal';
import { JoinGroupModal } from '../components/groups/JoinGroupModal';
import { GroupInfo } from '../components/groups/GroupInfo';
import { GroupPreviewPanel } from '../components/groups/GroupPreviewPanel';

interface GroupsPageProps {
  onNavigateAuth: () => void;
  initialInviteCode?: string | null;
}

export function GroupsPage({ onNavigateAuth, initialInviteCode = null }: GroupsPageProps) {
  const { user, profile } = useAuth();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [previewGroupId, setPreviewGroupId] = useState<string | null>(null);
  const [previewInviteCode, setPreviewInviteCode] = useState<string | null>(initialInviteCode);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showJoinGroup, setShowJoinGroup] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setSelectedGroupId(null);
    setPreviewGroupId(null);
    setPreviewInviteCode(initialInviteCode ?? null);
  }, [initialInviteCode]);

  function setInviteUrl(code: string | null) {
    const url = new URL(window.location.href);

    if (code) {
      url.searchParams.set('group', code);
    } else {
      url.searchParams.delete('group');
    }

    window.history.replaceState({}, '', url.toString());
  }

  function openChat(groupId: string) {
    setSelectedGroupId(groupId);
    setPreviewGroupId(null);
    setPreviewInviteCode(null);
    setInviteUrl(null);
  }

  function clearSelection() {
    setSelectedGroupId(null);
    setPreviewGroupId(null);
    setPreviewInviteCode(null);
    setInviteUrl(null);
  }

  function openPreview(params: { groupId?: string | null; inviteCode?: string | null }) {
    setSelectedGroupId(null);
    setPreviewGroupId(params.groupId ?? null);
    setPreviewInviteCode(params.inviteCode ?? null);
    setInviteUrl(params.inviteCode ?? null);
  }

  const canCreateGroup = !!user && profile?.approval_status === 'approved';

  return (
    <div className="h-[calc(100vh-73px)] flex bg-gray-50 dark:bg-gray-900">
      <div className="w-full md:w-96 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <GroupsList
          onSelectGroup={openChat}
          onPreviewGroup={openPreview}
          selectedGroupId={selectedGroupId}
          refreshKey={refreshKey}
          onNewGroup={() => {
            if (canCreateGroup) {
              setShowCreateGroup(true);
            } else {
              onNavigateAuth();
            }
          }}
          onJoinGroup={() => {
            if (!user) {
              onNavigateAuth();
              return;
            }

            setShowJoinGroup(true);
          }}
          onNavigateAuth={onNavigateAuth}
          onGroupJoined={openChat}
        />
      </div>

      <div className="flex-1 flex flex-col">
        {selectedGroupId ? (
          <GroupChatWindow
            groupId={selectedGroupId}
            onBack={clearSelection}
            onShowInfo={() => setShowGroupInfo(true)}
          />
        ) : previewInviteCode || previewGroupId ? (
          <GroupPreviewPanel
            inviteCode={previewInviteCode}
            groupId={previewGroupId}
            onNavigateAuth={onNavigateAuth}
            onJoinSuccess={openChat}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <div className="text-6xl mb-4">👥</div>
              <p className="text-lg font-medium mb-2">Выберите группу</p>
              <p className="text-sm">или откройте группу из списка</p>
            </div>
          </div>
        )}
      </div>

      {showCreateGroup && canCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onGroupCreated={(groupId) => {
            setShowCreateGroup(false);
            setRefreshKey((prev) => prev + 1);
            openChat(groupId);
          }}
        />
      )}

      {showJoinGroup && (
        <JoinGroupModal
          onClose={() => setShowJoinGroup(false)}
          onGroupJoined={(groupId) => {
            setShowJoinGroup(false);
            if (groupId) {
              openChat(groupId);
            }
          }}
        />
      )}

      {showGroupInfo && selectedGroupId && (
        <GroupInfo
          groupId={selectedGroupId}
          onClose={() => setShowGroupInfo(false)}
          onLeaveGroup={() => {
            setShowGroupInfo(false);
            clearSelection();
          }}
        />
      )}
    </div>
  );
}

