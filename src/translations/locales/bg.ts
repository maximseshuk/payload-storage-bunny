import type { PluginDefaultTranslationsObject } from '../types.js'

export const bg: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Проверка на предишни качвания...',
    tusUploadDisableMode: 'Деактивиране на TUS режим',
    tusUploadEnableMode: 'Активиране на TUS режим',
    tusUploadErrorFileType: 'Този тип файл не е разрешен',
    tusUploadErrorInitUpload: 'Неуспешно стартиране на качването',
    tusUploadErrorPrevCheckFail: 'Неуспешна проверка на предишни качвания',
    tusUploadErrorRestoreUpload: 'Неуспешно възстановяване на качването',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Финализиране...',
    tusUploadPause: 'Пауза',
    tusUploadPreparing: 'Подготовка на качването...',
    tusUploadResume: 'Продължи',
    tusUploadRetry: 'Опитай отново',
    tusUploadStartOver: 'Започни отначало',
    tusUploadStartUpload: 'Започни качването',
    tusUploadStatusChecking: 'Проверка на предишни качвания...',
    tusUploadStatusCompleted: 'Качването завърши успешно!',
    tusUploadStatusFinalizing: 'Финализиране на качването...',
    tusUploadStatusIdle: 'Готово за качване',
    tusUploadStatusIdleWithRestore: 'Готово за продължение или започване отначало',
    tusUploadStatusPaused: 'Качването е паузирано на {{progress}}%',
    tusUploadStatusUploading: 'Качва се... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Нямате разрешение за достъп до този ресурс',
    errorCannotUploadToVideo: 'Не може да се качва към това видео',
    errorCreateVideoFailed: 'Неуспешно създаване на видео в Bunny CDN',
    errorDeleteFileFailed: 'Неуспешно изтриване на файл: {{filename}}',
    errorInternalServer: 'Възникна грешка от наша страна',
    errorMissingRequiredFields: 'Липсва задължителна информация',
    errorStreamConfigMissing: 'Bunny Stream не е конфигуриран правилно',
    errorTitleRequired: 'Моля, въведете заглавие за вашето видео',
    errorUploadFileFailed: 'Неуспешно качване на файл: {{filename}}',
    errorVideoInErrorState: 'Това видео има грешка при качване',
    errorVideoNotFound: 'Видео "{{videoId}}" не съществува',
  },
}
