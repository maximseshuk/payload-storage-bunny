import type { PluginDefaultTranslationsObject } from '../types.js'

export const bnBd: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'পূর্ববর্তী আপলোড চেক করা হচ্ছে...',
    tusUploadDisableMode: 'TUS মোড নিষ্ক্রিয় করুন',
    tusUploadEnableMode: 'TUS মোড সক্রিয় করুন',
    tusUploadErrorFileType: 'ফাইলের ধরন অনুমোদিত নয়',
    tusUploadErrorInitUpload: 'আপলোড শুরু করতে ব্যর্থ',
    tusUploadErrorPrevCheckFail: 'পূর্ববর্তী আপলোড চেক করতে ব্যর্থ',
    tusUploadErrorRestoreUpload: 'আপলোড পুনরুদ্ধার করতে ব্যর্থ',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'শেষ করা হচ্ছে...',
    tusUploadPause: 'বিরতি',
    tusUploadPreparing: 'আপলোড প্রস্তুত করা হচ্ছে...',
    tusUploadResume: 'পুনরায় শুরু',
    tusUploadRetry: 'আবার চেষ্টা করুন',
    tusUploadStartOver: 'নতুন করে শুরু করুন',
    tusUploadStartUpload: 'আপলোড শুরু করুন',
    tusUploadStatusChecking: 'পূর্ববর্তী আপলোড চেক করা হচ্ছে...',
    tusUploadStatusCompleted: 'আপলোড সফলভাবে সম্পন্ন হয়েছে!',
    tusUploadStatusFinalizing: 'আপলোড শেষ করা হচ্ছে...',
    tusUploadStatusIdle: 'আপলোডের জন্য প্রস্তুত',
    tusUploadStatusIdleWithRestore: 'পুনরায় শুরু বা নতুন করে শুরু করার জন্য প্রস্তুত',
    tusUploadStatusPaused: 'আপলোড {{progress}}% এ বিরতি দেওয়া হয়েছে',
    tusUploadStatusUploading: 'আপলোড হচ্ছে... {{progress}}%',

    // Error messages
    errorAccessDenied: 'এই রিসোর্সে অ্যাক্সেস করার অনুমতি আপনার নেই',
    errorCannotUploadToVideo: 'এই ভিডিওতে আপলোড করা যাবে না',
    errorCreateVideoFailed: 'Bunny CDN এ ভিডিও তৈরি করা যায়নি',
    errorDeleteFileFailed: 'ফাইল মুছে ফেলা যায়নি: {{filename}}',
    errorInternalServer: 'আমাদের দিক থেকে কিছু ভুল হয়েছে',
    errorMissingRequiredFields: 'কিছু প্রয়োজনীয় তথ্য অনুপস্থিত',
    errorNoServiceConfigured: 'কোনো সার্ভিস কনফিগার করা নেই',
    errorStreamConfigMissing: 'Bunny Stream সঠিকভাবে কনফিগার করা হয়নি',
    errorTitleRequired: 'অনুগ্রহ করে আপনার ভিডিওর জন্য একটি শিরোনাম লিখুন',
    errorUploadFileFailed: 'ফাইল আপলোড করা যায়নি: {{filename}}',
    errorVideoInErrorState: 'এই ভিডিওতে আপলোড ত্রুটি ছিল',
    errorVideoNotFound: 'ভিডিও "{{videoId}}" বিদ্যমান নেই',
  },
}
