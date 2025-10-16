import type { PluginDefaultTranslationsObject } from '../types.js'

export const rs: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Затвори',
    mediaPreviewLabel: 'Преглед',
    mediaPreviewOpen: 'Отвори',
    mediaPreviewTitleAudio: 'Преглед аудиа',
    mediaPreviewTitleDocument: 'Преглед документа',
    mediaPreviewTitleImage: 'Преглед слике',
    mediaPreviewTitleVideo: 'Преглед видеа',

    // TUS Upload
    tusUploadChecking: 'Проверавам претходна отпремања...',
    tusUploadDisableMode: 'Искључи TUS режим',
    tusUploadEnableMode: 'Укључи TUS режим',
    tusUploadErrorFileType: 'Тип фајла није дозвољен',
    tusUploadErrorInitUpload: 'Није успешно покретање отпремања',
    tusUploadErrorPrevCheckFail: 'Није успешна провера претходних отпремања',
    tusUploadErrorRestoreUpload: 'Није успешно враћање отпремања',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Завршавам...',
    tusUploadPause: 'Пауза',
    tusUploadPreparing: 'Припремам отпремање...',
    tusUploadResume: 'Настави',
    tusUploadRetry: 'Покушај поново',
    tusUploadStartOver: 'Почни изнова',
    tusUploadStartUpload: 'Покрени отпремање',
    tusUploadStatusChecking: 'Проверавам претходна отпремања...',
    tusUploadStatusCompleted: 'Отпремање успешно завршено!',
    tusUploadStatusFinalizing: 'Завршавам отпремање...',
    tusUploadStatusIdle: 'Спремно за отпремање',
    tusUploadStatusIdleWithRestore: 'Спремно за наставак или почетак изнова',
    tusUploadStatusPaused: 'Отпремање паузирано на {{progress}}%',
    tusUploadStatusUploading: 'Отпремам... {{progress}}%',
    tusUploadTimeHours: 'ч',
    tusUploadTimeMinutes: 'м',
    tusUploadTimeSeconds: 'с',

    // Error messages
    errorAccessDenied: 'Немате дозволу за приступ овом ресурсу',
    errorCannotUploadToVideo: 'Не могу да отпремим на овај видео',
    errorCreateVideoFailed: 'Није могуће креирати видео на Bunny CDN',
    errorDeleteFileFailed: 'Није могуће обрисати фајл: {{filename}}',
    errorMissingRequiredFields: 'Недостају неке потребне информације',
    errorNoServiceConfigured: 'Ниједна услуга није конфигурисана',
    errorStreamConfigMissing: 'Bunny Stream није исправно конфигурисан',
    errorTitleRequired: 'Молимо унесите наслов за ваш видео',
    errorUploadFileFailed: 'Није могуће отпремити фајл: {{filename}}',
    errorVideoInErrorState: 'Овај видео је имао грешку при отпремању',
    errorVideoNotFound: 'Видео "{{videoId}}" не постоји',
  },
}
