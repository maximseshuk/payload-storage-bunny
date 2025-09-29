import type { PluginDefaultTranslationsObject } from '../types.js'

export const th: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'กำลังตรวจสอบการอัปโหลดก่อนหน้า...',
    tusUploadDisableMode: 'ปิดใช้งานโหมด TUS',
    tusUploadEnableMode: 'เปิดใช้งานโหมด TUS',
    tusUploadErrorFileType: 'ประเภทไฟล์ไม่ได้รับอนุญาต',
    tusUploadErrorInitUpload: 'ไม่สามารถเริ่มต้นการอัปโหลดได้',
    tusUploadErrorPrevCheckFail: 'ไม่สามารถตรวจสอบการอัปโหลดก่อนหน้าได้',
    tusUploadErrorRestoreUpload: 'ไม่สามารถกู้คืนการอัปโหลดได้',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'กำลังเสร็จสิ้น...',
    tusUploadPause: 'หยุดชั่วคราว',
    tusUploadPreparing: 'กำลังเตรียมการอัปโหลด...',
    tusUploadResume: 'ดำเนินการต่อ',
    tusUploadRetry: 'ลองใหม่',
    tusUploadStartOver: 'เริ่มใหม่',
    tusUploadStartUpload: 'เริ่มอัปโหลด',
    tusUploadStatusChecking: 'กำลังตรวจสอบการอัปโหลดก่อนหน้า...',
    tusUploadStatusCompleted: 'อัปโหลดเสร็จสิ้นสำเร็จ!',
    tusUploadStatusFinalizing: 'กำลังเสร็จสิ้นการอัปโหลด...',
    tusUploadStatusIdle: 'พร้อมสำหรับการอัปโหลด',
    tusUploadStatusIdleWithRestore: 'พร้อมดำเนินการต่อหรือเริ่มใหม่',
    tusUploadStatusPaused: 'การอัปโหลดหยุดชั่วคราวที่ {{progress}}%',
    tusUploadStatusUploading: 'กำลังอัปโหลด... {{progress}}%',

    // Error messages
    errorAccessDenied: 'คุณไม่มีสิทธิ์เข้าถึงทรัพยากรนี้',
    errorCannotUploadToVideo: 'ไม่สามารถอัปโหลดไปยังวิดีโอนี้ได้',
    errorCreateVideoFailed: 'ไม่สามารถสร้างวิดีโอบน Bunny CDN ได้',
    errorDeleteFileFailed: 'ไม่สามารถลบไฟล์ได้: {{filename}}',
    errorInternalServer: 'เกิดข้อผิดพลาดจากฝั่งของเรา',
    errorMissingRequiredFields: 'ข้อมูลที่จำเป็นบางส่วนหายไป',
    errorNoServiceConfigured: 'ไม่มีบริการที่กำหนดค่าไว้',
    errorStreamConfigMissing: 'Bunny Stream ไม่ได้กำหนดค่าอย่างถูกต้อง',
    errorTitleRequired: 'กรุณาใส่ชื่อเรื่องสำหรับวิดีโอของคุณ',
    errorUploadFileFailed: 'ไม่สามารถอัปโหลดไฟล์ได้: {{filename}}',
    errorVideoInErrorState: 'วิดีโอนี้มีข้อผิดพลาดในการอัปโหลด',
    errorVideoNotFound: 'ไม่มีวิดีโอ "{{videoId}}"',
  },
}
