import type { PluginDefaultTranslationsObject } from '../types.js'

export const zh: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: '正在检查之前的上传...',
    tusUploadDisableMode: '禁用 TUS 模式',
    tusUploadEnableMode: '启用 TUS 模式',
    tusUploadErrorFileType: '文件类型不允许',
    tusUploadErrorInitUpload: '初始化上传失败',
    tusUploadErrorPrevCheckFail: '检查之前的上传失败',
    tusUploadErrorRestoreUpload: '恢复上传失败',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: '正在完成...',
    tusUploadPause: '暂停',
    tusUploadPreparing: '正在准备上传...',
    tusUploadResume: '继续',
    tusUploadRetry: '重试',
    tusUploadStartOver: '重新开始',
    tusUploadStartUpload: '开始上传',
    tusUploadStatusChecking: '正在检查之前的上传...',
    tusUploadStatusCompleted: '上传成功完成！',
    tusUploadStatusFinalizing: '正在完成上传...',
    tusUploadStatusIdle: '准备上传',
    tusUploadStatusIdleWithRestore: '准备继续或重新开始',
    tusUploadStatusPaused: '上传已在 {{progress}}% 处暂停',
    tusUploadStatusUploading: '正在上传... {{progress}}%',

    // Error messages
    errorAccessDenied: '您没有权限访问此资源',
    errorCannotUploadToVideo: '无法上传到此视频',
    errorCreateVideoFailed: '无法在 Bunny CDN 上创建视频',
    errorDeleteFileFailed: '无法删除文件：{{filename}}',
    errorInternalServer: '我们这边出了点问题',
    errorMissingRequiredFields: '缺少一些必需的信息',
    errorStreamConfigMissing: 'Bunny Stream 配置不正确',
    errorTitleRequired: '请为您的视频输入标题',
    errorUploadFileFailed: '无法上传文件：{{filename}}',
    errorVideoInErrorState: '此视频上传时发生错误',
    errorVideoNotFound: '视频"{{videoId}}"不存在',
  },
}
