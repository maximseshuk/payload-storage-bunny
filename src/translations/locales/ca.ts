import type { PluginDefaultTranslationsObject } from '../types.js'

export const ca: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Tancar',
    mediaPreviewLabel: 'Vista prèvia',
    mediaPreviewOpen: 'Obrir',
    mediaPreviewTitleAudio: 'Previsualització d\'àudio',
    mediaPreviewTitleDocument: 'Previsualització de document',
    mediaPreviewTitleImage: 'Previsualització d\'imatge',
    mediaPreviewTitleVideo: 'Previsualització de vídeo',

    // TUS Upload
    tusUploadChecking: 'Comprovant càrregues anteriors...',
    tusUploadDisableMode: 'Desactivar mode TUS',
    tusUploadEnableMode: 'Activar mode TUS',
    tusUploadErrorFileType: 'Tipus de fitxer no permès',
    tusUploadErrorInitUpload: 'No s\'ha pogut inicialitzar la càrrega',
    tusUploadErrorPrevCheckFail: 'No s\'han pogut comprovar les càrregues anteriors',
    tusUploadErrorRestoreUpload: 'No s\'ha pogut restaurar la càrrega',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Finalitzant...',
    tusUploadPause: 'Pausa',
    tusUploadPreparing: 'Preparant la càrrega...',
    tusUploadResume: 'Reprendre',
    tusUploadRetry: 'Tornar a intentar',
    tusUploadStartOver: 'Començar de nou',
    tusUploadStartUpload: 'Iniciar càrrega',
    tusUploadStatusChecking: 'Comprovant càrregues anteriors...',
    tusUploadStatusCompleted: 'Càrrega completada amb èxit!',
    tusUploadStatusFinalizing: 'Finalitzant càrrega...',
    tusUploadStatusIdle: 'Llest per carregar',
    tusUploadStatusIdleWithRestore: 'Llest per reprendre o començar de nou',
    tusUploadStatusPaused: 'Càrrega pausada al {{progress}}%',
    tusUploadStatusUploading: 'Carregant... {{progress}}%',

    // Error messages
    errorAccessDenied: 'No tens permís per accedir a aquest recurs',
    errorCannotUploadToVideo: 'No es pot carregar a aquest vídeo',
    errorCreateVideoFailed: 'No s\'ha pogut crear el vídeo a Bunny CDN',
    errorDeleteFileFailed: 'No s\'ha pogut eliminar el fitxer: {{filename}}',
    errorMissingRequiredFields: 'Falta alguna informació necessària',
    errorNoServiceConfigured: 'No s\'ha configurat cap servei',
    errorStreamConfigMissing: 'Bunny Stream no està configurat correctament',
    errorTitleRequired: 'Si us plau, introduïu un títol per al vostre vídeo',
    errorUploadFileFailed: 'No s\'ha pogut carregar el fitxer: {{filename}}',
    errorVideoInErrorState: 'Aquest vídeo ha tingut un error de càrrega',
    errorVideoNotFound: 'El vídeo "{{videoId}}" no existeix',
  },
}
