import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Save, Trash2, CreditCard as Edit3, Upload, ArrowLeft } from 'lucide-react';
import { detectAnnotations } from '../utils/annotationDetection';
import { ModerationPanel } from '../components/ModerationPanel';
import { UserApprovalPanel } from '../components/UserApprovalPanel';

type ContentType = 'text' | 'audio' | 'video' | 'photo' | 'file';

interface MediaFile {
  file: File;
  type: ContentType;
  url?: string;
}

async function validateFileMagicNumber(view: Uint8Array, type: ContentType): Promise<boolean> {
  if (type === 'photo') {
    const jpg = view[0] === 0xFF && view[1] === 0xD8;
    const png = view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4E;
    const gif = view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46;
    const webp = view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[8] === 0x57;
    const bmp = view[0] === 0x42 && view[1] === 0x4D;
    return jpg || png || gif || webp || bmp;
  }

  if (type === 'audio') {
    const mp3 = view[0] === 0xFF && (view[1] === 0xFB || view[1] === 0xFA);
    const wav = view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46;
    const ogg = view[0] === 0x4F && view[1] === 0x67 && view[2] === 0x67;
    const m4a = view[4] === 0x66 && view[5] === 0x74 && view[6] === 0x79;
    return mp3 || wav || ogg || m4a;
  }

  if (type === 'video') {
    const mp4 = view[4] === 0x66 && view[5] === 0x74 && view[6] === 0x79;
    const webm = view[0] === 0x1A && view[1] === 0x45 && view[2] === 0xDF;
    return mp4 || webm;
  }

  return true;
}

export function AdminPanel() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const [postTitle, setPostTitle] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(['text']);
  const [postContent, setPostContent] = useState('');
  const [postDescription, setPostDescription] = useState('');
  const [hasDescription, setHasDescription] = useState(false);
  const [allowComments, setAllowComments] = useState(false);
  const [postHashtags, setPostHashtags] = useState('');
  const [postPersons, setPostPersons] = useState('');
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);

  const [existingPosts, setExistingPosts] = useState<any[]>([]);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'posts' | 'annotations' | 'moderation' | 'users'>('posts');

  const [allAnnotations, setAllAnnotations] = useState<any[]>([]);
  const [newAnnotationTerm, setNewAnnotationTerm] = useState('');
  const [newAnnotationContent, setNewAnnotationContent] = useState('');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editAnnotationTerm, setEditAnnotationTerm] = useState('');
  const [editAnnotationContent, setEditAnnotationContent] = useState('');

  useEffect(() => {
    if (user && profile?.is_admin) {
      fetchPosts();
      fetchAnnotations();
    }
  }, [user, profile]);

  async function fetchPosts() {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setExistingPosts(data);
  }

  async function fetchAnnotations() {
    const { data } = await supabase
      .from('annotations')
      .select('*')
      .order('term');
    if (data) setAllAnnotations(data);
  }

  const handleTypeToggle = (type: ContentType) => {
    setSelectedTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  const handleFileSelect = (type: ContentType, file: File) => {
    setMediaFiles(prev => [...prev, { file, type }]);
  };

  const removeMediaFile = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function uploadFile(file: File, type: ContentType): Promise<string> {
    const maxSize = 5 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('Файл слишком большой. Максимальный размер: 5 ГБ');
    }

    const allowedTypes: Record<ContentType, string[]> = {
      text: [],
      audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/x-m4a', 'audio/x-wav'],
      video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/avi'],
      photo: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff', 'image/x-icon', 'image/heic', 'image/heif', 'image/avif'],
      file: [],
    };

    if (type !== 'file' && type !== 'text' && allowedTypes[type].length > 0) {
      if (!allowedTypes[type].includes(file.type)) {
        throw new Error('Неподдерживаемый тип файла для этого типа контента');
      }

      const buffer = await file.slice(0, 12).arrayBuffer();
      const view = new Uint8Array(buffer);
      const isValidMagic = await validateFileMagicNumber(view, type);

      if (!isValidMagic) {
        throw new Error('Содержимое файла не соответствует объявленному типу');
      }
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${type}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('media-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('media-files')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  async function handleSavePost() {
    if (!postTitle || postTitle.length > 500) {
      alert('Введите название поста (максимум 500 символов)');
      return;
    }

    if (selectedTypes.length === 0) {
      alert('Выберите хотя бы один тип контента');
      return;
    }

    if (selectedTypes.includes('text') && !postContent) {
      alert('Введите текст для текстового поста');
      return;
    }

    if (postContent.length > 100000) {
      alert('Текст поста слишком длинный (максимум 100 000 символов)');
      return;
    }

    if (postDescription.length > 50000) {
      alert('Описание слишком длинное (максимум 50 000 символов)');
      return;
    }

    setLoading(true);

    try {
      const mediaUrls = mediaFiles.length > 0
        ? await Promise.all(
            mediaFiles.map(async (mediaFile) => {
              const url = await uploadFile(mediaFile.file, mediaFile.type);
              return {
                type: mediaFile.type,
                url,
                filename: mediaFile.file.name,
              };
            })
          )
        : [];

      let postId = editingPostId;

      const postData: any = {
        title: postTitle,
        content_type: selectedTypes[0] || 'text',
        content_types: selectedTypes,
        content: postContent,
        description: hasDescription ? postDescription : null,
        has_description: hasDescription,
        allow_comments: allowComments,
        media_urls: JSON.stringify(mediaUrls),
        updated_at: new Date().toISOString(),
      };

      if (editingPostId) {
        const { error } = await supabase
          .from('posts')
          .update(postData)
          .eq('id', editingPostId);

        if (error) throw error;

        await supabase.from('post_hashtags').delete().eq('post_id', editingPostId);
        await supabase.from('post_persons').delete().eq('post_id', editingPostId);
      } else {
        const { data, error } = await supabase
          .from('posts')
          .insert({
            ...postData,
            author_id: user?.id,
          })
          .select()
          .single();

        if (error) throw error;
        postId = data?.id || null;
      }

      const hashtags = postHashtags.split(',').map(h => h.trim()).filter(Boolean);
      if (hashtags.length > 0 && postId) {
        const { data: existingHashtags } = await supabase
          .from('hashtags')
          .select('id, name')
          .in('name', hashtags);

        const existingNames = new Set(existingHashtags?.map(h => h.name) || []);
        const newHashtags = hashtags.filter(h => !existingNames.has(h));

        if (newHashtags.length > 0) {
          await supabase.from('hashtags').insert(newHashtags.map(name => ({ name })) as any);
        }

        const { data: allHashtags } = await supabase
          .from('hashtags')
          .select('id, name')
          .in('name', hashtags);

        const hashtagRelations = allHashtags?.map(h => ({ post_id: postId, hashtag_id: h.id })) || [];
        if (hashtagRelations.length > 0) {
          await supabase.from('post_hashtags').insert(hashtagRelations as any);
        }
      }

      const persons = postPersons.split(',').map(p => p.trim()).filter(Boolean);
      if (persons.length > 0 && postId) {
        const { data: existingPersons } = await supabase
          .from('persons')
          .select('id, name')
          .in('name', persons);

        const existingNames = new Set(existingPersons?.map(p => p.name) || []);
        const newPersons = persons.filter(p => !existingNames.has(p));

        if (newPersons.length > 0) {
          await supabase.from('persons').insert(newPersons.map(name => ({ name })) as any);
        }

        const { data: allPersons } = await supabase
          .from('persons')
          .select('id, name')
          .in('name', persons);

        const personRelations = allPersons?.map(p => ({ post_id: postId, person_id: p.id })) || [];
        if (personRelations.length > 0) {
          await supabase.from('post_persons').insert(personRelations as any);
        }
      }

      if (postId) {
        await supabase.from('post_annotations').delete().eq('post_id', postId);

        const { data: allAnnotationsData } = await supabase
          .from('annotations')
          .select('id, term');

        if (allAnnotationsData) {
          const annotationMatches = new Map<string, { start: number; end: number }[]>();

          if (postContent) {
            const contentMatches = detectAnnotations(postContent, allAnnotationsData);
            contentMatches.forEach(match => {
              if (!annotationMatches.has(match.annotationId)) {
                annotationMatches.set(match.annotationId, []);
              }
              annotationMatches.get(match.annotationId)!.push({
                start: match.start,
                end: match.end,
              });
            });
          }

          if (hasDescription && postDescription) {
            const descriptionMatches = detectAnnotations(postDescription, allAnnotationsData);
            const contentLength = postContent ? postContent.length : 0;
            descriptionMatches.forEach(match => {
              if (!annotationMatches.has(match.annotationId)) {
                annotationMatches.set(match.annotationId, []);
              }
              annotationMatches.get(match.annotationId)!.push({
                start: contentLength + match.start,
                end: contentLength + match.end,
              });
            });
          }

          const annotationRecords: any[] = [];
          annotationMatches.forEach((positions, annotationId) => {
            positions.forEach(pos => {
              annotationRecords.push({
                post_id: postId,
                annotation_id: annotationId,
                position_start: pos.start,
                position_end: pos.end,
              });
            });
          });

          if (annotationRecords.length > 0) {
            await supabase.from('post_annotations').insert(annotationRecords);
          }
        }
      }

      resetPostForm();
      fetchPosts();
      alert(editingPostId ? 'Пост обновлен!' : 'Пост создан!');
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePost(postId: string) {
    if (!confirm('Удалить этот пост?')) return;

    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      alert('Ошибка удаления: ' + error.message);
    } else {
      fetchPosts();
    }
  }

  async function handleEditPost(post: any) {
    setEditingPostId(post.id);
    setPostTitle(post.title);
    setSelectedTypes(post.content_types || [post.content_type]);
    setPostContent(post.content || '');
    setPostDescription(post.description || '');
    setHasDescription(post.has_description || false);
    setAllowComments(post.allow_comments || false);

    const { data: hashtagsData } = await supabase
      .from('post_hashtags')
      .select('hashtags(name)')
      .eq('post_id', post.id);
    setPostHashtags(hashtagsData?.map((h: any) => h.hashtags.name).join(', ') || '');

    const { data: personsData } = await supabase
      .from('post_persons')
      .select('persons(name)')
      .eq('post_id', post.id);
    setPostPersons(personsData?.map((p: any) => p.persons.name).join(', ') || '');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetPostForm() {
    setEditingPostId(null);
    setPostTitle('');
    setSelectedTypes(['text']);
    setPostContent('');
    setPostDescription('');
    setHasDescription(false);
    setAllowComments(false);
    setPostHashtags('');
    setPostPersons('');
    setMediaFiles([]);
  }

  async function handleCreateAnnotation() {
    if (!newAnnotationTerm || newAnnotationTerm.length > 200) {
      alert('Введите термин (максимум 200 символов)');
      return;
    }

    if (newAnnotationContent.length > 50000) {
      alert('Описание слишком длинное (максимум 50 000 символов)');
      return;
    }

    const { error } = await supabase.from('annotations').insert({
      term: newAnnotationTerm.trim(),
      content: newAnnotationContent.trim(),
    } as any);

    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      setNewAnnotationTerm('');
      setNewAnnotationContent('');
      fetchAnnotations();
      alert('Аннотация создана!');
    }
  }

  async function handleEditAnnotation(annotation: any) {
    setEditingAnnotationId(annotation.id);
    setEditAnnotationTerm(annotation.term);
    setEditAnnotationContent(annotation.content || '');
  }

  async function handleSaveAnnotation() {
    if (!editAnnotationTerm || editAnnotationTerm.length > 200) {
      alert('Введите термин (максимум 200 символов)');
      return;
    }

    if (editAnnotationContent.length > 50000) {
      alert('Описание слишком длинное (максимум 50 000 символов)');
      return;
    }

    const { error } = await supabase
      .from('annotations')
      .update({
        term: editAnnotationTerm.trim(),
        content: editAnnotationContent.trim(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', editingAnnotationId!);

    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      setEditingAnnotationId(null);
      setEditAnnotationTerm('');
      setEditAnnotationContent('');
      fetchAnnotations();
      alert('Аннотация обновлена!');
    }
  }

  async function handleDeleteAnnotation(annotationId: string) {
    if (!confirm('Удалить эту аннотацию?')) return;

    const { error } = await supabase.from('annotations').delete().eq('id', annotationId);
    if (error) {
      alert('Ошибка удаления: ' + error.message);
    } else {
      fetchAnnotations();
    }
  }

  if (!user || !profile?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Доступ запрещен
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            У вас нет прав администратора
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
            На главную
          </a>
        </div>
      </div>
    );
  }

  const contentTypeLabels = {
    text: 'Текст',
    audio: 'Аудио',
    video: 'Видео',
    photo: 'Фото',
    file: 'Файл',
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Админ-панель
          </h1>
          <a
            href="/"
            className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
            <span>На главную</span>
          </a>
        </div>

        <div className="mb-6 flex gap-3 flex-wrap">
          <button
            onClick={() => setActiveTab('posts')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'posts'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Управление постами
          </button>
          <button
            onClick={() => setActiveTab('annotations')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'annotations'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Управление аннотациями
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Пользователи
          </button>
          <button
            onClick={() => setActiveTab('moderation')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'moderation'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Наказания
          </button>
        </div>

        {activeTab === 'users' ? (
        <UserApprovalPanel />
      ) : activeTab === 'moderation' ? (
        <ModerationPanel />
      ) : activeTab === 'posts' ? (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                {editingPostId ? 'Редактировать пост' : 'Создать новый пост'}
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Название
                  </label>
                  <input
                    type="text"
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Типы контента (можно выбрать несколько)
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {(Object.keys(contentTypeLabels) as ContentType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => handleTypeToggle(type)}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          selectedTypes.includes(type)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {contentTypeLabels[type]}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedTypes.includes('text') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Текст
                    </label>
                    <textarea
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      rows={8}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Введите текст поста..."
                    />
                  </div>
                )}

                {selectedTypes.some(t => ['audio', 'video', 'photo', 'file'].includes(t)) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Загрузить файлы
                    </label>
                    <div className="space-y-3">
                      {selectedTypes.filter(t => t !== 'text').map(type => (
                        <div key={type} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
                          <label className="flex flex-col items-center justify-center cursor-pointer">
                            <Upload className="w-8 h-8 mb-2 text-gray-400" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              Загрузить {contentTypeLabels[type]}
                            </span>
                            <input
                              type="file"
                              accept={
                                type === 'audio' ? 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm' :
                                type === 'video' ? 'video/*,.mp4,.webm,.ogg,.mov,.avi,.mkv' :
                                type === 'photo' ? 'image/*,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.tiff,.ico,.heic,.heif,.avif' :
                                '*/*'
                              }
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileSelect(type, file);
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                      ))}
                    </div>

                    {mediaFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Выбранные файлы:
                        </p>
                        {mediaFiles.map((mf, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {contentTypeLabels[mf.type]}: {mf.file.name}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {(mf.file.size / 1024 / 1024).toFixed(2)} МБ
                              </p>
                            </div>
                            <button
                              onClick={() => removeMediaFile(idx)}
                              className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <input
                      type="checkbox"
                      checked={hasDescription}
                      onChange={(e) => setHasDescription(e.target.checked)}
                      className="w-4 h-4"
                    />
                    Добавить описание
                  </label>
                  {hasDescription && (
                    <textarea
                      value={postDescription}
                      onChange={(e) => setPostDescription(e.target.value)}
                      rows={5}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Введите описание поста..."
                    />
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={allowComments}
                      onChange={(e) => setAllowComments(e.target.checked)}
                      className="w-4 h-4"
                    />
                    Разрешить комментарии
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Хэштеги (через запятую)
                  </label>
                  <input
                    type="text"
                    value={postHashtags}
                    onChange={(e) => setPostHashtags(e.target.value)}
                    placeholder="наука, история, философия"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Персоны (через запятую)
                  </label>
                  <input
                    type="text"
                    value={postPersons}
                    onChange={(e) => setPostPersons(e.target.value)}
                    placeholder="Иван Иванов, Петр Петров"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSavePost}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                  >
                    <Save size={20} />
                    {editingPostId ? 'Обновить' : 'Создать'}
                  </button>

                  {editingPostId && (
                    <button
                      onClick={resetPostForm}
                      className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                    >
                      Отмена
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Существующие посты
              </h2>

              <div className="space-y-3">
                {existingPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate">
                        {post.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {(post.content_types || [post.content_type]).join(', ')} • {new Date(post.created_at).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEditPost(post)}
                        className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg"
                      >
                        <Edit3 size={20} />
                      </button>
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}

                {existingPosts.length === 0 && (
                  <p className="text-gray-600 dark:text-gray-400 text-center py-4">
                    Постов пока нет
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-8">
            {editingAnnotationId ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Редактировать аннотацию
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Термин
                    </label>
                    <input
                      type="text"
                      value={editAnnotationTerm}
                      onChange={(e) => setEditAnnotationTerm(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Описание
                    </label>
                    <textarea
                      value={editAnnotationContent}
                      onChange={(e) => setEditAnnotationContent(e.target.value)}
                      rows={10}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveAnnotation}
                      className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      <Save size={20} />
                      Сохранить
                    </button>
                    <button
                      onClick={() => {
                        setEditingAnnotationId(null);
                        setEditAnnotationTerm('');
                        setEditAnnotationContent('');
                      }}
                      className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Создать новую аннотацию
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Термин
                    </label>
                    <input
                      type="text"
                      value={newAnnotationTerm}
                      onChange={(e) => setNewAnnotationTerm(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Введите термин..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Описание
                    </label>
                    <textarea
                      value={newAnnotationContent}
                      onChange={(e) => setNewAnnotationContent(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Введите описание термина..."
                    />
                  </div>

                  <button
                    onClick={handleCreateAnnotation}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    <Plus size={20} />
                    Создать аннотацию
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Все аннотации ({allAnnotations.length})
              </h3>

              <div className="space-y-3">
                {allAnnotations.map((ann) => (
                  <div
                    key={ann.id}
                    className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <h4 className="font-bold text-gray-900 dark:text-white mb-1">
                        {ann.term}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {ann.content || 'Описание не добавлено'}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEditAnnotation(ann)}
                        className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg"
                      >
                        <Edit3 size={20} />
                      </button>
                      <button
                        onClick={() => handleDeleteAnnotation(ann.id)}
                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}

                {allAnnotations.length === 0 && (
                  <p className="text-gray-600 dark:text-gray-400 text-center py-4">
                    Аннотаций пока нет
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

