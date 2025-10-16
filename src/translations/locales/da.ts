import type { PluginDefaultTranslationsObject } from '../types.js'

export const da: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Luk',
    mediaPreviewLabel: 'Forhåndsvisning',
    mediaPreviewOpen: 'Åbn',
    mediaPreviewTitleAudio: 'Lydforhåndsvisning',
    mediaPreviewTitleDocument: 'Dokumentforhåndsvisning',
    mediaPreviewTitleImage: 'Billedforhåndsvisning',
    mediaPreviewTitleVideo: 'Videoforhåndsvisning',

    // TUS Upload
    tusUploadChecking: 'Tjekker tidligere uploads...',
    tusUploadDisableMode: 'Deaktiver TUS tilstand',
    tusUploadEnableMode: 'Aktiver TUS tilstand',
    tusUploadErrorFileType: 'Filtype ikke tilladt',
    tusUploadErrorInitUpload: 'Kunne ikke initialisere upload',
    tusUploadErrorPrevCheckFail: 'Kunne ikke tjekke tidligere uploads',
    tusUploadErrorRestoreUpload: 'Kunne ikke gendanne upload',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Færdiggører...',
    tusUploadPause: 'Pause',
    tusUploadPreparing: 'Forbereder upload...',
    tusUploadResume: 'Genoptag',
    tusUploadRetry: 'Prøv igen',
    tusUploadStartOver: 'Start forfra',
    tusUploadStartUpload: 'Start upload',
    tusUploadStatusChecking: 'Tjekker tidligere uploads...',
    tusUploadStatusCompleted: 'Upload gennemført succesfuldt!',
    tusUploadStatusFinalizing: 'Færdiggører upload...',
    tusUploadStatusIdle: 'Klar til upload',
    tusUploadStatusIdleWithRestore: 'Klar til at genoptage eller starte forfra',
    tusUploadStatusPaused: 'Upload sat på pause ved {{progress}}%',
    tusUploadStatusUploading: 'Uploader... {{progress}}%',
    tusUploadTimeHours: 't',
    tusUploadTimeMinutes: 'm',
    tusUploadTimeSeconds: 's',

    // Error messages
    errorAccessDenied: 'Du har ikke tilladelse til at få adgang til denne ressource',
    errorCannotUploadToVideo: 'Denne video kan ikke uploades til',
    errorCreateVideoFailed: 'Kunne ikke oprette video på Bunny CDN',
    errorDeleteFileFailed: 'Kunne ikke slette fil: {{filename}}',
    errorMissingRequiredFields: 'Nogle nødvendige oplysninger mangler',
    errorNoServiceConfigured: 'Ingen service konfigureret',
    errorStreamConfigMissing: 'Bunny Stream er ikke konfigureret korrekt',
    errorTitleRequired: 'Indtast venligst en titel til din video',
    errorUploadFileFailed: 'Kunne ikke uploade fil: {{filename}}',
    errorVideoInErrorState: 'Denne video havde en upload fejl',
    errorVideoNotFound: 'Video "{{videoId}}" findes ikke',
  },
}
