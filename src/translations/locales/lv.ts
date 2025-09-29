import type { PluginDefaultTranslationsObject } from '../types.js'

export const lv: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Pārbauda iepriekšējās augšupielādes...',
    tusUploadDisableMode: 'Atspējot TUS režīmu',
    tusUploadEnableMode: 'Iespējot TUS režīmu',
    tusUploadErrorFileType: 'Faila tips nav atļauts',
    tusUploadErrorInitUpload: 'Neizdevās inicializēt augšupielādi',
    tusUploadErrorPrevCheckFail: 'Neizdevās pārbaudīt iepriekšējās augšupielādes',
    tusUploadErrorRestoreUpload: 'Neizdevās atjaunot augšupielādi',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Pabeidz...',
    tusUploadPause: 'Pauze',
    tusUploadPreparing: 'Sagatavo augšupielādi...',
    tusUploadResume: 'Turpināt',
    tusUploadRetry: 'Mēģināt vēlreiz',
    tusUploadStartOver: 'Sākt no sākuma',
    tusUploadStartUpload: 'Sākt augšupielādi',
    tusUploadStatusChecking: 'Pārbauda iepriekšējās augšupielādes...',
    tusUploadStatusCompleted: 'Augšupielāde veiksmīgi pabeigta!',
    tusUploadStatusFinalizing: 'Pabeidz augšupielādi...',
    tusUploadStatusIdle: 'Gatavs augšupielādei',
    tusUploadStatusIdleWithRestore: 'Gatavs turpināt vai sākt no sākuma',
    tusUploadStatusPaused: 'Augšupielāde apturēta {{progress}}%',
    tusUploadStatusUploading: 'Augšupielādē... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Jums nav atļaujas piekļūt šim resursam',
    errorCannotUploadToVideo: 'Uz šo video nevar augšupielādēt',
    errorCreateVideoFailed: 'Neizdevās izveidot video Bunny CDN',
    errorDeleteFileFailed: 'Neizdevās dzēst failu: {{filename}}',
    errorInternalServer: 'Kaut kas nogāja greizi mūsu pusē',
    errorMissingRequiredFields: 'Trūkst nepieciešamas informācijas',
    errorNoServiceConfigured: 'Nav konfigurēts neviens pakalpojums',
    errorStreamConfigMissing: 'Bunny Stream nav pareizi konfigurēts',
    errorTitleRequired: 'Lūdzu, ievadiet sava video nosaukumu',
    errorUploadFileFailed: 'Neizdevās augšupielādēt failu: {{filename}}',
    errorVideoInErrorState: 'Šim video bija augšupielādes kļūda',
    errorVideoNotFound: 'Video "{{videoId}}" neeksistē',
  },
}
