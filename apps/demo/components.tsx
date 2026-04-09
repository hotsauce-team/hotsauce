/** @jsxRuntime classic */
/** @jsx React.createElement */
/**
 * User Puck Components
 *
 * This file is built separately from the CMS editor bundle.
 * Build with: deno task bundle
 *
 * Export `puckProps` with `config` inside it — all Puck props in one place.
 */

import { DropZone, React } from '@hotsauce/plugins/puck/client/globals';
import type { ComponentConfig, PuckProps } from '@hotsauce/plugins/puck/types';

// ============================================================================
// Media Reference type (matches CMS media table structure)
// ============================================================================

/**
 * Reference to a media record stored in the CMS.
 * Used by Puck components to reference images from the media table.
 */
type MediaReference = {
  /** Primary key from the media table */
  id: number;
  /** Resolved URL for display (may be presigned S3 URL or data: URI) */
  url: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Original filename */
  filename?: string;
};

// ============================================================================
// ImagePicker - Custom field component for selecting images from CMS media
// ============================================================================

/**
 * Custom Puck field component that opens a media picker dialog.
 *
 * Opens the CMS grid view in an iframe with `?picker=true` mode.
 * When the user clicks an image, the picker posts a `cms:media-selected`
 * message containing the record data and resolved URL.
 *
 * @example
 * ```tsx
 * // In a Puck component config:
 * fields: {
 *   image: {
 *     type: 'custom',
 *     label: 'Image',
 *     render: ({ value, onChange }) => (
 *       <ImagePickerField value={value} onChange={onChange} />
 *     ),
 *   },
 * }
 * ```
 */
function ImagePickerField({
  value,
  onChange,
  basePath = '/admin',
}: {
  value: MediaReference | null;
  onChange: (value: MediaReference | null) => void;
  /** Base path where the CMS is mounted (default: '/admin') */
  basePath?: string;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  // Handle postMessage from picker iframe
  React.useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'cms:media-selected') {
        const record = event.data.record;
        const file = record?.file;
        // Use resolved URL from picker (handles S3 presigned URLs)
        // Fall back to file.url or data: URI for DB-stored files
        const url = event.data.url ||
          file?.url ||
          (file?.data ? `data:${file.contentType};base64,${file.data}` : null);

        if (url) {
          onChange({
            id: record.id,
            url,
            alt: record.alt || '',
            filename: file?.filename || '',
          });
        }
        setIsOpen(false);
        dialogRef.current?.close();
      }
    }

    if (isOpen) {
      // deno-lint-ignore no-window no-window-prefix
      window.addEventListener('message', handleMessage);
      // deno-lint-ignore no-window no-window-prefix
      return () => window.removeEventListener('message', handleMessage);
    }
  }, [isOpen, onChange]);

  const openPicker = () => {
    setIsOpen(true);
    dialogRef.current?.showModal();
  };

  const clearSelection = () => {
    onChange(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {value?.url
        ? (
          <div style={{ position: 'relative' }}>
            <img
              src={value.url}
              alt={value.alt || ''}
              style={{
                width: '100%',
                maxHeight: '200px',
                objectFit: 'contain',
                borderRadius: '4px',
                backgroundColor: '#f0f0f0',
              }}
            />
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
              {value.filename || `ID: ${value.id}`}
            </div>
          </div>
        )
        : (
          <div
            style={{
              width: '100%',
              height: '100px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              color: '#999',
            }}
          >
            No image selected
          </div>
        )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type='button'
          onClick={openPicker}
          style={{
            flex: 1,
            padding: '8px 12px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {value ? 'Change Image' : 'Pick Image'}
        </button>
        {value && (
          <button
            type='button'
            onClick={clearSelection}
            style={{
              padding: '8px 12px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Remove
          </button>
        )}
      </div>

      <dialog
        ref={dialogRef}
        style={{
          width: '90vw',
          maxWidth: '900px',
          height: '80vh',
          padding: 0,
          border: 'none',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
        onClose={() => setIsOpen(false)}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '1px solid #eee',
              backgroundColor: '#f9f9f9',
            }}
          >
            <strong>Select Image</strong>
            <button
              type='button'
              onClick={() => {
                setIsOpen(false);
                dialogRef.current?.close();
              }}
              style={{
                padding: '4px 12px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
          {isOpen && (
            <iframe
              src={`${basePath}/media?picker=true`}
              style={{
                flex: 1,
                width: '100%',
                border: 'none',
              }}
            />
          )}
        </div>
      </dialog>
    </div>
  );
}

// ============================================================================
// Heading
// ============================================================================

const Heading: ComponentConfig = {
  label: 'Heading',
  fields: {
    text: { type: 'textarea', label: 'Text', contentEditable: true },
    level: {
      type: 'select',
      label: 'Level',
      options: [
        { label: 'H1', value: 'h1' },
        { label: 'H2', value: 'h2' },
        { label: 'H3', value: 'h3' },
        { label: 'H4', value: 'h4' },
        { label: 'H5', value: 'h5' },
        { label: 'H6', value: 'h6' },
      ],
    },
    align: {
      type: 'radio',
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
      ],
    },
  },
  defaultProps: {
    text: 'Heading',
    level: 'h2',
    align: 'left',
  },
  render: ({ text, level, align }) => {
    const Tag = level as keyof React.JSX.IntrinsicElements;
    const className = `heading heading--align-${align}`;
    // text is string | ReactNode when contentEditable is true
    return (
      <Tag className={className}>{text satisfies string | React.ReactNode}</Tag>
    );
  },
};

// ============================================================================
// Text
// ============================================================================

const Text: ComponentConfig = {
  label: 'Text',
  fields: {
    text: { type: 'textarea', label: 'Text', contentEditable: true },
    align: {
      type: 'radio',
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
      ],
    },
    size: {
      type: 'radio',
      label: 'Size',
      options: [
        { label: 'S', value: 'small' },
        { label: 'M', value: 'medium' },
        { label: 'L', value: 'large' },
      ],
    },
  },
  defaultProps: {
    text: 'Add your text here.',
    align: 'left',
    size: 'medium',
  },
  render: ({ text, align, size }) => {
    const className = `text text--align-${align} text--size-${size}`;
    // text is string | ReactNode when contentEditable is true
    return <p className={className}>{text as React.ReactNode}</p>;
  },
};

// ============================================================================
// Button
// ============================================================================

const Button: ComponentConfig = {
  label: 'Button',
  fields: {
    label: { type: 'text', label: 'Label', contentEditable: true },
    href: { type: 'text', label: 'Link URL' },
    variant: {
      type: 'radio',
      label: 'Style',
      options: [
        { label: 'Primary', value: 'primary' },
        { label: 'Secondary', value: 'secondary' },
      ],
    },
  },
  defaultProps: {
    label: 'Click me',
    href: '#',
    variant: 'primary',
  },
  render: ({ label, href, variant, puck }) => {
    const isEditing = (puck as { isEditing?: boolean })?.isEditing;
    const className = `button button--${variant}`;
    return (
      <a
        href={isEditing ? '#' : href as string}
        tabIndex={isEditing ? -1 : undefined}
        className={className}
      >
        {/* label is string | ReactNode when contentEditable is true */}
        {label as React.ReactNode}
      </a>
    );
  },
};

// ============================================================================
// Image - Uses ImagePickerField to select images from CMS media table
// ============================================================================

const Image: ComponentConfig = {
  label: 'Image',
  fields: {
    media: {
      type: 'custom',
      label: 'Image',
      render: ({ value, onChange }) => (
        <ImagePickerField
          value={value as MediaReference | null}
          onChange={onChange}
        />
      ),
    },
    aspectRatio: {
      type: 'select',
      label: 'Aspect Ratio',
      options: [
        { label: 'Auto', value: 'auto' },
        { label: '16:9', value: '16:9' },
        { label: '4:3', value: '4:3' },
        { label: '1:1', value: '1:1' },
      ],
    },
  },
  defaultProps: {
    media: null,
    aspectRatio: 'auto',
  },
  render: ({ media, aspectRatio }) => {
    const m = media as MediaReference | null;
    const ratioMod = aspectRatio === '16:9'
      ? 'image--ratio-16-9'
      : aspectRatio === '4:3'
      ? 'image--ratio-4-3'
      : aspectRatio === '1:1'
      ? 'image--ratio-1-1'
      : 'image--ratio-auto';

    if (!m?.url) {
      return (
        <div
          className={`image image--placeholder ${ratioMod}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f0f0f0',
            color: '#666',
            minHeight: '150px',
          }}
        >
          No image selected
        </div>
      );
    }

    return (
      <img
        src={m.url}
        alt={m.alt || ''}
        className={`image ${ratioMod}`}
      />
    );
  },
};

// ============================================================================
// Section (container with nested content)
// ============================================================================

const Section: ComponentConfig = {
  label: 'Section',
  fields: {
    padding: {
      type: 'select',
      label: 'Padding',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Small', value: 'small' },
        { label: 'Medium', value: 'medium' },
        { label: 'Large', value: 'large' },
      ],
    },
    background: {
      type: 'select',
      label: 'Background',
      options: [
        { label: 'None', value: 'transparent' },
        { label: 'Light Gray', value: '#f5f5f5' },
        { label: 'Dark', value: '#1a1a1a' },
        { label: 'Primary', value: '#0066cc' },
      ],
    },
    maxWidth: {
      type: 'select',
      label: 'Max Width',
      options: [
        { label: 'Full', value: 'none' },
        { label: 'Large (1200px)', value: '1200px' },
        { label: 'Medium (960px)', value: '960px' },
        { label: 'Small (720px)', value: '720px' },
      ],
    },
  },
  defaultProps: {
    padding: 'medium',
    background: 'transparent',
    maxWidth: 'none',
  },
  render: ({ padding, background, maxWidth }) => {
    // Map values to BEM modifier suffixes
    const paddingMod = `section--padding-${padding}`;
    const bgMod = background === 'transparent'
      ? 'section--bg-transparent'
      : background === '#f5f5f5'
      ? 'section--bg-light'
      : background === '#1a1a1a'
      ? 'section--bg-dark'
      : 'section--bg-primary';
    const widthMod = maxWidth === 'none'
      ? 'section--width-full'
      : maxWidth === '1200px'
      ? 'section--width-large'
      : maxWidth === '960px'
      ? 'section--width-medium'
      : 'section--width-small';

    return (
      <section className={`section ${paddingMod} ${bgMod} ${widthMod}`}>
        <DropZone zone='content' />
      </section>
    );
  },
};

// ============================================================================
// Space (vertical spacing)
// ============================================================================

const Space: ComponentConfig = {
  label: 'Space',
  fields: {
    size: {
      type: 'radio',
      label: 'Size',
      options: [
        { label: 'S', value: 'small' },
        { label: 'M', value: 'medium' },
        { label: 'L', value: 'large' },
      ],
    },
  },
  defaultProps: {
    size: 'medium',
  },
  render: ({ size }) => {
    return <div className={`space space--size-${size}`} />;
  },
};

// ============================================================================
// RichText (rich text editor component using contentEditable)
// ============================================================================

const RichText: ComponentConfig = {
  label: 'RichText',
  fields: {
    richtext: { type: 'richtext', contentEditable: true, label: 'Rich Text' },
  },
  render: (props) => {
    const { richtext, puck: { isEditing } } = props;

    if (isEditing) {
      return <div className='richtext'>{richtext}</div>;
    }

    return (
      <div
        className='richtext'
        dangerouslySetInnerHTML={{ __html: richtext as string }}
      />
    );
  },
};

// ============================================================================
// Export puckProps - all Puck configuration in one place
// ============================================================================

export const puckProps: PuckProps = {
  headerTitle: 'Page Builder',
  iframe: {
    waitForStyles: false, // For the RichText component.
  },
  config: {
    // Page-level fields editable in sidebar, rendered as wrapper
    root: {
      fields: {
        title: { type: 'text', label: 'Page Title' },
        description: { type: 'textarea', label: 'Meta Description' },
      },
      defaultProps: {
        title: '',
        description: '',
      },
      render: (
        { children, title }: { children?: React.ReactNode; title?: string },
      ) => (
        <main data-page-title={title ?? ''}>
          {children}
        </main>
      ),
    },
    components: {
      Section,
      Heading,
      Text,
      Button,
      Image,
      Space,
      RichText,
    },
  },
};
