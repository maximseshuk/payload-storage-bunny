import type { PluginDefaultTranslationsObject } from '../types.js'

export const fa: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'بستن',
    mediaPreviewLabel: 'پیش‌نمایش',
    mediaPreviewOpen: 'باز کردن',
    mediaPreviewTitleAudio: 'پیش‌نمایش صوت',
    mediaPreviewTitleDocument: 'پیش‌نمایش سند',
    mediaPreviewTitleImage: 'پیش‌نمایش تصویر',
    mediaPreviewTitleVideo: 'پیش‌نمایش ویدیو',

    // TUS Upload
    tusUploadChecking: 'بررسی آپلودهای قبلی...',
    tusUploadDisableMode: 'غیرفعال کردن حالت TUS',
    tusUploadEnableMode: 'فعال کردن حالت TUS',
    tusUploadErrorFileType: 'نوع فایل مجاز نیست',
    tusUploadErrorInitUpload: 'مقداردهی اولیه آپلود ناموفق',
    tusUploadErrorPrevCheckFail: 'بررسی آپلودهای قبلی ناموفق',
    tusUploadErrorRestoreUpload: 'بازیابی آپلود ناموفق',
    tusUploadFileSize: '{{size}} مگابایت',
    tusUploadFinalizing: 'در حال نهایی کردن...',
    tusUploadPause: 'مکث',
    tusUploadPreparing: 'آماده‌سازی آپلود...',
    tusUploadResume: 'ادامه',
    tusUploadRetry: 'تلاش مجدد',
    tusUploadStartOver: 'شروع دوباره',
    tusUploadStartUpload: 'شروع آپلود',
    tusUploadStatusChecking: 'بررسی آپلودهای قبلی...',
    tusUploadStatusCompleted: 'آپلود با موفقیت تکمیل شد!',
    tusUploadStatusFinalizing: 'نهایی کردن آپلود...',
    tusUploadStatusIdle: 'آماده آپلود',
    tusUploadStatusIdleWithRestore: 'آماده ادامه یا شروع دوباره',
    tusUploadStatusPaused: 'آپلود در {{progress}}% متوقف شد',
    tusUploadStatusUploading: 'در حال آپلود... {{progress}}%',

    // Error messages
    errorAccessDenied: 'شما مجوز دسترسی به این منبع را ندارید',
    errorCannotUploadToVideo: 'نمی‌توان به این ویدیو آپلود کرد',
    errorCreateVideoFailed: 'ایجاد ویدیو در Bunny CDN امکان‌پذیر نبود',
    errorDeleteFileFailed: 'حذف فایل امکان‌پذیر نبود: {{filename}}',
    errorMissingRequiredFields: 'برخی اطلاعات ضروری موجود نیست',
    errorNoServiceConfigured: 'هیچ سرویسی پیکربندی نشده است',
    errorStreamConfigMissing: 'Bunny Stream به درستی پیکربندی نشده است',
    errorTitleRequired: 'لطفاً عنوانی برای ویدیوی خود وارد کنید',
    errorUploadFileFailed: 'آپلود فایل امکان‌پذیر نبود: {{filename}}',
    errorVideoInErrorState: 'این ویدیو دچار خطای آپلود شد',
    errorVideoNotFound: 'ویدیو "{{videoId}}" وجود ندارد',
  },
}
