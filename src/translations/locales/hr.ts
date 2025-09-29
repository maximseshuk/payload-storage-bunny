import type { PluginDefaultTranslationsObject } from '../types.js'

export const hr: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Provjera prethodnih preuzimanja...',
    tusUploadDisableMode: 'Onemogući TUS način rada',
    tusUploadEnableMode: 'Omogući TUS način rada',
    tusUploadErrorFileType: 'Tip datoteke nije dozvoljen',
    tusUploadErrorInitUpload: 'Neuspješno pokretanje prijenosa',
    tusUploadErrorPrevCheckFail: 'Neuspješna provjera prethodnih prijenosa',
    tusUploadErrorRestoreUpload: 'Neuspješno vraćanje prijenosa',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Završavam...',
    tusUploadPause: 'Pauza',
    tusUploadPreparing: 'Pripremam prijenos...',
    tusUploadResume: 'Nastavi',
    tusUploadRetry: 'Pokušaj ponovno',
    tusUploadStartOver: 'Počni iznova',
    tusUploadStartUpload: 'Pokreni prijenos',
    tusUploadStatusChecking: 'Provjera prethodnih prijenosa...',
    tusUploadStatusCompleted: 'Prijenos uspješno završen!',
    tusUploadStatusFinalizing: 'Završavam prijenos...',
    tusUploadStatusIdle: 'Spreman za prijenos',
    tusUploadStatusIdleWithRestore: 'Spreman za nastavak ili početak iznova',
    tusUploadStatusPaused: 'Prijenos pauziran na {{progress}}%',
    tusUploadStatusUploading: 'Prijenos u tijeku... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Nemate dozvolu za pristup ovom resursu',
    errorCannotUploadToVideo: 'Ne mogu prenijeti na ovaj video',
    errorCreateVideoFailed: 'Nije moguće kreirati video na Bunny CDN',
    errorDeleteFileFailed: 'Nije moguće obrisati datoteku: {{filename}}',
    errorInternalServer: 'Nešto je pošlo po zlu s naše strane',
    errorMissingRequiredFields: 'Nedostaju neke potrebne informacije',
    errorNoServiceConfigured: 'Nijedna usluga nije konfigurirana',
    errorStreamConfigMissing: 'Bunny Stream nije ispravno konfiguriran',
    errorTitleRequired: 'Molimo unesite naslov za svoj video',
    errorUploadFileFailed: 'Nije moguće prenijeti datoteku: {{filename}}',
    errorVideoInErrorState: 'Ovaj video je imao grešku pri prijenosu',
    errorVideoNotFound: 'Video "{{videoId}}" ne postoji',
  },
}
