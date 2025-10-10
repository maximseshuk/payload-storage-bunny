import type { PluginDefaultTranslationsObject } from '../types.js'

export const nl: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Sluiten',
    mediaPreviewLabel: 'Voorbeeld',
    mediaPreviewOpen: 'Openen',
    mediaPreviewTitleAudio: 'Audio preview',
    mediaPreviewTitleDocument: 'Document preview',
    mediaPreviewTitleImage: 'Afbeelding preview',
    mediaPreviewTitleVideo: 'Video preview',

    // TUS Upload
    tusUploadChecking: 'Vorige uploads controleren...',
    tusUploadDisableMode: 'TUS-modus uitschakelen',
    tusUploadEnableMode: 'TUS-modus inschakelen',
    tusUploadErrorFileType: 'Bestandstype niet toegestaan',
    tusUploadErrorInitUpload: 'Upload kon niet geïnitialiseerd worden',
    tusUploadErrorPrevCheckFail: 'Vorige uploads konden niet gecontroleerd worden',
    tusUploadErrorRestoreUpload: 'Upload kon niet hersteld worden',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Afronden...',
    tusUploadPause: 'Pauzeren',
    tusUploadPreparing: 'Upload voorbereiden...',
    tusUploadResume: 'Hervatten',
    tusUploadRetry: 'Opnieuw proberen',
    tusUploadStartOver: 'Opnieuw beginnen',
    tusUploadStartUpload: 'Upload starten',
    tusUploadStatusChecking: 'Vorige uploads controleren...',
    tusUploadStatusCompleted: 'Upload succesvol afgerond!',
    tusUploadStatusFinalizing: 'Upload afronden...',
    tusUploadStatusIdle: 'Klaar voor upload',
    tusUploadStatusIdleWithRestore: 'Klaar om te hervatten of opnieuw te beginnen',
    tusUploadStatusPaused: 'Upload gepauzeerd op {{progress}}%',
    tusUploadStatusUploading: 'Uploaden... {{progress}}%',

    // Error messages
    errorAccessDenied: 'U heeft geen toestemming om deze bron te benaderen',
    errorCannotUploadToVideo: 'Naar deze video kan niet geüpload worden',
    errorCreateVideoFailed: 'Video kon niet worden aangemaakt op Bunny CDN',
    errorDeleteFileFailed: 'Bestand kon niet worden verwijderd: {{filename}}',
    errorMissingRequiredFields: 'Enkele vereiste gegevens ontbreken',
    errorNoServiceConfigured: 'Geen service geconfigureerd',
    errorStreamConfigMissing: 'Bunny Stream is niet correct geconfigureerd',
    errorTitleRequired: 'Voer alstublieft een titel in voor uw video',
    errorUploadFileFailed: 'Bestand kon niet worden geüpload: {{filename}}',
    errorVideoInErrorState: 'Deze video heeft een uploadfout gehad',
    errorVideoNotFound: 'Video "{{videoId}}" bestaat niet',
  },
}
