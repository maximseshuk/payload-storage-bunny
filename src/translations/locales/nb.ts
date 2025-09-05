import type { PluginDefaultTranslationsObject } from '../types.js'

export const nb: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Sjekker tidligere opplastinger...',
    tusUploadDisableMode: 'Deaktiver TUS-modus',
    tusUploadEnableMode: 'Aktiver TUS-modus',
    tusUploadErrorFileType: 'Filtype ikke tillatt',
    tusUploadErrorInitUpload: 'Kunne ikke starte opplastingen',
    tusUploadErrorPrevCheckFail: 'Kunne ikke sjekke tidligere opplastinger',
    tusUploadErrorRestoreUpload: 'Kunne ikke gjenopprette opplastingen',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Fullfører...',
    tusUploadPause: 'Pause',
    tusUploadPreparing: 'Forbereder opplasting...',
    tusUploadResume: 'Gjenoppta',
    tusUploadRetry: 'Prøv igjen',
    tusUploadStartOver: 'Start på nytt',
    tusUploadStartUpload: 'Start opplasting',
    tusUploadStatusChecking: 'Sjekker tidligere opplastinger...',
    tusUploadStatusCompleted: 'Opplasting fullført!',
    tusUploadStatusFinalizing: 'Fullfører opplasting...',
    tusUploadStatusIdle: 'Klar for opplasting',
    tusUploadStatusIdleWithRestore: 'Klar for å gjenoppta eller starte på nytt',
    tusUploadStatusPaused: 'Opplasting satt på pause ved {{progress}}%',
    tusUploadStatusUploading: 'Laster opp... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Du har ikke tilgang til denne ressursen',
    errorCannotUploadToVideo: 'Kan ikke laste opp til denne videoen',
    errorCreateVideoFailed: 'Kunne ikke opprette video på Bunny CDN',
    errorDeleteFileFailed: 'Kunne ikke slette fil: {{filename}}',
    errorInternalServer: 'Noe gikk galt på vår side',
    errorMissingRequiredFields: 'Noe nødvendig informasjon mangler',
    errorStreamConfigMissing: 'Bunny Stream er ikke riktig konfigurert',
    errorTitleRequired: 'Vennligst skriv inn en tittel for videoen din',
    errorUploadFileFailed: 'Kunne ikke laste opp fil: {{filename}}',
    errorVideoInErrorState: 'Denne videoen hadde en opplastingsfeil',
    errorVideoNotFound: 'Video "{{videoId}}" finnes ikke',
  },
}
