import type { PluginDefaultTranslationsObject } from '../types.js'

export const hy: PluginDefaultTranslationsObject = {
  '@seshuk/payload-storage-bunny': {
    // TUS Upload
    tusUploadChecking: 'Նախորդ վերբեռնումների ստուգում...',
    tusUploadDisableMode: 'Անջատել TUS ռեժիմը',
    tusUploadEnableMode: 'Միացնել TUS ռեժիմը',
    tusUploadErrorFileType: 'Ֆայլի տեսակը թույլատրված չէ',
    tusUploadErrorInitUpload: 'Չհաջողվեց սկսել վերբեռնումը',
    tusUploadErrorPrevCheckFail: 'Չհաջողվեց ստուգել նախորդ վերբեռնումները',
    tusUploadErrorRestoreUpload: 'Չհաջողվեց վերականգնել վերբեռնումը',
    tusUploadFileSize: '{{size}} ՄԲ',
    tusUploadFinalizing: 'Ավարտվում է...',
    tusUploadPause: 'Դադար',
    tusUploadPreparing: 'Վերբեռնման պատրաստում...',
    tusUploadResume: 'Շարունակել',
    tusUploadRetry: 'Կրկին փորձել',
    tusUploadStartOver: 'Սկսել նորից',
    tusUploadStartUpload: 'Սկսել վերբեռնումը',
    tusUploadStatusChecking: 'Նախորդ վերբեռնումների ստուգում...',
    tusUploadStatusCompleted: 'Վերբեռնումը հաջողությամբ ավարտվեց:',
    tusUploadStatusFinalizing: 'Վերբեռնման ավարտում...',
    tusUploadStatusIdle: 'Պատրաստ է վերբեռնման համար',
    tusUploadStatusIdleWithRestore: 'Պատրաստ է շարունակել կամ սկսել նորից',
    tusUploadStatusPaused: 'Վերբեռնումը դադարեցվել է {{progress}}%-ում',
    tusUploadStatusUploading: 'Վերբեռնվում է... {{progress}}%',

    // Error messages
    errorAccessDenied: 'Դուք թույլտվություն չունեք այս ռեսուրսին մուտք գործելու համար',
    errorCannotUploadToVideo: 'Այս տեսանյութին վերբեռնել հնարավор չէ',
    errorCreateVideoFailed: 'Չհաջողվեց տեսանյութ ստեղծել Bunny CDN-ում',
    errorDeleteFileFailed: 'Չհաջողվեց ջնջել ֆայլը՝ {{filename}}',
    errorInternalServer: 'Ինչ-որ բան սխալվեց մեր կողմից',
    errorMissingRequiredFields: 'Մի քանի անհրաժեշտ տվյալներ բացակայում են',
    errorNoServiceConfigured: 'Ոչ մի ծառայություն կարգավորված չէ',
    errorStreamConfigMissing: 'Bunny Stream-ը ճիշտ կարգավորված չէ',
    errorTitleRequired: 'Խնդրում ենք մուտքագրել ձեր տեսանյութի վերնագիր',
    errorUploadFileFailed: 'Չհաջողվեց վերբեռնել ֆայլը՝ {{filename}}',
    errorVideoInErrorState: 'Այս տեսանյութը վերբեռնման սխալ է ունեցել',
    errorVideoNotFound: '«{{videoId}}» տեսանյութը գոյություն չունի',
  },
}
