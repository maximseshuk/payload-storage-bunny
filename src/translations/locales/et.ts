import type { PluginDefaultTranslationsObject } from '../types.js'

export const et: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Kontrollitakse eelnevaid üleslaadimisi...',
    tusUploadDisableMode: 'Keela TUS režiim',
    tusUploadEnableMode: 'Luba TUS režiim',
    tusUploadErrorFileType: 'Failitüüp pole lubatud',
    tusUploadErrorInitUpload: 'Üleslaadimise käivitamine ebaõnnestus',
    tusUploadErrorPrevCheckFail: 'Eelnevate üleslaadimiste kontroll ebaõnnestus',
    tusUploadErrorRestoreUpload: 'Üleslaadimise taastamine ebaõnnestus',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Lõpuletamine...',
    tusUploadPause: 'Paus',
    tusUploadPreparing: 'Üleslaadimise ettevalmistamine...',
    tusUploadResume: 'Jätka',
    tusUploadRetry: 'Proovi uuesti',
    tusUploadStartOver: 'Alusta otsast',
    tusUploadStartUpload: 'Alusta üleslaadimist',
    tusUploadStatusChecking: 'Kontrollitakse eelnevaid üleslaadimisi...',
    tusUploadStatusCompleted: 'Üleslaadimine õnnestus!',
    tusUploadStatusFinalizing: 'Üleslaadimise lõpuletamine...',
    tusUploadStatusIdle: 'Valmis üleslaadimiseks',
    tusUploadStatusIdleWithRestore: 'Valmis jätkamiseks või uuesti alustamiseks',
    tusUploadStatusPaused: 'Üleslaadimine peatatud {{progress}}% juures',
    tusUploadStatusUploading: 'Laaditakse üles... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Teil pole õigust sellele ressursile juurdepääsuks',
    errorCannotUploadToVideo: 'Sellesse videosse ei saa üles laadida',
    errorCreateVideoFailed: 'Bunny CDN-is video loomine ebaõnnestus',
    errorDeleteFileFailed: 'Faili kustutamine ebaõnnestus: {{filename}}',
    errorInternalServer: 'Meie poolel läks midagi valesti',
    errorMissingRequiredFields: 'Mõned nõutavad andmed puuduvad',
    errorNoServiceConfigured: 'Ühtegi teenust pole konfigureeritud',
    errorStreamConfigMissing: 'Bunny Stream pole õigesti seadistatud',
    errorTitleRequired: 'Palun sisestage oma video pealkiri',
    errorUploadFileFailed: 'Faili üleslaadimine ebaõnnestus: {{filename}}',
    errorVideoInErrorState: 'Sellel videol oli üleslaadimise viga',
    errorVideoNotFound: 'Videot "{{videoId}}" ei ole olemas',
  },
}
