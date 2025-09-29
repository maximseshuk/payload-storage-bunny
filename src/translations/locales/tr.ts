import type { PluginDefaultTranslationsObject } from '../types.js'

export const tr: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Önceki yüklemeler kontrol ediliyor...',
    tusUploadDisableMode: 'TUS modunu devre dışı bırak',
    tusUploadEnableMode: 'TUS modunu etkinleştir',
    tusUploadErrorFileType: 'Dosya türüne izin verilmiyor',
    tusUploadErrorInitUpload: 'Yükleme başlatılamadı',
    tusUploadErrorPrevCheckFail: 'Önceki yüklemeler kontrol edilemedi',
    tusUploadErrorRestoreUpload: 'Yükleme geri yüklenemedi',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Tamamlanıyor...',
    tusUploadPause: 'Duraklat',
    tusUploadPreparing: 'Yükleme hazırlanıyor...',
    tusUploadResume: 'Devam et',
    tusUploadRetry: 'Tekrar dene',
    tusUploadStartOver: 'Baştan başla',
    tusUploadStartUpload: 'Yüklemeyi başlat',
    tusUploadStatusChecking: 'Önceki yüklemeler kontrol ediliyor...',
    tusUploadStatusCompleted: 'Yükleme başarıyla tamamlandı!',
    tusUploadStatusFinalizing: 'Yükleme tamamlanıyor...',
    tusUploadStatusIdle: 'Yükleme için hazır',
    tusUploadStatusIdleWithRestore: 'Devam etmeye veya baştan başlamaya hazır',
    tusUploadStatusPaused: 'Yükleme %{{progress}} oranında duraklatıldı',
    tusUploadStatusUploading: 'Yükleniyor... %{{progress}}',

    // Error messages
    errorAccessDenied: 'Bu kaynağa erişim izniniz yok',
    errorCannotUploadToVideo: 'Bu videoya yükleme yapılamıyor',
    errorCreateVideoFailed: 'Bunny CDN\'de video oluşturulamadı',
    errorDeleteFileFailed: 'Dosya silinemedi: {{filename}}',
    errorInternalServer: 'Bizim tarafımızda bir şeyler ters gitti',
    errorMissingRequiredFields: 'Bazı gerekli bilgiler eksik',
    errorNoServiceConfigured: 'Hiçbir hizmet yapılandırılmamış',
    errorStreamConfigMissing: 'Bunny Stream düzgün yapılandırılmamış',
    errorTitleRequired: 'Lütfen videonuz için bir başlık girin',
    errorUploadFileFailed: 'Dosya yüklenemedi: {{filename}}',
    errorVideoInErrorState: 'Bu videoda yükleme hatası oldu',
    errorVideoNotFound: '"{{videoId}}" videosu mevcut değil',
  },
}
