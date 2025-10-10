import React, { useMemo } from 'react'

export type ViewerProps = {
  className?: string
  media: {
    documentViewerUrl?: null | string
    embedUrl?: null | string
    mimeType?: string
    url?: string
  }
  refs?: {
    audioRef?: React.RefObject<HTMLAudioElement | null>
    iframeRef?: React.RefObject<HTMLIFrameElement | null>
    imgRef?: React.RefObject<HTMLImageElement | null>
    videoRef?: React.RefObject<HTMLVideoElement | null>
  }
  settings?: {
    autoPlay?: boolean
    controls?: boolean
    loop?: boolean
    muted?: boolean
    preload?: 'auto' | 'metadata' | 'none'
  }
  title?: string
}

export const MediaPreviewViewer: React.FC<ViewerProps> = ({ className, media, refs, settings, title }) => {
  const { documentViewerUrl, embedUrl, mimeType, url } = media
  const { audioRef, iframeRef, imgRef, videoRef } = refs || {}
  const { autoPlay = true, controls = true, loop = false, muted = false, preload = 'metadata' } = settings || {}

  const isAudio = useMemo(() => mimeType?.startsWith('audio/'), [mimeType])
  const isVideo = useMemo(() => mimeType?.startsWith('video/'), [mimeType])
  const isImage = useMemo(() => mimeType?.startsWith('image/'), [mimeType])

  if (isAudio) {
    if (embedUrl) {
      return (
        // eslint-disable-next-line @eslint-react/dom/no-missing-iframe-sandbox
        <iframe
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
          className={className}
          loading="lazy"
          ref={iframeRef}
          src={embedUrl}
          title={title}
        />
      )
    }

    if (url) {
      return (
        <audio
          autoPlay={autoPlay}
          className={className}
          controls={controls}
          loop={loop}
          muted={muted}
          preload={preload}
          ref={audioRef}
          title={title}
        >
          <source src={url} type={mimeType} />
          <track kind="captions" />
          Your browser does not support the audio element.
        </audio>
      )
    }
  }

  if (isVideo) {
    if (embedUrl) {
      return (
        // eslint-disable-next-line @eslint-react/dom/no-missing-iframe-sandbox
        <iframe
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
          className={className}
          loading="lazy"
          ref={iframeRef}
          src={embedUrl}
          title={title}
        />
      )
    }

    if (url) {
      return (
        <video
          autoPlay={autoPlay}
          className={className}
          controls={controls}
          loop={loop}
          muted={muted}
          playsInline={autoPlay}
          preload={preload}
          ref={videoRef}
          title={title}
        >
          <source src={url} type={mimeType} />
          <track kind="captions" />
          Your browser does not support the video tag.
        </video>
      )
    }
  }

  if (isImage && url) {
    return <img alt={title || 'Image preview'} className={className} ref={imgRef} src={url} />
  }

  if (documentViewerUrl) {
    return (
      // eslint-disable-next-line @eslint-react/dom/no-missing-iframe-sandbox
      <iframe className={className} ref={iframeRef} src={documentViewerUrl} title={title || 'Document preview'} />
    )
  }

  return null
}
