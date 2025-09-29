import type { PluginDefaultTranslationsObject } from '../types.js'

export const cs: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Kontrolování předchozích nahrávání...',
    tusUploadDisableMode: 'Vypnout TUS režim',
    tusUploadEnableMode: 'Zapnout TUS režim',
    tusUploadErrorFileType: 'Typ souboru není povolen',
    tusUploadErrorInitUpload: 'Nepodařilo se inicializovat nahrávání',
    tusUploadErrorPrevCheckFail: 'Nepodařilo se zkontrolovat předchozí nahrávání',
    tusUploadErrorRestoreUpload: 'Nepodařilo se obnovit nahrávání',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Dokončování...',
    tusUploadPause: 'Pozastavit',
    tusUploadPreparing: 'Příprava nahrávání...',
    tusUploadResume: 'Pokračovat',
    tusUploadRetry: 'Zkusit znovu',
    tusUploadStartOver: 'Začít znovu',
    tusUploadStartUpload: 'Spustit nahrávání',
    tusUploadStatusChecking: 'Kontrolování předchozích nahrávání...',
    tusUploadStatusCompleted: 'Nahrávání úspěšně dokončeno!',
    tusUploadStatusFinalizing: 'Dokončování nahrávání...',
    tusUploadStatusIdle: 'Připraveno k nahrávání',
    tusUploadStatusIdleWithRestore: 'Připraveno k pokračování nebo začátku znovu',
    tusUploadStatusPaused: 'Nahrávání pozastaveno na {{progress}}%',
    tusUploadStatusUploading: 'Nahrává se... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Nemáte oprávnění pro přístup k tomuto zdroji',
    errorCannotUploadToVideo: 'Do tohoto videa nelze nahrávat',
    errorCreateVideoFailed: 'Nepodařilo se vytvořit video na Bunny CDN',
    errorDeleteFileFailed: 'Nepodařilo se smazat soubor: {{filename}}',
    errorInternalServer: 'Na naší straně se něco pokazilo',
    errorMissingRequiredFields: 'Chybí některé povinné informace',
    errorNoServiceConfigured: 'Žádná služba není nakonfigurována',
    errorStreamConfigMissing: 'Bunny Stream není správně nakonfigurován',
    errorTitleRequired: 'Prosím zadejte název vašeho videa',
    errorUploadFileFailed: 'Nepodařilo se nahrát soubor: {{filename}}',
    errorVideoInErrorState: 'Toto video mělo chybu při nahrávání',
    errorVideoNotFound: 'Video "{{videoId}}" neexistuje',
  },
}
