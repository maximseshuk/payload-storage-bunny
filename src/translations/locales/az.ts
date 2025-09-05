import type { PluginDefaultTranslationsObject } from '../types.js'

export const az: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Əvvəlki yükləmələr yoxlanılır...',
    tusUploadDisableMode: 'TUS rejimini söndür',
    tusUploadEnableMode: 'TUS rejimini aç',
    tusUploadErrorFileType: 'Fayl növü icazə verilmir',
    tusUploadErrorInitUpload: 'Yükləmə başlatmaq alınmadı',
    tusUploadErrorPrevCheckFail: 'Əvvəlki yükləmələri yoxlamaq alınmadı',
    tusUploadErrorRestoreUpload: 'Yükləməni bərpa etmək alınmadı',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Tamamlanır...',
    tusUploadPause: 'Dayandır',
    tusUploadPreparing: 'Yükləmə hazırlanır...',
    tusUploadResume: 'Davam et',
    tusUploadRetry: 'Yenidən cəhd et',
    tusUploadStartOver: 'Yenidən başla',
    tusUploadStartUpload: 'Yükləməni başlat',
    tusUploadStatusChecking: 'Əvvəlki yükləmələr yoxlanılır...',
    tusUploadStatusCompleted: 'Yükləmə uğurla tamamlandı!',
    tusUploadStatusFinalizing: 'Yükləmə tamamlanır...',
    tusUploadStatusIdle: 'Yükləmə üçün hazır',
    tusUploadStatusIdleWithRestore: 'Davam etmək və ya yenidən başlamaq üçün hazır',
    tusUploadStatusPaused: 'Yükləmə {{progress}}% -də dayandırıldı',
    tusUploadStatusUploading: 'Yüklənir... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Bu resursa giriş icazəniz yoxdur',
    errorCannotUploadToVideo: 'Bu videoya yükləmək olmur',
    errorCreateVideoFailed: 'Bunny CDN-də video yaradılmadı',
    errorDeleteFileFailed: 'Fayl silinmədi: {{filename}}',
    errorInternalServer: 'Bizim tərəfdə nəsə səhv oldu',
    errorMissingRequiredFields: 'Bəzi tələb olunan məlumatlar əksikdir',
    errorStreamConfigMissing: 'Bunny Stream düzgün konfiqurasiya edilməyib',
    errorTitleRequired: 'Zəhmət olmasa videonuz üçün başlıq daxil edin',
    errorUploadFileFailed: 'Fayl yüklənmədi: {{filename}}',
    errorVideoInErrorState: 'Bu videoda yükləmə xətası var',
    errorVideoNotFound: '"{{videoId}}" videosu mövcud deyil',
  },
}
