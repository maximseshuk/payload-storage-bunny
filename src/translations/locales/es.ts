import type { PluginDefaultTranslationsObject } from '../types.js'

export const es: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Cerrar',
    mediaPreviewLabel: 'Vista previa',
    mediaPreviewOpen: 'Abrir',
    mediaPreviewTitleAudio: 'Vista previa de audio',
    mediaPreviewTitleDocument: 'Vista previa de documento',
    mediaPreviewTitleImage: 'Vista previa de imagen',
    mediaPreviewTitleVideo: 'Vista previa de video',

    // TUS Upload
    tusUploadChecking: 'Verificando subidas anteriores...',
    tusUploadDisableMode: 'Desactivar modo TUS',
    tusUploadEnableMode: 'Activar modo TUS',
    tusUploadErrorFileType: 'Tipo de archivo no permitido',
    tusUploadErrorInitUpload: 'Error al inicializar la subida',
    tusUploadErrorPrevCheckFail: 'Error al verificar subidas anteriores',
    tusUploadErrorRestoreUpload: 'Error al restaurar la subida',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Finalizando...',
    tusUploadPause: 'Pausar',
    tusUploadPreparing: 'Preparando subida...',
    tusUploadResume: 'Reanudar',
    tusUploadRetry: 'Reintentar',
    tusUploadStartOver: 'Empezar de nuevo',
    tusUploadStartUpload: 'Iniciar subida',
    tusUploadStatusChecking: 'Verificando subidas anteriores...',
    tusUploadStatusCompleted: '¡Subida completada con éxito!',
    tusUploadStatusFinalizing: 'Finalizando subida...',
    tusUploadStatusIdle: 'Listo para subir',
    tusUploadStatusIdleWithRestore: 'Listo para reanudar o empezar de nuevo',
    tusUploadStatusPaused: 'Subida pausada en {{progress}}%',
    tusUploadStatusUploading: 'Subiendo... {{progress}}%',

    // Error messages
    errorAccessDenied: 'No tienes permiso para acceder a este recurso',
    errorCannotUploadToVideo: 'No se puede subir a este video',
    errorCreateVideoFailed: 'No se pudo crear el video en Bunny CDN',
    errorDeleteFileFailed: 'No se pudo eliminar el archivo: {{filename}}',
    errorMissingRequiredFields: 'Falta información requerida',
    errorNoServiceConfigured: 'No hay servicio configurado',
    errorStreamConfigMissing: 'Bunny Stream no está configurado correctamente',
    errorTitleRequired: 'Por favor ingresa un título para tu video',
    errorUploadFileFailed: 'No se pudo subir el archivo: {{filename}}',
    errorVideoInErrorState: 'Este video tuvo un error de subida',
    errorVideoNotFound: 'El video "{{videoId}}" no existe',
  },
}
