import type { PluginDefaultTranslationsObject } from '../types.js'

export const pt: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // Media Preview
    mediaPreviewClose: 'Fechar',
    mediaPreviewLabel: 'Visualização',
    mediaPreviewOpen: 'Abrir',
    mediaPreviewTitleAudio: 'Pré-visualização de áudio',
    mediaPreviewTitleDocument: 'Pré-visualização de documento',
    mediaPreviewTitleImage: 'Pré-visualização de imagem',
    mediaPreviewTitleVideo: 'Pré-visualização de vídeo',

    // TUS Upload
    tusUploadChecking: 'Verificando uploads anteriores...',
    tusUploadDisableMode: 'Desativar modo TUS',
    tusUploadEnableMode: 'Ativar modo TUS',
    tusUploadErrorFileType: 'Tipo de arquivo não permitido',
    tusUploadErrorInitUpload: 'Falha ao inicializar o upload',
    tusUploadErrorPrevCheckFail: 'Falha ao verificar uploads anteriores',
    tusUploadErrorRestoreUpload: 'Falha ao restaurar upload',
    tusUploadFileSize: '{{size}} MB',
    tusUploadFinalizing: 'Finalizando...',
    tusUploadPause: 'Pausar',
    tusUploadPreparing: 'Preparando upload...',
    tusUploadResume: 'Continuar',
    tusUploadRetry: 'Tentar novamente',
    tusUploadStartOver: 'Começar do início',
    tusUploadStartUpload: 'Iniciar upload',
    tusUploadStatusChecking: 'Verificando uploads anteriores...',
    tusUploadStatusCompleted: 'Upload concluído com sucesso!',
    tusUploadStatusFinalizing: 'Finalizando upload...',
    tusUploadStatusIdle: 'Pronto para upload',
    tusUploadStatusIdleWithRestore: 'Pronto para continuar ou começar do início',
    tusUploadStatusPaused: 'Upload pausado em {{progress}}%',
    tusUploadStatusUploading: 'Fazendo upload... {{progress}}%',
    tusUploadTimeHours: 'h',
    tusUploadTimeMinutes: 'm',
    tusUploadTimeSeconds: 's',

    // Error messages
    errorAccessDenied: 'Você não tem permissão para acessar este recurso',
    errorCannotUploadToVideo: 'Não é possível fazer upload para este vídeo',
    errorCreateVideoFailed: 'Não foi possível criar vídeo no Bunny CDN',
    errorDeleteFileFailed: 'Não foi possível deletar arquivo: {{filename}}',
    errorMissingRequiredFields: 'Algumas informações obrigatórias estão faltando',
    errorNoServiceConfigured: 'Nenhum serviço configurado',
    errorStreamConfigMissing: 'Bunny Stream não está configurado adequadamente',
    errorTitleRequired: 'Por favor, digite um título para seu vídeo',
    errorUploadFileFailed: 'Não foi possível fazer upload do arquivo: {{filename}}',
    errorVideoInErrorState: 'Este vídeo teve um erro de upload',
    errorVideoNotFound: 'Vídeo "{{videoId}}" não existe',
  },
}
