import type { PluginDefaultTranslationsObject } from '../types.js'

export const ar: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'فحص التحميلات السابقة...',
    tusUploadDisableMode: 'تعطيل وضع tus',
    tusUploadEnableMode: 'تمكين وضع tus',
    tusUploadErrorFileType: 'نوع الملف غير مسموح',
    tusUploadErrorInitUpload: 'فشل في تهيئة التحميل',
    tusUploadErrorPrevCheckFail: 'فشل في فحص التحميلات السابقة',
    tusUploadErrorRestoreUpload: 'فشل في استعادة التحميل',
    tusUploadFileSize: '{{size}} ميجابايت',
    tusUploadFinalizing: 'جاري الإنهاء...',
    tusUploadPause: 'إيقاف مؤقت',
    tusUploadPreparing: 'تحضير التحميل...',
    tusUploadResume: 'استكمال',
    tusUploadRetry: 'إعادة المحاولة',
    tusUploadStartOver: 'البدء من جديد',
    tusUploadStartUpload: 'بدء التحميل',
    tusUploadStatusChecking: 'فحص التحميلات السابقة...',
    tusUploadStatusCompleted: 'تم التحميل بنجاح!',
    tusUploadStatusFinalizing: 'إنهاء التحميل...',
    tusUploadStatusIdle: 'جاهز للتحميل',
    tusUploadStatusIdleWithRestore: 'جاهز للاستكمال أو البدء من جديد',
    tusUploadStatusPaused: 'التحميل متوقف مؤقتاً عند {{progress}}%',
    tusUploadStatusUploading: 'جاري التحميل... {{progress}}%',

    // Error messages
    errorAccessDenied: 'ليس لديك صلاحية للوصول إلى هذا المورد',
    errorCannotUploadToVideo: 'لا يمكن التحميل إلى هذا الفيديو',
    errorCreateVideoFailed: 'لا يمكن إنشاء الفيديو على Bunny CDN',
    errorDeleteFileFailed: 'لا يمكن حذف الملف: {{filename}}',
    errorInternalServer: 'حدث خطأ من جانبنا',
    errorMissingRequiredFields: 'بعض المعلومات المطلوبة مفقودة',
    errorNoServiceConfigured: 'لم يتم تكوين أي خدمة',
    errorStreamConfigMissing: 'Bunny Stream غير مكون بشكل صحيح',
    errorTitleRequired: 'يرجى إدخال عنوان للفيديو الخاص بك',
    errorUploadFileFailed: 'لا يمكن تحميل الملف: {{filename}}',
    errorVideoInErrorState: 'هذا الفيديو به خطأ في التحميل',
    errorVideoNotFound: 'الفيديو "{{videoId}}" غير موجود',
  },
}
