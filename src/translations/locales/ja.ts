import type { PluginDefaultTranslationsObject } from '../types.js'

export const ja: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: '過去のアップロードを確認中...',
    tusUploadDisableMode: 'TUSモードを無効にする',
    tusUploadEnableMode: 'TUSモードを有効にする',
    tusUploadErrorFileType: 'ファイル形式が許可されていません',
    tusUploadErrorInitUpload: 'アップロードの初期化に失敗しました',
    tusUploadErrorPrevCheckFail: '過去のアップロードの確認に失敗しました',
    tusUploadErrorRestoreUpload: 'アップロードの復元に失敗しました',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: '完了中...',
    tusUploadPause: '一時停止',
    tusUploadPreparing: 'アップロードを準備中...',
    tusUploadResume: '再開',
    tusUploadRetry: '再試行',
    tusUploadStartOver: '最初からやり直す',
    tusUploadStartUpload: 'アップロード開始',
    tusUploadStatusChecking: '過去のアップロードを確認中...',
    tusUploadStatusCompleted: 'アップロードが正常に完了しました！',
    tusUploadStatusFinalizing: 'アップロードを完了中...',
    tusUploadStatusIdle: 'アップロード準備完了',
    tusUploadStatusIdleWithRestore: '再開または最初からの準備完了',
    tusUploadStatusPaused: 'アップロードが{{progress}}%で一時停止されました',
    tusUploadStatusUploading: 'アップロード中... {{progress}}%',

    // Error messages
    errorAccessDenied: 'このリソースにアクセスする権限がありません',
    errorCannotUploadToVideo: 'この動画にはアップロードできません',
    errorCreateVideoFailed: 'Bunny CDNで動画を作成できませんでした',
    errorDeleteFileFailed: 'ファイルを削除できませんでした：{{filename}}',
    errorInternalServer: '私たちの側で何か問題が発生しました',
    errorMissingRequiredFields: '必要な情報が不足しています',
    errorNoServiceConfigured: 'サービスが設定されていません',
    errorStreamConfigMissing: 'Bunny Streamが正しく設定されていません',
    errorTitleRequired: '動画のタイトルを入力してください',
    errorUploadFileFailed: 'ファイルをアップロードできませんでした：{{filename}}',
    errorVideoInErrorState: 'この動画にはアップロードエラーが発生しました',
    errorVideoNotFound: '動画「{{videoId}}」は存在しません',
  },
}
