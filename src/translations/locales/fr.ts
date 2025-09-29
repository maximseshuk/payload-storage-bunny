import type { PluginDefaultTranslationsObject } from '../types.js'

export const fr: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Vérification des téléchargements précédents...',
    tusUploadDisableMode: 'Désactiver le mode TUS',
    tusUploadEnableMode: 'Activer le mode TUS',
    tusUploadErrorFileType: 'Type de fichier non autorisé',
    tusUploadErrorInitUpload: 'Échec de l\'initialisation du téléchargement',
    tusUploadErrorPrevCheckFail: 'Échec de la vérification des téléchargements précédents',
    tusUploadErrorRestoreUpload: 'Échec de la restauration du téléchargement',
    tusUploadFileSize: '{{size}} Mo',
    tusUploadFinalizing: 'Finalisation...',
    tusUploadPause: 'Pause',
    tusUploadPreparing: 'Préparation du téléchargement...',
    tusUploadResume: 'Reprendre',
    tusUploadRetry: 'Réessayer',
    tusUploadStartOver: 'Recommencer',
    tusUploadStartUpload: 'Commencer le téléchargement',
    tusUploadStatusChecking: 'Vérification des téléchargements précédents...',
    tusUploadStatusCompleted: 'Téléchargement terminé avec succès !',
    tusUploadStatusFinalizing: 'Finalisation du téléchargement...',
    tusUploadStatusIdle: 'Prêt à télécharger',
    tusUploadStatusIdleWithRestore: 'Prêt à reprendre ou recommencer',
    tusUploadStatusPaused: 'Téléchargement mis en pause à {{progress}}%',
    tusUploadStatusUploading: 'Téléchargement en cours... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Vous n\'avez pas la permission d\'accéder à cette ressource',
    errorCannotUploadToVideo: 'Impossible de télécharger vers cette vidéo',
    errorCreateVideoFailed: 'Impossible de créer la vidéo sur Bunny CDN',
    errorDeleteFileFailed: 'Impossible de supprimer le fichier : {{filename}}',
    errorInternalServer: 'Une erreur s\'est produite de notre côté',
    errorMissingRequiredFields: 'Certaines informations requises sont manquantes',
    errorNoServiceConfigured: 'Aucun service configuré',
    errorStreamConfigMissing: 'Bunny Stream n\'est pas configuré correctement',
    errorTitleRequired: 'Veuillez saisir un titre pour votre vidéo',
    errorUploadFileFailed: 'Impossible de télécharger le fichier : {{filename}}',
    errorVideoInErrorState: 'Cette vidéo a eu une erreur de téléchargement',
    errorVideoNotFound: 'La vidéo "{{videoId}}" n\'existe pas',
  },
}
