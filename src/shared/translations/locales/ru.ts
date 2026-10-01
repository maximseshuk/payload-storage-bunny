import type { PluginDefaultTranslationsObject } from '../types.js'

export const ru: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadDisableMode: 'Отключить режим TUS',
    tusUploadEnableMode: 'Включить режим TUS',
    tusUploadErrorFileType: 'Тип файла не разрешен',
    tusUploadErrorInitUpload: 'Не удалось инициализировать загрузку',
    tusUploadErrorPrevCheckFail: 'Не удалось проверить предыдущие загрузки',
    tusUploadErrorRestoreUpload: 'Не удалось восстановить загрузку',
    tusUploadHint: 'Загрузите видео перед сохранением документа.',
    tusUploadPause: 'Пауза',
    tusUploadPreparing: 'Подготовка загрузки…',
    tusUploadProgress: '{{uploaded}} из {{total}}',
    tusUploadResume: 'Продолжить',
    tusUploadResumeHint: 'Продолжите или начните заново.',
    tusUploadRetry: 'Попробовать снова',
    tusUploadSaveToFinish: 'Сохраните документ, чтобы завершить.',
    tusUploadStartOver: 'Начать заново',
    tusUploadStartUpload: 'Начать загрузку',
    tusUploadStatusChecking: 'Проверка предыдущих загрузок…',
    tusUploadStatusCompleted: 'Загружено',
    tusUploadStatusFailed: 'Ошибка загрузки',
    tusUploadStatusFailedAt: 'Ошибка загрузки на {{progress}}%',
    tusUploadStatusFinalizing: 'Завершение загрузки…',
    tusUploadStatusIdle: 'Ещё не загружено',
    tusUploadStatusIdleWithRestore: 'Найдена предыдущая загрузка',
    tusUploadStatusPaused: 'Приостановлено на {{progress}}%',
    tusUploadStatusUploading: 'Загрузка… {{progress}}%',
    tusUploadTimeHours: 'ч',
    tusUploadTimeLeft: 'осталось {{time}}',

    tusUploadTimeMinutes: 'м',
    tusUploadTimeSeconds: 'с',

    // Error messages
    errorAccessDenied: 'У вас нет разрешения на доступ к этому ресурсу',
    errorDeleteFileFailed: 'Не удалось удалить файл: {{filename}}',
    errorMissingRequiredFields: 'Отсутствует необходимая информация',
    errorNoServiceConfigured: 'Не настроена ни одна служба',
    errorStreamConfigMissing: 'Bunny Stream настроен неправильно',
    errorTitleRequired: 'Пожалуйста, введите заголовок для вашего видео',
    errorUploadFileFailed: 'Не удалось загрузить файл: {{filename}}',
  },
}
