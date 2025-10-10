import type { PluginDefaultTranslationsObject } from '../types.js'

export const sl: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Zapri',
    mediaPreviewLabel: 'Predogled',
    mediaPreviewOpen: 'Odpri',
    mediaPreviewTitleAudio: 'Predogled zvoka',
    mediaPreviewTitleDocument: 'Predogled dokumenta',
    mediaPreviewTitleImage: 'Predogled slike',
    mediaPreviewTitleVideo: 'Predogled videa',

    // TUS Upload
    tusUploadChecking: 'Preverjam prejšnje nalaganja...',
    tusUploadDisableMode: 'Onemogoči TUS način',
    tusUploadEnableMode: 'Omogoči TUS način',
    tusUploadErrorFileType: 'Tip datoteke ni dovoljen',
    tusUploadErrorInitUpload: 'Ni uspešno zagnati nalaganja',
    tusUploadErrorPrevCheckFail: 'Ni uspešno preveriti prejšnja nalaganja',
    tusUploadErrorRestoreUpload: 'Ni uspešno obnoviti nalaganja',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Zaključujem...',
    tusUploadPause: 'Pavza',
    tusUploadPreparing: 'Pripravljam nalaganje...',
    tusUploadResume: 'Nadaljuj',
    tusUploadRetry: 'Poskusi znova',
    tusUploadStartOver: 'Začni znova',
    tusUploadStartUpload: 'Začni nalaganje',
    tusUploadStatusChecking: 'Preverjam prejšnja nalaganja...',
    tusUploadStatusCompleted: 'Nalaganje uspešno zaključeno!',
    tusUploadStatusFinalizing: 'Zaključujem nalaganje...',
    tusUploadStatusIdle: 'Pripravljeno za nalaganje',
    tusUploadStatusIdleWithRestore: 'Pripravljeno za nadaljevanje ali začetek znova',
    tusUploadStatusPaused: 'Nalaganje pavzirano na {{progress}}%',
    tusUploadStatusUploading: 'Nalagam... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Nimate dovoljenja za dostop do tega vira',
    errorCannotUploadToVideo: 'V ta video ni mogoče naložiti',
    errorCreateVideoFailed: 'Ni bilo mogoče ustvariti videa na Bunny CDN',
    errorDeleteFileFailed: 'Ni bilo mogoče izbrisati datoteke: {{filename}}',
    errorMissingRequiredFields: 'Manjkajo nekatere potrebne informacije',
    errorNoServiceConfigured: 'Ni konfigurirana nobena storitev',
    errorStreamConfigMissing: 'Bunny Stream ni pravilno konfiguriran',
    errorTitleRequired: 'Prosimo vnesite naslov vašega videa',
    errorUploadFileFailed: 'Ni bilo mogoče naložiti datoteke: {{filename}}',
    errorVideoInErrorState: 'Ta video je imel napako pri nalaganju',
    errorVideoNotFound: 'Video "{{videoId}}" ne obstaja',
  },
}
