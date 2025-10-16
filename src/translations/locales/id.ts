import type { PluginDefaultTranslationsObject } from '../types.js'

export const id: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Tutup',
    mediaPreviewLabel: 'Pratinjau',
    mediaPreviewOpen: 'Buka',
    mediaPreviewTitleAudio: 'Pratinjau audio',
    mediaPreviewTitleDocument: 'Pratinjau dokumen',
    mediaPreviewTitleImage: 'Pratinjau gambar',
    mediaPreviewTitleVideo: 'Pratinjau video',

    // TUS Upload
    tusUploadChecking: 'Memeriksa unggahan sebelumnya...',
    tusUploadDisableMode: 'Nonaktifkan mode TUS',
    tusUploadEnableMode: 'Aktifkan mode TUS',
    tusUploadErrorFileType: 'Jenis file tidak diizinkan',
    tusUploadErrorInitUpload: 'Gagal menginisialisasi unggahan',
    tusUploadErrorPrevCheckFail: 'Gagal memeriksa unggahan sebelumnya',
    tusUploadErrorRestoreUpload: 'Gagal memulihkan unggahan',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Menyelesaikan...',
    tusUploadPause: 'Jeda',
    tusUploadPreparing: 'Mempersiapkan unggahan...',
    tusUploadResume: 'Lanjutkan',
    tusUploadRetry: 'Coba lagi',
    tusUploadStartOver: 'Mulai ulang',
    tusUploadStartUpload: 'Mulai unggah',
    tusUploadStatusChecking: 'Memeriksa unggahan sebelumnya...',
    tusUploadStatusCompleted: 'Unggahan berhasil selesai!',
    tusUploadStatusFinalizing: 'Menyelesaikan unggahan...',
    tusUploadStatusIdle: 'Siap mengunggah',
    tusUploadStatusIdleWithRestore: 'Siap melanjutkan atau mulai ulang',
    tusUploadStatusPaused: 'Unggahan dijeda pada {{progress}}%',
    tusUploadStatusUploading: 'Mengunggah... {{progress}}%',
    tusUploadTimeHours: 'j',
    tusUploadTimeMinutes: 'm',
    tusUploadTimeSeconds: 's',

    // Error messages
    errorAccessDenied: 'Anda tidak memiliki izin untuk mengakses sumber daya ini',
    errorCannotUploadToVideo: 'Video ini tidak dapat diunggah',
    errorCreateVideoFailed: 'Tidak dapat membuat video di Bunny CDN',
    errorDeleteFileFailed: 'Tidak dapat menghapus file: {{filename}}',
    errorMissingRequiredFields: 'Beberapa informasi yang diperlukan hilang',
    errorNoServiceConfigured: 'Tidak ada layanan yang dikonfigurasi',
    errorStreamConfigMissing: 'Bunny Stream tidak dikonfigurasi dengan benar',
    errorTitleRequired: 'Silakan masukkan judul untuk video Anda',
    errorUploadFileFailed: 'Tidak dapat mengunggah file: {{filename}}',
    errorVideoInErrorState: 'Video ini mengalami kesalahan unggahan',
    errorVideoNotFound: 'Video "{{videoId}}" tidak ada',
  },
}
