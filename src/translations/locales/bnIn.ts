import type { PluginDefaultTranslationsObject } from '../types.js'

export const bnIn: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'পূর্ববর্তী আপলোড পরীক্ষা করা হচ্ছে...',
    tusUploadDisableMode: 'TUS মোড নিষ্ক্রিয় করুন',
    tusUploadEnableMode: 'TUS মোড সক্রিয় করুন',
    tusUploadErrorFileType: 'ফাইলের প্রকার অনুমোদিত নয়',
    tusUploadErrorInitUpload: 'আপলোড প্রারম্ভ করতে ব্যর্থ',
    tusUploadErrorPrevCheckFail: 'পূর্ববর্তী আপলোড পরীক্ষা করতে ব্যর্থ',
    tusUploadErrorRestoreUpload: 'আপলোড পুনরুদ্ধার করতে ব্যর্থ',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'চূড়ান্ত করা হচ্ছে...',
    tusUploadPause: 'বিরাম',
    tusUploadPreparing: 'আপলোড প্রস্তুত করা হচ্ছে...',
    tusUploadResume: 'পুনরায় আরম্ভ',
    tusUploadRetry: 'পুনরায় চেষ্টা করুন',
    tusUploadStartOver: 'নতুনভাবে শুরু করুন',
    tusUploadStartUpload: 'আপলোড আরম্ভ করুন',
    tusUploadStatusChecking: 'পূর্ববর্তী আপলোড পরীক্ষা করা হচ্ছে...',
    tusUploadStatusCompleted: 'আপলোড সফলভাবে সম্পূর্ণ হয়েছে!',
    tusUploadStatusFinalizing: 'আপলোড চূড়ান্ত করা হচ্ছে...',
    tusUploadStatusIdle: 'আপলোডের জন্য প্রস্তুত',
    tusUploadStatusIdleWithRestore: 'পুনরায় আরম্ভ বা নতুনভাবে শুরু করার জন্য প্রস্তুত',
    tusUploadStatusPaused: 'আপলোড {{progress}}% এ বিরাম দেওয়া হয়েছে',
    tusUploadStatusUploading: 'আপলোড হচ্ছে... {{progress}}%',

    // Error messages
    errorAccessDenied: 'এই সম্পদে প্রবেশ করার অনুমতি আপনার নেই',
    errorCannotUploadToVideo: 'এই ভিডিওতে আপলোড করা যাবে না',
    errorCreateVideoFailed: 'Bunny CDN এ ভিডিও তৈরি করা যায়নি',
    errorDeleteFileFailed: 'ফাইল মুছে ফেলা যায়নি: {{filename}}',
    errorInternalServer: 'আমাদের দিক থেকে কিছু সমস্যা হয়েছে',
    errorMissingRequiredFields: 'কিছু প্রয়োজনীয় তথ্য অনুপস্থিত',
    errorStreamConfigMissing: 'Bunny Stream সঠিকভাবে কনফিগার করা হয়নি',
    errorTitleRequired: 'অনুগ্রহ করে আপনার ভিডিওর জন্য একটি শিরোনাম প্রদান করুন',
    errorUploadFileFailed: 'ফাইল আপলোড করা যায়নি: {{filename}}',
    errorVideoInErrorState: 'এই ভিডিওতে আপলোড ত্রুটি রয়েছে',
    errorVideoNotFound: 'ভিডিও "{{videoId}}" বিদ্যমান নেই',
  },
}
