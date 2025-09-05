import type { PluginDefaultTranslationsObject } from '../types.js'

export const rsLatin: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
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

    // Error messages
    errorAccessDenied: 'Nemate dozvolu za pristup ovom resursu',
    errorCannotUploadToVideo: 'Ne mogu da otpremim na ovaj video',
    errorCreateVideoFailed: 'Nije moguće kreirati video na Bunny CDN',
    errorDeleteFileFailed: 'Nije moguće obrisati fajl: {{filename}}',
    errorInternalServer: 'Nešto je pošlo po zlo sa naše strane',
    errorMissingRequiredFields: 'Nedostaju neke potrebne informacije',
    errorStreamConfigMissing: 'Bunny Stream nije ispravno konfigurisan',
    errorTitleRequired: 'Molimo unesite naslov za vaš video',
    errorUploadFileFailed: 'Nije moguće otpremiti fajl: {{filename}}',
    errorVideoInErrorState: 'Ovaj video je imao grešku pri otpremanju',
    errorVideoNotFound: 'Video "{{videoId}}" ne postoji',
  },
}
