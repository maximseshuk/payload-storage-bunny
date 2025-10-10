import type { PluginDefaultTranslationsObject } from '../types.js'

export const ta: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'மூடு',
    mediaPreviewLabel: 'முன்னோட்டம்',
    mediaPreviewOpen: 'திற',
    mediaPreviewTitleAudio: 'ஆடியோ முன்னோட்டம்',
    mediaPreviewTitleDocument: 'ஆவண முன்னோட்டம்',
    mediaPreviewTitleImage: 'படம் முன்னோட்டம்',
    mediaPreviewTitleVideo: 'வீடியோ முன்னோட்டம்',

    // TUS Upload
    tusUploadChecking: 'முந்தைய பதிவேற்றங்களைச் சரிபார்க்கிறது...',
    tusUploadDisableMode: 'tus முறையை முடக்கு',
    tusUploadEnableMode: 'tus முறையை இயக்கு',
    tusUploadErrorFileType: 'கோப்பு வகை அனுமதிக்கப்படவில்லை',
    tusUploadErrorInitUpload: 'பதிவேற்றத்தைத் தொடங்க முடியவில்லை',
    tusUploadErrorPrevCheckFail: 'முந்தைய பதிவேற்றங்களைச் சரிபார்க்க முடியவில்லை',
    tusUploadErrorRestoreUpload: 'பதிவேற்றத்தை மீட்டமைக்க முடியவில்லை',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'இறுதி செய்கிறது...',
    tusUploadPause: 'இடைநிறுத்து',
    tusUploadPreparing: 'பதிவேற்றத்திற்குத் தயாராகிறது...',
    tusUploadResume: 'தொடர்க',
    tusUploadRetry: 'மீண்டும் முயற்சி செய்',
    tusUploadStartOver: 'புதிதாகத் தொடங்கு',
    tusUploadStartUpload: 'பதிவேற்றத்தைத் தொடங்கு',
    tusUploadStatusChecking: 'முந்தைய பதிவேற்றங்களைச் சரிபார்க்கிறது...',
    tusUploadStatusCompleted: 'பதிவேற்றம் வெற்றிகரமாக முடிந்தது!',
    tusUploadStatusFinalizing: 'பதிவேற்றத்தை இறுதி செய்கிறது...',
    tusUploadStatusIdle: 'பதிவேற்றத்திற்குத் தயார்',
    tusUploadStatusIdleWithRestore: 'தொடர அல்லது புதிதாகத் தொடங்கத் தயார்',
    tusUploadStatusPaused: 'பதிவேற்றம் {{progress}}% இல் இடைநிறுத்தப்பட்டது',
    tusUploadStatusUploading: 'பதிவேற்றம் செய்கிறது... {{progress}}%',

    // Error messages
    errorAccessDenied: 'இந்த ஆதாரத்தை அணுக உங்களுக்கு அனுமति இல்லை',
    errorCannotUploadToVideo: 'இந்த வீடியோவைப் பதிவேற்ற முடியாது',
    errorCreateVideoFailed: 'Bunny CDN இல் வீடியோவை உருவாக்க முடியவில்லை',
    errorDeleteFileFailed: 'கோப்பை நீக்க முடியவில்லை: {{filename}}',
    errorMissingRequiredFields: 'சில தேவையான தகவல்கள் விடுபட்டுள்ளன',
    errorNoServiceConfigured: 'எந்த சேவையும் கட்டமைக்கப்படவில்லை',
    errorStreamConfigMissing: 'Bunny Stream சரியாக கட்டமைக்கப்படவில்லை',
    errorTitleRequired: 'உங்கள் வீடியோவுக்கு ஒரு தலைப்பை உள்ளிடவும்',
    errorUploadFileFailed: 'கோப்பைப் பதிவேற்ற முடியவில்லை: {{filename}}',
    errorVideoInErrorState: 'இந்த வீடியோவில் பதிவேற்ற பிழை ஏற்பட்டது',
    errorVideoNotFound: 'வீடியோ "{{videoId}}" இல்லை',
  },
}
