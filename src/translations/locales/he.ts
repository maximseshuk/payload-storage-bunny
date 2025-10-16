import type { PluginDefaultTranslationsObject } from '../types.js'

export const he: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'סגור',
    mediaPreviewLabel: 'תצוגה מקדימה',
    mediaPreviewOpen: 'פתח',
    mediaPreviewTitleAudio: 'תצוגה מקדימה של שמע',
    mediaPreviewTitleDocument: 'תצוגה מקדימה של מסמך',
    mediaPreviewTitleImage: 'תצוגה מקדימה של תמונה',
    mediaPreviewTitleVideo: 'תצוגה מקדימה של וידאו',

    // TUS Upload
    tusUploadChecking: 'בודק העלאות קודמות...',
    tusUploadDisableMode: 'השבת מצב TUS',
    tusUploadEnableMode: 'הפעל מצב TUS',
    tusUploadErrorFileType: 'סוג קובץ לא מורשה',
    tusUploadErrorInitUpload: 'נכשל באיתחול ההעלאה',
    tusUploadErrorPrevCheckFail: 'נכשל בבדיקת העלאות קודמות',
    tusUploadErrorRestoreUpload: 'נכשל בשחזור ההעלאה',
    tusUploadFileSize: '{{size}} מ"ב',
    tusUploadFinalizing: 'מסיים...',
    tusUploadPause: 'השהה',
    tusUploadPreparing: 'מכין העלאה...',
    tusUploadResume: 'המשך',
    tusUploadRetry: 'נסה שוב',
    tusUploadStartOver: 'התחל מחדש',
    tusUploadStartUpload: 'התחל העלאה',
    tusUploadStatusChecking: 'בודק העלאות קודמות...',
    tusUploadStatusCompleted: 'ההעלאה הושלמה בהצלחה!',
    tusUploadStatusFinalizing: 'מסיים העלאה...',
    tusUploadStatusIdle: 'מוכן להעלאה',
    tusUploadStatusIdleWithRestore: 'מוכן להמשיך או להתחיל מחדש',
    tusUploadStatusPaused: 'ההעלאה הושהתה ב-{{progress}}%',
    tusUploadStatusUploading: 'מעלה... {{progress}}%',
    tusUploadTimeHours: 'ש',
    tusUploadTimeMinutes: 'ד',
    tusUploadTimeSeconds: 'ש',

    // Error messages
    errorAccessDenied: 'אין לך הרשאה לגשת למשאב זה',
    errorCannotUploadToVideo: 'לא ניתן להעלות לסרטון זה',
    errorCreateVideoFailed: 'לא ניתן ליצור סרטון ב-Bunny CDN',
    errorDeleteFileFailed: 'לא ניתן למחוק קובץ: {{filename}}',
    errorMissingRequiredFields: 'חסר מידע נדרש',
    errorNoServiceConfigured: 'לא הוגדר שירות',
    errorStreamConfigMissing: 'Bunny Stream לא מוגדר כראוי',
    errorTitleRequired: 'אנא הזן כותרת לסרטון שלך',
    errorUploadFileFailed: 'לא ניתן להעלות קובץ: {{filename}}',
    errorVideoInErrorState: 'לסרטון זה הייתה שגיאת העלאה',
    errorVideoNotFound: 'הסרטון "{{videoId}}" לא קיים',
  },
}
