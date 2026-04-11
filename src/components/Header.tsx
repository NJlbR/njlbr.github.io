import { memo } from 'react';
import { Sun, Moon, Shuffle, Network, LogOut, LogIn, User, MessageCircle, Home, Users, Rss } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  onRandomAnnotation: () => void;
  onNavigateGraph: () => void;
  onNavigateHome: () => void;
  onNavigateAuth: () => void;
  onNavigateMessages: () => void;
  onNavigateChannels: () => void;
  onNavigateGroups: () => void;
  currentPage: string;
}

function HeaderContent({
  onRandomAnnotation,
  onNavigateGraph,
  onNavigateHome,
  onNavigateAuth,
  onNavigateMessages,
  onNavigateChannels,
  onNavigateGroups,
  currentPage
}: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, profile, signOut } = useAuth();

  return (
    <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onNavigateHome}
            className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate mr-2"
          >
            Тг создателя @NJlbR
          </button>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <button
              onClick={onNavigateHome}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                currentPage === 'feed'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Главная"
            >
              <Home size={20} className="sm:w-6 sm:h-6" />
            </button>

            <button
              onClick={onNavigateMessages}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                currentPage === 'messages'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Личные сообщения"
            >
              <MessageCircle size={20} className="sm:w-6 sm:h-6" />
            </button>

            <button
              onClick={onNavigateChannels}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                currentPage === 'channels'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Каналы"
            >
              <Rss size={20} className="sm:w-6 sm:h-6" />
            </button>

            <button
              onClick={onNavigateGroups}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                currentPage === 'groups'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Группы"
            >
              <Users size={20} className="sm:w-6 sm:h-6" />
            </button>

            <button
              onClick={onRandomAnnotation}
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm sm:text-base"
              title="Случайная аннотация"
            >
              <Shuffle size={18} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Случайная</span>
            </button>

            <button
              onClick={onNavigateGraph}
              className="p-1.5 sm:p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Граф связей"
            >
              <Network size={20} className="sm:w-6 sm:h-6" />
            </button>

            <button
              onClick={toggleTheme}
              className="p-1.5 sm:p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={theme === 'light' ? 'Темная тема' : 'Светлая тема'}
            >
              {theme === 'light' ? <Moon size={20} className="sm:w-6 sm:h-6" /> : <Sun size={20} className="sm:w-6 sm:h-6" />}
            </button>

            {user ? (
              <>
                {profile && (
                  <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <User size={16} className="sm:w-4 sm:h-4" />
                    <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                      {profile.username}
                    </span>
                    {profile.is_admin && (
                      <span className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded">
                        admin
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={signOut}
                  className="p-1.5 sm:p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Выйти"
                >
                  <LogOut size={20} className="sm:w-6 sm:h-6" />
                </button>
              </>
            ) : (
              <button
                onClick={onNavigateAuth}
                className="p-1.5 sm:p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Войти"
              >
                <LogIn size={20} className="sm:w-6 sm:h-6" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export const Header = memo(HeaderContent);
