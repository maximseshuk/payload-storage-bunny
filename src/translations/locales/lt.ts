import type { PluginDefaultTranslationsObject } from '../types.js'

export const lt: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Tikrinami ankstesni įkėlimai...',
    tusUploadDisableMode: 'Išjungti TUS režimą',
    tusUploadEnableMode: 'Įjungti TUS režimą',
    tusUploadErrorFileType: 'Failo tipas neleidžiamas',
    tusUploadErrorInitUpload: 'Nepavyko inicijuoti įkėlimo',
    tusUploadErrorPrevCheckFail: 'Nepavyko patikrinti ankstesnių įkėlimų',
    tusUploadErrorRestoreUpload: 'Nepavyko atkurti įkėlimo',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Baigiama...',
    tusUploadPause: 'Pauzė',
    tusUploadPreparing: 'Ruošiamas įkėlimas...',
    tusUploadResume: 'Tęsti',
    tusUploadRetry: 'Bandyti dar kartą',
    tusUploadStartOver: 'Pradėti iš naujo',
    tusUploadStartUpload: 'Pradėti įkėlimą',
    tusUploadStatusChecking: 'Tikrinami ankstesni įkėlimai...',
    tusUploadStatusCompleted: 'Įkėlimas sėkmingai baigtas!',
    tusUploadStatusFinalizing: 'Baigiamas įkėlimas...',
    tusUploadStatusIdle: 'Pasiruošęs įkėlimui',
    tusUploadStatusIdleWithRestore: 'Pasiruošęs tęsti arba pradėti iš naujo',
    tusUploadStatusPaused: 'Įkėlimas pristabdytas {{progress}}%',
    tusUploadStatusUploading: 'Įkeliama... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Neturite leidimo pasiekti šį išteklių',
    errorCannotUploadToVideo: 'Negalima įkelti į šį vaizdo įrašą',
    errorCreateVideoFailed: 'Nepavyko sukurti vaizdo įrašo Bunny CDN',
    errorDeleteFileFailed: 'Nepavyko ištrinti failo: {{filename}}',
    errorInternalServer: 'Kažkas nepavyko mūsų pusėje',
    errorMissingRequiredFields: 'Trūksta reikalingos informacijos',
    errorStreamConfigMissing: 'Bunny Stream nėra tinkamai sukonfigūruotas',
    errorTitleRequired: 'Prašome įvesti savo vaizdo įrašo pavadinimą',
    errorUploadFileFailed: 'Nepavyko įkelti failo: {{filename}}',
    errorVideoInErrorState: 'Šis vaizdo įrašas turėjo įkėlimo klaidą',
    errorVideoNotFound: 'Vaizdo įrašas "{{videoId}}" neegzistuoja',
  },
}
