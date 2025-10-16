import type { PluginDefaultTranslationsObject } from '../types.js'

export const pl: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Zamknij',
    mediaPreviewLabel: 'Podgląd',
    mediaPreviewOpen: 'Otwórz',
    mediaPreviewTitleAudio: 'Podgląd audio',
    mediaPreviewTitleDocument: 'Podgląd dokumentu',
    mediaPreviewTitleImage: 'Podgląd obrazu',
    mediaPreviewTitleVideo: 'Podgląd wideo',

    // TUS Upload
    tusUploadChecking: 'Sprawdzanie poprzednich przesyłań...',
    tusUploadDisableMode: 'Wyłącz tryb TUS',
    tusUploadEnableMode: 'Włącz tryb TUS',
    tusUploadErrorFileType: 'Typ pliku nie jest dozwolony',
    tusUploadErrorInitUpload: 'Nie udało się zainicjować przesyłania',
    tusUploadErrorPrevCheckFail: 'Nie udało się sprawdzić poprzednich przesyłań',
    tusUploadErrorRestoreUpload: 'Nie udało się przywrócić przesyłania',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Finalizowanie...',
    tusUploadPause: 'Pauza',
    tusUploadPreparing: 'Przygotowywanie przesyłania...',
    tusUploadResume: 'Wznów',
    tusUploadRetry: 'Spróbuj ponownie',
    tusUploadStartOver: 'Zacznij od nowa',
    tusUploadStartUpload: 'Rozpocznij przesyłanie',
    tusUploadStatusChecking: 'Sprawdzanie poprzednich przesyłań...',
    tusUploadStatusCompleted: 'Przesyłanie zakończone pomyślnie!',
    tusUploadStatusFinalizing: 'Finalizowanie przesyłania...',
    tusUploadStatusIdle: 'Gotowe do przesyłania',
    tusUploadStatusIdleWithRestore: 'Gotowe do wznowienia lub rozpoczęcia od nowa',
    tusUploadStatusPaused: 'Przesyłanie wstrzymane na {{progress}}%',
    tusUploadStatusUploading: 'Przesyłanie... {{progress}}%',
    tusUploadTimeHours: 'g',
    tusUploadTimeMinutes: 'm',
    tusUploadTimeSeconds: 's',

    // Error messages
    errorAccessDenied: 'Nie masz uprawnień do dostępu do tego zasobu',
    errorCannotUploadToVideo: 'Nie można przesłać do tego wideo',
    errorCreateVideoFailed: 'Nie udało się utworzyć wideo na Bunny CDN',
    errorDeleteFileFailed: 'Nie udało się usunąć pliku: {{filename}}',
    errorMissingRequiredFields: 'Brakuje niektórych wymaganych informacji',
    errorNoServiceConfigured: 'Brak skonfigurowanej usługi',
    errorStreamConfigMissing: 'Bunny Stream nie jest poprawnie skonfigurowany',
    errorTitleRequired: 'Proszę wprowadzić tytuł swojego wideo',
    errorUploadFileFailed: 'Nie udało się przesłać pliku: {{filename}}',
    errorVideoInErrorState: 'To wideo miało błąd przesyłania',
    errorVideoNotFound: 'Wideo "{{videoId}}" nie istnieje',
  },
}
