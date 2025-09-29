export type PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Error messages
    errorAccessDenied: string
    errorCannotUploadToVideo: string
    errorCreateVideoFailed: string
    errorDeleteFileFailed: string
    errorInternalServer: string
    errorMissingRequiredFields: string
    errorNoServiceConfigured: string
    errorStreamConfigMissing: string
    errorTitleRequired: string
    errorUploadFileFailed: string
    errorVideoInErrorState: string
    errorVideoNotFound: string

    // TUS Upload
    tusUploadChecking: string
    tusUploadDisableMode: string
    tusUploadEnableMode: string
    tusUploadErrorFileType: string
    tusUploadErrorInitUpload: string
    tusUploadErrorPrevCheckFail: string
    tusUploadErrorRestoreUpload: string
    tusUploadFileSize: string
    tusUploadFinalizing: string
    tusUploadPause: string
    tusUploadPreparing: string
    tusUploadResume: string
    tusUploadRetry: string
    tusUploadStartOver: string
    tusUploadStartUpload: string
    tusUploadStatusChecking: string
    tusUploadStatusCompleted: string
    tusUploadStatusFinalizing: string
    tusUploadStatusIdle: string
    tusUploadStatusIdleWithRestore: string
    tusUploadStatusPaused: string
    tusUploadStatusUploading: string
  }
}
