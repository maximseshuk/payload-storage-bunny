import type { PluginDefaultTranslationsObject } from '../types.js'

export const hu: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Korábbi feltöltések ellenőrzése...',
    tusUploadDisableMode: 'TUS mód kikapcsolása',
    tusUploadEnableMode: 'TUS mód bekapcsolása',
    tusUploadErrorFileType: 'Fájl típus nem engedélyezett',
    tusUploadErrorInitUpload: 'Nem sikerült inicializálni a feltöltést',
    tusUploadErrorPrevCheckFail: 'Nem sikerült ellenőrizni a korábbi feltöltéseket',
    tusUploadErrorRestoreUpload: 'Nem sikerült helyreállítani a feltöltést',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Befejezés...',
    tusUploadPause: 'Szünet',
    tusUploadPreparing: 'Feltöltés előkészítése...',
    tusUploadResume: 'Folytatás',
    tusUploadRetry: 'Újrapróbálkozás',
    tusUploadStartOver: 'Újrakezdés',
    tusUploadStartUpload: 'Feltöltés indítása',
    tusUploadStatusChecking: 'Korábbi feltöltések ellenőrzése...',
    tusUploadStatusCompleted: 'Feltöltés sikeresen befejezve!',
    tusUploadStatusFinalizing: 'Feltöltés befejezése...',
    tusUploadStatusIdle: 'Készen áll a feltöltésre',
    tusUploadStatusIdleWithRestore: 'Készen áll a folytatásra vagy újrakezdésre',
    tusUploadStatusPaused: 'Feltöltés szüneteltetve {{progress}}%-nál',
    tusUploadStatusUploading: 'Feltöltés folyamatban... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Nincs jogosultsága ennek az erőforrásnak az eléréséhez',
    errorCannotUploadToVideo: 'Erre a videóra nem lehet feltölteni',
    errorCreateVideoFailed: 'Nem sikerült videót létrehozni a Bunny CDN-en',
    errorDeleteFileFailed: 'Nem sikerült törölni a fájlt: {{filename}}',
    errorInternalServer: 'Valami hiba történt a mi oldalunkon',
    errorMissingRequiredFields: 'Hiányzik néhány szükséges információ',
    errorStreamConfigMissing: 'A Bunny Stream nincs megfelelően beállítva',
    errorTitleRequired: 'Kérjük, adjon címet a videójának',
    errorUploadFileFailed: 'Nem sikerült feltölteni a fájlt: {{filename}}',
    errorVideoInErrorState: 'Ennek a videónak feltöltési hibája volt',
    errorVideoNotFound: 'A "{{videoId}}" videó nem létezik',
  },
}
