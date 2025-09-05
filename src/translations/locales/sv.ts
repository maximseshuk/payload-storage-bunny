import type { PluginDefaultTranslationsObject } from '../types.js'

export const sv: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Kontrollerar tidigare uppladdningar...',
    tusUploadDisableMode: 'Inaktivera TUS-läge',
    tusUploadEnableMode: 'Aktivera TUS-läge',
    tusUploadErrorFileType: 'Filtyp inte tillåten',
    tusUploadErrorInitUpload: 'Kunde inte initiera uppladdning',
    tusUploadErrorPrevCheckFail: 'Kunde inte kontrollera tidigare uppladdningar',
    tusUploadErrorRestoreUpload: 'Kunde inte återställa uppladdning',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Slutför...',
    tusUploadPause: 'Pausa',
    tusUploadPreparing: 'Förbereder uppladdning...',
    tusUploadResume: 'Återuppta',
    tusUploadRetry: 'Försök igen',
    tusUploadStartOver: 'Börja om',
    tusUploadStartUpload: 'Starta uppladdning',
    tusUploadStatusChecking: 'Kontrollerar tidigare uppladdningar...',
    tusUploadStatusCompleted: 'Uppladdning slutförd framgångsrikt!',
    tusUploadStatusFinalizing: 'Slutför uppladdning...',
    tusUploadStatusIdle: 'Redo för uppladdning',
    tusUploadStatusIdleWithRestore: 'Redo att återuppta eller börja om',
    tusUploadStatusPaused: 'Uppladdning pausad vid {{progress}}%',
    tusUploadStatusUploading: 'Laddar upp... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Du har inte behörighet att komma åt denna resurs',
    errorCannotUploadToVideo: 'Kan inte ladda upp till denna video',
    errorCreateVideoFailed: 'Kunde inte skapa video på Bunny CDN',
    errorDeleteFileFailed: 'Kunde inte radera fil: {{filename}}',
    errorInternalServer: 'Något gick fel på vår sida',
    errorMissingRequiredFields: 'Viss nödvändig information saknas',
    errorStreamConfigMissing: 'Bunny Stream är inte korrekt konfigurerat',
    errorTitleRequired: 'Vänligen ange en titel för din video',
    errorUploadFileFailed: 'Kunde inte ladda upp fil: {{filename}}',
    errorVideoInErrorState: 'Denna video hade ett uppladdningsfel',
    errorVideoNotFound: 'Video "{{videoId}}" finns inte',
  },
}
