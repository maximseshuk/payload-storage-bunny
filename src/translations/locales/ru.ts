import type { PluginDefaultTranslationsObject } from '../types.js'

export const ru: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Закрыть',
    mediaPreviewLabel: 'Предпросмотр',
    mediaPreviewOpen: 'Открыть',
    mediaPreviewTitleAudio: 'Предпросмотр аудио',
    mediaPreviewTitleDocument: 'Предпросмотр документа',
    mediaPreviewTitleImage: 'Предпросмотр изображения',
    mediaPreviewTitleVideo: 'Предпросмотр видео',

    // TUS Upload
    tusUploadChecking: 'Проверка предыдущих загрузок...',
    tusUploadDisableMode: 'Отключить режим TUS',
    tusUploadEnableMode: 'Включить режим TUS',
    tusUploadErrorFileType: 'Тип файла не разрешен',
    tusUploadErrorInitUpload: 'Не удалось инициализировать загрузку',
    tusUploadErrorPrevCheckFail: 'Не удалось проверить предыдущие загрузки',
    tusUploadErrorRestoreUpload: 'Не удалось восстановить загрузку',
    tusUploadFileSize: '{{size}} МБ',
    tusUploadFinalizing: 'Завершение...',
    tusUploadPause: 'Пауза',
    tusUploadPreparing: 'Подготовка загрузки...',
    tusUploadResume: 'Продолжить',
    tusUploadRetry: 'Попробовать снова',
    tusUploadStartOver: 'Начать заново',
    tusUploadStartUpload: 'Начать загрузку',
    tusUploadStatusChecking: 'Проверка предыдущих загрузок...',
    tusUploadStatusCompleted: 'Загрузка успешно завершена!',
    tusUploadStatusFinalizing: 'Завершение загрузки...',
    tusUploadStatusIdle: 'Готово к загрузке',
    tusUploadStatusIdleWithRestore: 'Готово к продолжению или начать заново',
    tusUploadStatusPaused: 'Загрузка приостановлена на {{progress}}%',
    tusUploadStatusUploading: 'Загрузка... {{progress}}%',

    // Error messages
    errorAccessDenied: 'У вас нет разрешения на доступ к этому ресурсу',
    errorCannotUploadToVideo: 'Невозможно загрузить в это видео',
    errorCreateVideoFailed: 'Не удалось создать видео на Bunny CDN',
    errorDeleteFileFailed: 'Не удалось удалить файл: {{filename}}',
    errorMissingRequiredFields: 'Отсутствует необходимая информация',
    errorNoServiceConfigured: 'Не настроена ни одна служба',
    errorStreamConfigMissing: 'Bunny Stream настроен неправильно',
    errorTitleRequired: 'Пожалуйста, введите заголовок для вашего видео',
    errorUploadFileFailed: 'Не удалось загрузить файл: {{filename}}',
    errorVideoInErrorState: 'У этого видео произошла ошибка загрузки',
    errorVideoNotFound: 'Видео "{{videoId}}" не существует',
  },
}
