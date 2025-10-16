import type { PluginDefaultTranslationsObject } from '../types.js'

export const uk: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Закрити',
    mediaPreviewLabel: 'Попередній перегляд',
    mediaPreviewOpen: 'Відкрити',
    mediaPreviewTitleAudio: 'Попередній перегляд аудіо',
    mediaPreviewTitleDocument: 'Попередній перегляд документа',
    mediaPreviewTitleImage: 'Попередній перегляд зображення',
    mediaPreviewTitleVideo: 'Попередній перегляд відео',

    // TUS Upload
    tusUploadChecking: 'Перевірка попередніх завантажень...',
    tusUploadDisableMode: 'Вимкнути режим TUS',
    tusUploadEnableMode: 'Увімкнути режим TUS',
    tusUploadErrorFileType: 'Тип файлу не дозволено',
    tusUploadErrorInitUpload: 'Не вдалося ініціалізувати завантаження',
    tusUploadErrorPrevCheckFail: 'Не вдалося перевірити попередні завантаження',
    tusUploadErrorRestoreUpload: 'Не вдалося відновити завантаження',
    tusUploadFileSize: '{{size}} МБ',
    tusUploadFinalizing: 'Завершення...',
    tusUploadPause: 'Пауза',
    tusUploadPreparing: 'Підготовка завантаження...',
    tusUploadResume: 'Продовжити',
    tusUploadRetry: 'Спробувати знову',
    tusUploadStartOver: 'Почати спочатку',
    tusUploadStartUpload: 'Почати завантаження',
    tusUploadStatusChecking: 'Перевірка попередніх завантажень...',
    tusUploadStatusCompleted: 'Завантаження успішно завершено!',
    tusUploadStatusFinalizing: 'Завершення завантаження...',
    tusUploadStatusIdle: 'Готово до завантаження',
    tusUploadStatusIdleWithRestore: 'Готово до продовження або початку спочатку',
    tusUploadStatusPaused: 'Завантаження призупинено на {{progress}}%',
    tusUploadStatusUploading: 'Завантаження... {{progress}}%',
    tusUploadTimeHours: 'г',
    tusUploadTimeMinutes: 'хв',
    tusUploadTimeSeconds: 'с',

    // Error messages
    errorAccessDenied: 'У вас немає дозволу на доступ до цього ресурсу',
    errorCannotUploadToVideo: 'Неможливо завантажити в це відео',
    errorCreateVideoFailed: 'Не вдалося створити відео на Bunny CDN',
    errorDeleteFileFailed: 'Не вдалося видалити файл: {{filename}}',
    errorMissingRequiredFields: 'Відсутня необхідна інформація',
    errorNoServiceConfigured: 'Жодна служба не налаштована',
    errorStreamConfigMissing: 'Bunny Stream налаштовано неправильно',
    errorTitleRequired: 'Будь ласка, введіть заголовок для вашого відео',
    errorUploadFileFailed: 'Не вдалося завантажити файл: {{filename}}',
    errorVideoInErrorState: 'У цього відео сталася помилка завантаження',
    errorVideoNotFound: 'Відео "{{videoId}}" не існує',
  },
}
