import type { PluginDefaultTranslationsObject } from '../types.js'

export const rsLatin: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Zatvori',
    mediaPreviewLabel: 'Pregled',
    mediaPreviewOpen: 'Otvori',
    mediaPreviewTitleAudio: 'Pregled audia',
    mediaPreviewTitleDocument: 'Pregled dokumenta',
    mediaPreviewTitleImage: 'Pregled slike',
    mediaPreviewTitleVideo: 'Pregled videa',

    // TUS Upload
    tusUploadChecking: 'Proveravam prethodna otpremanja...',
    tusUploadDisableMode: 'Isključi TUS režim',
    tusUploadEnableMode: 'Uključi TUS režim',
    tusUploadErrorFileType: 'Tip fajla nije dozvoljen',
    tusUploadErrorInitUpload: 'Nije uspešno pokretanje otpremanja',
    tusUploadErrorPrevCheckFail: 'Nije uspešna provera prethodnih otpremanja',
    tusUploadErrorRestoreUpload: 'Nije uspešno vraćanje otpremanja',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Završavam...',
    tusUploadPause: 'Pauza',
    tusUploadPreparing: 'Pripremam otpremanje...',
    tusUploadResume: 'Nastavi',
    tusUploadRetry: 'Pokušaj ponovo',
    tusUploadStartOver: 'Počni iznova',
    tusUploadStartUpload: 'Pokreni otpremanje',
    tusUploadStatusChecking: 'Proveravam prethodna otpremanja...',
    tusUploadStatusCompleted: 'Otpremanje uspešno završeno!',
    tusUploadStatusFinalizing: 'Završavam otpremanje...',
    tusUploadStatusIdle: 'Spremno za otpremanje',
    tusUploadStatusIdleWithRestore: 'Spremno za nastavak ili početak iznova',
    tusUploadStatusPaused: 'Otpremanje pauzirano na {{progress}}%',
    tusUploadStatusUploading: 'Otpremam... {{progress}}%',
    tusUploadTimeHours: 'č',
    tusUploadTimeMinutes: 'm',
    tusUploadTimeSeconds: 's',

    // Error messages
    errorAccessDenied: 'Nemate dozvolu za pristup ovom resursu',
    errorCannotUploadToVideo: 'Ne mogu da otpremim na ovaj video',
    errorCreateVideoFailed: 'Nije moguće kreirati video na Bunny CDN',
    errorDeleteFileFailed: 'Nije moguće obrisati fajl: {{filename}}',
    errorMissingRequiredFields: 'Nedostaju neke potrebne informacije',
    errorNoServiceConfigured: 'Nijedna usluga nije konfigurisana',
    errorStreamConfigMissing: 'Bunny Stream nije ispravno konfigurisan',
    errorTitleRequired: 'Molimo unesite naslov za vaš video',
    errorUploadFileFailed: 'Nije moguće otpremiti fajl: {{filename}}',
    errorVideoInErrorState: 'Ovaj video je imao grešku pri otpremanju',
    errorVideoNotFound: 'Video "{{videoId}}" ne postoji',
  },
}
