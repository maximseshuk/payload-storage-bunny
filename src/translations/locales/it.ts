import type { PluginDefaultTranslationsObject } from '../types.js'

export const it: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Verifica caricamenti precedenti...',
    tusUploadDisableMode: 'Disabilita modalità TUS',
    tusUploadEnableMode: 'Abilita modalità TUS',
    tusUploadErrorFileType: 'Tipo di file non consentito',
    tusUploadErrorInitUpload: 'Impossibile inizializzare il caricamento',
    tusUploadErrorPrevCheckFail: 'Impossibile verificare i caricamenti precedenti',
    tusUploadErrorRestoreUpload: 'Impossibile ripristinare il caricamento',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Finalizzazione...',
    tusUploadPause: 'Pausa',
    tusUploadPreparing: 'Preparazione caricamento...',
    tusUploadResume: 'Riprendi',
    tusUploadRetry: 'Riprova',
    tusUploadStartOver: 'Ricomincia',
    tusUploadStartUpload: 'Inizia caricamento',
    tusUploadStatusChecking: 'Verifica caricamenti precedenti...',
    tusUploadStatusCompleted: 'Caricamento completato con successo!',
    tusUploadStatusFinalizing: 'Finalizzazione caricamento...',
    tusUploadStatusIdle: 'Pronto per il caricamento',
    tusUploadStatusIdleWithRestore: 'Pronto per riprendere o ricominciare',
    tusUploadStatusPaused: 'Caricamento in pausa al {{progress}}%',
    tusUploadStatusUploading: 'Caricamento in corso... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Non hai il permesso di accedere a questa risorsa',
    errorCannotUploadToVideo: 'Impossibile caricare su questo video',
    errorCreateVideoFailed: 'Impossibile creare il video su Bunny CDN',
    errorDeleteFileFailed: 'Impossibile eliminare il file: {{filename}}',
    errorInternalServer: 'Qualcosa è andato storto dal nostro lato',
    errorMissingRequiredFields: 'Mancano alcune informazioni richieste',
    errorNoServiceConfigured: 'Nessun servizio configurato',
    errorStreamConfigMissing: 'Bunny Stream non è configurato correttamente',
    errorTitleRequired: 'Per favore inserisci un titolo per il tuo video',
    errorUploadFileFailed: 'Impossibile caricare il file: {{filename}}',
    errorVideoInErrorState: 'Questo video ha avuto un errore di caricamento',
    errorVideoNotFound: 'Il video "{{videoId}}" non esiste',
  },
}
