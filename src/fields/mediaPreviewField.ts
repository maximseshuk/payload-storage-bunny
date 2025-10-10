import type { UIField } from 'payload'

export type MediaPreviewContentType = 'audio' | 'document' | 'image' | 'video'
export type MediaPreviewContentModeType = 'inline' | 'newTab'
export type MediaPreviewMode = 'auto' | 'fullscreen'

/**
 * Configuration for how different content types should be opened
 *
 * Supported content types:
 * - `video`: Video files (Bunny player if uploaded via Stream, native video player otherwise)
 * - `audio`: Audio files (Bunny player if uploaded via Stream, native audio player otherwise)
 * - `image`: Image files
 * - `document`: Documents (PDF, Office files, text files, etc.)
 *
 * Display modes:
 * - `inline`: Show content in modal preview
 * - `newTab`: Open content in new browser tab
 *
 * @default 'inline' for all content types
 */
export type MediaPreviewContentMode = Record<MediaPreviewContentType, MediaPreviewContentModeType>

export type MediaPreviewProps = {
  /**
   * How to open different content types
   */
  contentMode?: Partial<MediaPreviewContentMode>
  /**
   * Preview display mode
   * - 'auto': Smart mode (Cell: desktop popup / mobile fullscreen, Field: always fullscreen)
   * - 'fullscreen': Always show fullscreen modal on all devices
   * @default 'auto'
   */
  mode?: MediaPreviewMode
  /**
   * Field configuration overrides for the media preview UIField.
   * Allows customizing admin properties like position, condition, etc.
   */
  overrides?: Partial<Omit<UIField, 'name' | 'type'>>
}

/**
 * Field for displaying media preview in admin panel.
 * Automatically shows preview for all supported media types:
 * - Videos: Bunny Stream (with TUS upload) or native video player
 * - Audio: Bunny Stream (if uploaded via Stream) or native audio player
 * - Images: All image formats
 * - Documents: PDF, Office files (Word, Excel, PowerPoint), text files, etc.
 *
 * @param config - Optional preview configuration
 *
 * @example
 * ```typescript
 * import { mediaPreviewField } from '@seshuk/payload-storage-bunny'
 *
 * fields: [
 *   // Default (auto mode, inline preview for all types)
 *   mediaPreviewField(),
 *
 *   // Always fullscreen modal (even in table on desktop)
 *   mediaPreviewField({
 *     mode: 'fullscreen'
 *   }),
 *
 *   // Open specific content types in new tab
 *   mediaPreviewField({
 *     contentMode: {
 *       video: 'newTab',     // Videos in new tab
 *       audio: 'newTab',     // Audio in new tab
 *       image: 'inline',     // Images in modal
 *       document: 'newTab'   // Documents in new tab
 *     }
 *   }),
 *
 *   // Fullscreen mode + mixed content modes
 *   mediaPreviewField({
 *     mode: 'fullscreen',
 *     contentMode: {
 *       video: 'inline',     // Videos in modal
 *       audio: 'inline',     // Audio in modal
 *       image: 'newTab',     // Images in new tab
 *       document: 'newTab'   // Documents in new tab
 *     }
 *   }),
 *
 *   // Custom position
 *   mediaPreviewField({
 *     overrides: {
 *       admin: {
 *         position: 'main'
 *       }
 *     }
 *   })
 * ]
 * ```
 */
export const mediaPreviewField = (props?: MediaPreviewProps): UIField => {
  const { contentMode, mode = 'auto', overrides } = props || {}

  return {
    // @ts-expect-error - Payload supports label as a function but types are incorrect
    label: ({ t }) => t('@seshuk/payload-storage-bunny:mediaPreviewLabel'),
    ...overrides,
    name: 'bunnyMediaPreview',
    type: 'ui',
    admin: {
      components: {
        ...(overrides?.admin?.components || {}),
        Cell: {
          clientProps: {
            contentMode,
            mode,
          },
          path: '@seshuk/payload-storage-bunny/rsc#MediaPreviewCell',
        },
        Field: {
          clientProps: {
            contentMode,
            mode,
          },
          path: '@seshuk/payload-storage-bunny/rsc#MediaPreview',
        },
      },
      ...(overrides?.admin || {}),
    },
  }
}
