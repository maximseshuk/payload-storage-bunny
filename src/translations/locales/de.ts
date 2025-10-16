import type { PluginDefaultTranslationsObject } from '../types.js'

export const de: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Schließen',
    mediaPreviewLabel: 'Vorschau',
    mediaPreviewOpen: 'Öffnen',
    mediaPreviewTitleAudio: 'Audio-Vorschau',
    mediaPreviewTitleDocument: 'Dokument-Vorschau',
    mediaPreviewTitleImage: 'Bild-Vorschau',
    mediaPreviewTitleVideo: 'Video-Vorschau',

    // TUS Upload
    tusUploadChecking: 'Überprüfe vorherige Uploads...',
    tusUploadDisableMode: 'TUS-Modus deaktivieren',
    tusUploadEnableMode: 'TUS-Modus aktivieren',
    tusUploadErrorFileType: 'Dateityp nicht erlaubt',
    tusUploadErrorInitUpload: 'Upload konnte nicht initialisiert werden',
    tusUploadErrorPrevCheckFail: 'Überprüfung vorheriger Uploads fehlgeschlagen',
    tusUploadErrorRestoreUpload: 'Upload konnte nicht wiederhergestellt werden',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Wird abgeschlossen...',
    tusUploadPause: 'Pausieren',
    tusUploadPreparing: 'Upload wird vorbereitet...',
    tusUploadResume: 'Fortsetzen',
    tusUploadRetry: 'Wiederholen',
    tusUploadStartOver: 'Von vorne beginnen',
    tusUploadStartUpload: 'Upload starten',
    tusUploadStatusChecking: 'Überprüfe vorherige Uploads...',
    tusUploadStatusCompleted: 'Upload erfolgreich abgeschlossen!',
    tusUploadStatusFinalizing: 'Upload wird abgeschlossen...',
    tusUploadStatusIdle: 'Bereit zum Hochladen',
    tusUploadStatusIdleWithRestore: 'Bereit zum Fortsetzen oder Neustart',
    tusUploadStatusPaused: 'Upload pausiert bei {{progress}}%',
    tusUploadStatusUploading: 'Wird hochgeladen... {{progress}}%',
    tusUploadTimeHours: 'h',
    tusUploadTimeMinutes: 'm',
    tusUploadTimeSeconds: 's',

    // Error messages
    errorAccessDenied: 'Sie haben keine Berechtigung, auf diese Ressource zuzugreifen',
    errorCannotUploadToVideo: 'Dieses Video kann nicht hochgeladen werden',
    errorCreateVideoFailed: 'Video konnte nicht auf Bunny CDN erstellt werden',
    errorDeleteFileFailed: 'Datei konnte nicht gelöscht werden: {{filename}}',
    errorMissingRequiredFields: 'Einige erforderliche Informationen fehlen',
    errorNoServiceConfigured: 'Kein Service konfiguriert',
    errorStreamConfigMissing: 'Bunny Stream ist nicht ordnungsgemäß konfiguriert',
    errorTitleRequired: 'Bitte geben Sie einen Titel für Ihr Video ein',
    errorUploadFileFailed: 'Datei konnte nicht hochgeladen werden: {{filename}}',
    errorVideoInErrorState: 'Dieses Video hatte einen Upload-Fehler',
    errorVideoNotFound: 'Video "{{videoId}}" existiert nicht',
  },
}
