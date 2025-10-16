import type { PluginDefaultTranslationsObject } from '../types.js'

export const en: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Close',
    mediaPreviewLabel: 'Preview',
    mediaPreviewOpen: 'Open',
    mediaPreviewTitleAudio: 'Audio preview',
    mediaPreviewTitleDocument: 'Document preview',
    mediaPreviewTitleImage: 'Image preview',
    mediaPreviewTitleVideo: 'Video preview',

    // TUS Upload
    tusUploadChecking: 'Checking previous uploads...',
    tusUploadDisableMode: 'Disable tus mode',
    tusUploadEnableMode: 'Enable tus mode',
    tusUploadErrorFileType: 'File type not allowed',
    tusUploadErrorInitUpload: 'Failed to initialize upload',
    tusUploadErrorPrevCheckFail: 'Failed to check previous uploads',
    tusUploadErrorRestoreUpload: 'Failed to restore upload',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Finalizing...',
    tusUploadPause: 'Pause',
    tusUploadPreparing: 'Preparing upload...',
    tusUploadResume: 'Resume',
    tusUploadRetry: 'Retry',
    tusUploadStartOver: 'Start over',
    tusUploadStartUpload: 'Start upload',
    tusUploadStatusChecking: 'Checking previous uploads...',
    tusUploadStatusCompleted: 'Upload completed successfully!',
    tusUploadStatusFinalizing: 'Finalizing upload...',
    tusUploadStatusIdle: 'Ready to upload',
    tusUploadStatusIdleWithRestore: 'Ready to resume or start over',
    tusUploadStatusPaused: 'Upload paused at {{progress}}%',
    tusUploadStatusUploading: 'Uploading... {{progress}}%',
    tusUploadTimeHours: 'h',

    tusUploadTimeMinutes: 'm', tusUploadTimeSeconds: 's',

    // Error messages
    errorAccessDenied: 'You don\'t have permission to access this resource',
    errorCannotUploadToVideo: 'This video can\'t be uploaded to',
    errorCreateVideoFailed: 'Couldn\'t create video on Bunny CDN',
    errorDeleteFileFailed: 'Couldn\'t delete file: {{filename}}',
    errorMissingRequiredFields: 'Some required information is missing',
    errorNoServiceConfigured: 'No service configured',
    errorStreamConfigMissing: 'Bunny Stream isn\'t configured properly',
    errorTitleRequired: 'Please enter a title for your video',
    errorUploadFileFailed: 'Couldn\'t upload file: {{filename}}',
    errorVideoInErrorState: 'This video had an upload error',
    errorVideoNotFound: 'Video "{{videoId}}" doesn\'t exist',
  },
}
