import type { PluginDefaultTranslationsObject } from '../types.js'

export const sk: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Kontrolujem predchádzajúce nahrania...',
    tusUploadDisableMode: 'Vypnúť TUS režim',
    tusUploadEnableMode: 'Zapnúť TUS režim',
    tusUploadErrorFileType: 'Typ súboru nie je povolený',
    tusUploadErrorInitUpload: 'Nepodarilo sa inicializovať nahranie',
    tusUploadErrorPrevCheckFail: 'Nepodarilo sa skontrolovať predchádzajúce nahrania',
    tusUploadErrorRestoreUpload: 'Nepodarilo sa obnoviť nahranie',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Dokončujem...',
    tusUploadPause: 'Pozastaviť',
    tusUploadPreparing: 'Príprava nahrávania...',
    tusUploadResume: 'Pokračovať',
    tusUploadRetry: 'Skúsiť znovu',
    tusUploadStartOver: 'Začať znovu',
    tusUploadStartUpload: 'Spustiť nahrávanie',
    tusUploadStatusChecking: 'Kontrolujem predchádzajúce nahrania...',
    tusUploadStatusCompleted: 'Nahrávanie úspešne dokončené!',
    tusUploadStatusFinalizing: 'Dokončujem nahrávanie...',
    tusUploadStatusIdle: 'Pripravené na nahrávanie',
    tusUploadStatusIdleWithRestore: 'Pripravené na pokračovanie alebo začiatok znovu',
    tusUploadStatusPaused: 'Nahrávanie pozastavené na {{progress}}%',
    tusUploadStatusUploading: 'Nahrávam... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Nemáte oprávnenie pre prístup k tomuto zdroju',
    errorCannotUploadToVideo: 'Do tohto videa sa nedá nahrávať',
    errorCreateVideoFailed: 'Nepodarilo sa vytvoriť video na Bunny CDN',
    errorDeleteFileFailed: 'Nepodarilo sa zmazať súbor: {{filename}}',
    errorInternalServer: 'Niečo sa pokazilo na našej strane',
    errorMissingRequiredFields: 'Chýbajú niektoré potrebné informácie',
    errorNoServiceConfigured: 'Žiadna služba nie je nakonfigurovaná',
    errorStreamConfigMissing: 'Bunny Stream nie je správne nakonfigurovaný',
    errorTitleRequired: 'Prosím zadajte názov vášho videa',
    errorUploadFileFailed: 'Nepodarilo sa nahrať súbor: {{filename}}',
    errorVideoInErrorState: 'Toto video malo chybu pri nahrávaní',
    errorVideoNotFound: 'Video "{{videoId}}" neexistuje',
  },
}
