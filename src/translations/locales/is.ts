import type { PluginDefaultTranslationsObject } from '../types.js'

export const is: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Athuga fyrri upphal...',
    tusUploadDisableMode: 'Slökkva á TUS stillingu',
    tusUploadEnableMode: 'Kveikja á TUS stillingu',
    tusUploadErrorFileType: 'Skráartegund ekki leyfð',
    tusUploadErrorInitUpload: 'Mistókst að hefja upphal',
    tusUploadErrorPrevCheckFail: 'Mistókst að athuga fyrri upphal',
    tusUploadErrorRestoreUpload: 'Mistókst að endurheimta upphal',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Klára...',
    tusUploadPause: 'Hlé',
    tusUploadPreparing: 'Undirbý upphal...',
    tusUploadResume: 'Halda áfram',
    tusUploadRetry: 'Reyna aftur',
    tusUploadStartOver: 'Byrja aftur',
    tusUploadStartUpload: 'Byrja upphal',
    tusUploadStatusChecking: 'Athuga fyrri upphal...',
    tusUploadStatusCompleted: 'Upphal tókst!',
    tusUploadStatusFinalizing: 'Klára upphal...',
    tusUploadStatusIdle: 'Tilbúið í upphal',
    tusUploadStatusIdleWithRestore: 'Tilbúið að halda áfram eða byrja aftur',
    tusUploadStatusPaused: 'Upphal á hlé við {{progress}}%',
    tusUploadStatusUploading: 'Hleð upp... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Þú hefur ekki heimild til að nálgast þetta tilfang',
    errorCannotUploadToVideo: 'Ekki er hægt að hlaða upp í þetta myndskeið',
    errorCreateVideoFailed: 'Mistókst að búa til myndskeið á Bunny CDN',
    errorDeleteFileFailed: 'Mistókst að eyða skrá: {{filename}}',
    errorInternalServer: 'Eitthvað fór úrskeiðis hjá okkur',
    errorMissingRequiredFields: 'Sumar nauðsynlegar upplýsingar vantar',
    errorStreamConfigMissing: 'Bunny Stream er ekki rétt stillt',
    errorTitleRequired: 'Vinsamlegast sláðu inn titil fyrir myndskeiðið þitt',
    errorUploadFileFailed: 'Mistókst að hlaða upp skrá: {{filename}}',
    errorVideoInErrorState: 'Þetta myndskeið fékk villa við upphal',
    errorVideoNotFound: 'Myndskeið "{{videoId}}" er ekki til',
  },
}
