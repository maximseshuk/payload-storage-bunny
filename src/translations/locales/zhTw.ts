import type { PluginDefaultTranslationsObject } from '../types.js'

export const zhTw: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: '關閉',
    mediaPreviewLabel: '預覽',
    mediaPreviewOpen: '開啟',
    mediaPreviewTitleAudio: '音訊預覽',
    mediaPreviewTitleDocument: '文件預覽',
    mediaPreviewTitleImage: '圖片預覽',
    mediaPreviewTitleVideo: '影片預覽',

    // TUS Upload
    tusUploadChecking: '正在檢查之前的上傳...',
    tusUploadDisableMode: '停用 TUS 模式',
    tusUploadEnableMode: '啟用 TUS 模式',
    tusUploadErrorFileType: '檔案類型不被允許',
    tusUploadErrorInitUpload: '初始化上傳失敗',
    tusUploadErrorPrevCheckFail: '檢查之前的上傳失敗',
    tusUploadErrorRestoreUpload: '恢復上傳失敗',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: '正在完成...',
    tusUploadPause: '暫停',
    tusUploadPreparing: '正在準備上傳...',
    tusUploadResume: '繼續',
    tusUploadRetry: '重試',
    tusUploadStartOver: '重新開始',
    tusUploadStartUpload: '開始上傳',
    tusUploadStatusChecking: '正在檢查之前的上傳...',
    tusUploadStatusCompleted: '上傳成功完成！',
    tusUploadStatusFinalizing: '正在完成上傳...',
    tusUploadStatusIdle: '準備上傳',
    tusUploadStatusIdleWithRestore: '準備繼續或重新開始',
    tusUploadStatusPaused: '上傳已在 {{progress}}% 處暫停',
    tusUploadStatusUploading: '正在上傳... {{progress}}%',

    // Error messages
    errorAccessDenied: '您沒有權限存取此資源',
    errorCannotUploadToVideo: '無法上傳到此影片',
    errorCreateVideoFailed: '無法在 Bunny CDN 上建立影片',
    errorDeleteFileFailed: '無法刪除檔案：{{filename}}',
    errorMissingRequiredFields: '缺少一些必要的資訊',
    errorNoServiceConfigured: '未配置任何服務',
    errorStreamConfigMissing: 'Bunny Stream 設定不正確',
    errorTitleRequired: '請為您的影片輸入標題',
    errorUploadFileFailed: '無法上傳檔案：{{filename}}',
    errorVideoInErrorState: '此影片上傳時發生錯誤',
    errorVideoNotFound: '影片「{{videoId}}」不存在',
  },
}
