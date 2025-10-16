import type { PluginDefaultTranslationsObject } from '../types.js'

export const vi: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Đóng',
    mediaPreviewLabel: 'Xem trước',
    mediaPreviewOpen: 'Mở',
    mediaPreviewTitleAudio: 'Xem trước âm thanh',
    mediaPreviewTitleDocument: 'Xem trước tài liệu',
    mediaPreviewTitleImage: 'Xem trước hình ảnh',
    mediaPreviewTitleVideo: 'Xem trước video',

    // TUS Upload
    tusUploadChecking: 'Đang kiểm tra các lần tải lên trước đó...',
    tusUploadDisableMode: 'Tắt chế độ TUS',
    tusUploadEnableMode: 'Bật chế độ TUS',
    tusUploadErrorFileType: 'Loại tệp không được phép',
    tusUploadErrorInitUpload: 'Không thể khởi tạo tải lên',
    tusUploadErrorPrevCheckFail: 'Không thể kiểm tra các lần tải lên trước đó',
    tusUploadErrorRestoreUpload: 'Không thể khôi phục tải lên',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Đang hoàn tất...',
    tusUploadPause: 'Tạm dừng',
    tusUploadPreparing: 'Đang chuẩn bị tải lên...',
    tusUploadResume: 'Tiếp tục',
    tusUploadRetry: 'Thử lại',
    tusUploadStartOver: 'Bắt đầu lại',
    tusUploadStartUpload: 'Bắt đầu tải lên',
    tusUploadStatusChecking: 'Đang kiểm tra các lần tải lên trước đó...',
    tusUploadStatusCompleted: 'Tải lên hoàn thành thành công!',
    tusUploadStatusFinalizing: 'Đang hoàn tất tải lên...',
    tusUploadStatusIdle: 'Sẵn sàng tải lên',
    tusUploadStatusIdleWithRestore: 'Sẵn sàng tiếp tục hoặc bắt đầu lại',
    tusUploadStatusPaused: 'Tải lên đã tạm dừng ở {{progress}}%',
    tusUploadStatusUploading: 'Đang tải lên... {{progress}}%',
    tusUploadTimeHours: 'g',
    tusUploadTimeMinutes: 'p',
    tusUploadTimeSeconds: 'g',

    // Error messages
    errorAccessDenied: 'Bạn không có quyền truy cập tài nguyên này',
    errorCannotUploadToVideo: 'Không thể tải lên video này',
    errorCreateVideoFailed: 'Không thể tạo video trên Bunny CDN',
    errorDeleteFileFailed: 'Không thể xóa tệp: {{filename}}',
    errorMissingRequiredFields: 'Thiếu một số thông tin cần thiết',
    errorNoServiceConfigured: 'Không có dịch vụ nào được cấu hình',
    errorStreamConfigMissing: 'Bunny Stream chưa được cấu hình đúng cách',
    errorTitleRequired: 'Vui lòng nhập tiêu đề cho video của bạn',
    errorUploadFileFailed: 'Không thể tải lên tệp: {{filename}}',
    errorVideoInErrorState: 'Video này đã gặp lỗi tải lên',
    errorVideoNotFound: 'Video "{{videoId}}" không tồn tại',
  },
}
