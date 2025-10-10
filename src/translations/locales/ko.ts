import type { PluginDefaultTranslationsObject } from '../types.js'

export const ko: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: '닫기',
    mediaPreviewLabel: '미리보기',
    mediaPreviewOpen: '열기',
    mediaPreviewTitleAudio: '오디오 미리보기',
    mediaPreviewTitleDocument: '문서 미리보기',
    mediaPreviewTitleImage: '이미지 미리보기',
    mediaPreviewTitleVideo: '비디오 미리보기',

    // TUS Upload
    tusUploadChecking: '이전 업로드 확인 중...',
    tusUploadDisableMode: 'TUS 모드 비활성화',
    tusUploadEnableMode: 'TUS 모드 활성화',
    tusUploadErrorFileType: '파일 형식이 허용되지 않습니다',
    tusUploadErrorInitUpload: '업로드 초기화에 실패했습니다',
    tusUploadErrorPrevCheckFail: '이전 업로드 확인에 실패했습니다',
    tusUploadErrorRestoreUpload: '업로드 복원에 실패했습니다',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: '완료 중...',
    tusUploadPause: '일시정지',
    tusUploadPreparing: '업로드 준비 중...',
    tusUploadResume: '재개',
    tusUploadRetry: '다시 시도',
    tusUploadStartOver: '처음부터 시작',
    tusUploadStartUpload: '업로드 시작',
    tusUploadStatusChecking: '이전 업로드 확인 중...',
    tusUploadStatusCompleted: '업로드가 성공적으로 완료되었습니다!',
    tusUploadStatusFinalizing: '업로드 완료 중...',
    tusUploadStatusIdle: '업로드 준비됨',
    tusUploadStatusIdleWithRestore: '재개 또는 처음부터 시작 준비됨',
    tusUploadStatusPaused: '업로드가 {{progress}}%에서 일시정지됨',
    tusUploadStatusUploading: '업로드 중... {{progress}}%',

    // Error messages
    errorAccessDenied: '이 리소스에 접근할 권한이 없습니다',
    errorCannotUploadToVideo: '이 동영상에는 업로드할 수 없습니다',
    errorCreateVideoFailed: 'Bunny CDN에서 동영상을 생성할 수 없습니다',
    errorDeleteFileFailed: '파일을 삭제할 수 없습니다: {{filename}}',
    errorMissingRequiredFields: '필수 정보가 누락되었습니다',
    errorNoServiceConfigured: '구성된 서비스가 없습니다',
    errorStreamConfigMissing: 'Bunny Stream이 올바르게 구성되지 않았습니다',
    errorTitleRequired: '동영상 제목을 입력해주세요',
    errorUploadFileFailed: '파일을 업로드할 수 없습니다: {{filename}}',
    errorVideoInErrorState: '이 동영상에 업로드 오류가 발생했습니다',
    errorVideoNotFound: '동영상 "{{videoId}}"가 존재하지 않습니다',
  },
}
