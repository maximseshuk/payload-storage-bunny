import type { PluginDefaultTranslationsObject } from '../types.js'

export const ro: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Verific încărcările anterioare...',
    tusUploadDisableMode: 'Dezactivează modul TUS',
    tusUploadEnableMode: 'Activează modul TUS',
    tusUploadErrorFileType: 'Tipul fișierului nu este permis',
    tusUploadErrorInitUpload: 'Nu s-a reușit inițializarea încărcării',
    tusUploadErrorPrevCheckFail: 'Nu s-a reușit verificarea încărcărilor anterioare',
    tusUploadErrorRestoreUpload: 'Nu s-a reușit restaurarea încărcării',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Se finalizează...',
    tusUploadPause: 'Pauză',
    tusUploadPreparing: 'Se pregătește încărcarea...',
    tusUploadResume: 'Continuă',
    tusUploadRetry: 'Încearcă din nou',
    tusUploadStartOver: 'Începe de la început',
    tusUploadStartUpload: 'Începe încărcarea',
    tusUploadStatusChecking: 'Verific încărcările anterioare...',
    tusUploadStatusCompleted: 'Încărcare finalizată cu succes!',
    tusUploadStatusFinalizing: 'Se finalizează încărcarea...',
    tusUploadStatusIdle: 'Gata pentru încărcare',
    tusUploadStatusIdleWithRestore: 'Gata să continue sau să înceapă de la început',
    tusUploadStatusPaused: 'Încărcare întreruptă la {{progress}}%',
    tusUploadStatusUploading: 'Se încarcă... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Nu ai permisiunea să accesezi această resursă',
    errorCannotUploadToVideo: 'Nu se poate încărca în acest video',
    errorCreateVideoFailed: 'Nu s-a putut crea videoclipul pe Bunny CDN',
    errorDeleteFileFailed: 'Nu s-a putut șterge fișierul: {{filename}}',
    errorInternalServer: 'Ceva a mers prost de partea noastră',
    errorMissingRequiredFields: 'Lipsesc unele informații necesare',
    errorStreamConfigMissing: 'Bunny Stream nu este configurat corect',
    errorTitleRequired: 'Te rog să introduci un titlu pentru videoclipul tău',
    errorUploadFileFailed: 'Nu s-a putut încărca fișierul: {{filename}}',
    errorVideoInErrorState: 'Acest videoclip a avut o eroare de încărcare',
    errorVideoNotFound: 'Videoclipul "{{videoId}}" nu există',
  },
}
