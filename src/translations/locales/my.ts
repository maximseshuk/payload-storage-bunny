import type { PluginDefaultTranslationsObject } from '../types.js'

export const my: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'ပိတ်မည်',
    mediaPreviewLabel: 'အစမ်းကြည့်ရှုခြင်း',
    mediaPreviewOpen: 'ဖွင့်မည်',
    mediaPreviewTitleAudio: 'အသံ အကြိုကြည့်ရှုခြင်း',
    mediaPreviewTitleDocument: 'စာရွက်စာတမ်း အကြိုကြည့်ရှုခြင်း',
    mediaPreviewTitleImage: 'ပုံ အကြိုကြည့်ရှုခြင်း',
    mediaPreviewTitleVideo: 'ဗီဒီယို အကြိုကြည့်ရှုခြင်း',

    // TUS Upload
    tusUploadChecking: 'ယခင်တင်ပြမှုများကို စစ်ဆေးနေသည်...',
    tusUploadDisableMode: 'TUS မုဒ်ကို ပိတ်ပါ',
    tusUploadEnableMode: 'TUS မုဒ်ကို ဖွင့်ပါ',
    tusUploadErrorFileType: 'ဖိုင်အမျိုးအစားကို ခွင့်မပြုပါ',
    tusUploadErrorInitUpload: 'တင်ပြမှုကို စတင်ရန် မအောင်မြင်ပါ',
    tusUploadErrorPrevCheckFail: 'ယခင်တင်ပြမှုများကို စစ်ဆေးရန် မအောင်မြင်ပါ',
    tusUploadErrorRestoreUpload: 'တင်ပြမှုကို ပြန်လည်ထူထောင်ရန် မအောင်မြင်ပါ',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'အပြီးသတ်နေသည်...',
    tusUploadPause: 'ခေတ္တရပ်',
    tusUploadPreparing: 'တင်ပြမှုကို ပြင်ဆင်နေသည်...',
    tusUploadResume: 'ဆက်လုပ်',
    tusUploadRetry: 'ပြန်လည်ကြိုးစား',
    tusUploadStartOver: 'အစမှ စတင်',
    tusUploadStartUpload: 'တင်ပြမှု စတင်',
    tusUploadStatusChecking: 'ယခင်တင်ပြမှုများကို စစ်ဆေးနေသည်...',
    tusUploadStatusCompleted: 'တင်ပြမှု အောင်မြင်စွာ ပြီးဆုံးပါပြီ!',
    tusUploadStatusFinalizing: 'တင်ပြမှုကို အပြီးသတ်နေသည်...',
    tusUploadStatusIdle: 'တင်ပြရန် အဆင်သင့်',
    tusUploadStatusIdleWithRestore: 'ဆက်လုပ်ရန် သို့မဟုတ် အစမှ စတင်ရန် အဆင်သင့်',
    tusUploadStatusPaused: 'တင်ပြမှု {{progress}}% တွင် ခေတ္တရပ်ထားသည်',
    tusUploadStatusUploading: 'တင်ပြနေသည်... {{progress}}%',

    // Error messages
    errorAccessDenied: 'ဤအရင်းအမြစ်ကို ဝင်ရောက်ခွင့် မရှိပါ',
    errorCannotUploadToVideo: 'ဤဗီဒီယိုသို့ တင်ပြ၍ မရပါ',
    errorCreateVideoFailed: 'Bunny CDN တွင် ဗီဒီယို ဖန်တီး၍ မရပါ',
    errorDeleteFileFailed: 'ဖိုင်ကို ဖျက်၍ မရပါ: {{filename}}',
    errorMissingRequiredFields: 'လိုအပ်သော အချက်အလက်အချို့ ပျောက်နေပါသည်',
    errorNoServiceConfigured: 'ဝန်ဆောင်မှုတစ်ခုမှ ဖွဲ့စည်းတည်ဆောက်မထားပါ',
    errorStreamConfigMissing: 'Bunny Stream ကို မှန်ကန်စွာ ပြင်ဆင်မထားပါ',
    errorTitleRequired: 'သင့်ဗီဒီယိုအတွက် ခေါင်းစဉ်ကို ထည့်ပါ',
    errorUploadFileFailed: 'ဖိုင်ကို တင်ပြ၍ မရပါ: {{filename}}',
    errorVideoInErrorState: 'ဤဗီဒီယိုတွင် တင်ပြမှုအမှား ရှိခဲ့သည်',
    errorVideoNotFound: 'ဗီဒီယို "{{videoId}}" မရှိပါ',
  },
}
