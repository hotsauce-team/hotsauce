/// <reference lib="dom" />
/** @jsxRuntime classic */
/** @jsx React.createElement */
/**
 * ImagePickerField - Custom Puck field for selecting images from CMS
 *
 * Opens the CMS grid view in an iframe with `?picker=true` mode.
 * When the user clicks an image, the picker posts a `cms:media-selected`
 * message containing the record data and resolved URL.
 *
 * @module
 */

import { React } from '../client/globals.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * A selected image from the CMS image picker.
 * Stores only identifiers — URLs are constructed at render time.
 *
 * Works with any table containing image files (e.g., media, photos, avatars).
 */
export type SelectedImage = {
  /** Primary key from the table */
  id: number;
  /** Table name (e.g. 'media', 'photos', 'avatars') */
  table: string;
  /** File column name (e.g. 'file', 'image') */
  column: string;
  /** Alt text seeded from the record (can be overridden per usage) */
  alt?: string;
  /** Original filename (display only) */
  filename?: string;
};

/**
 * Props for ImagePickerField component.
 */
export type ImagePickerFieldProps = {
  /** Current selected image, or null if none */
  value: SelectedImage | null;
  /** Callback when selection changes */
  onChange: (value: SelectedImage | null) => void;
  /** Base path where the CMS is mounted (default: '/admin') */
  basePath?: string;
  /** Table name to pick from (default: 'media') */
  table?: string;
  /** File column name on the table (default: 'file') */
  column?: string;
  /** Column name for alt text on the record (default: 'alt') */
  altField?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Custom Puck field component that opens an image picker dialog.
 *
 * Opens the CMS grid view in an iframe with `?picker=true` mode.
 * When the user clicks an image, the picker posts a `cms:media-selected`
 * message containing the record data and resolved URL.
 *
 * @example
 * ```tsx
 * import { ImagePickerField, SelectedImage } from '@hotsauce/plugins/puck/fields';
 *
 * const Image: ComponentConfig = {
 *   label: 'Image',
 *   fields: {
 *     media: {
 *       type: 'custom',
 *       label: 'Image',
 *       render: ({ value, onChange }) => (
 *         <ImagePickerField
 *           value={value as SelectedImage | null}
 *           onChange={onChange}
 *         />
 *       ),
 *     },
 *   },
 *   // ...
 * };
 * ```
 */
export function ImagePickerField({
  value,
  onChange,
  basePath = '/admin',
  table = 'media',
  column = 'file',
  altField = 'alt',
}: ImagePickerFieldProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Handle postMessage from picker iframe
  React.useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Validate message source is our iframe (prevents spoofing from other scripts/tabs)
      if (event.source !== iframeRef.current?.contentWindow) return;

      if (event.data?.type === 'cms:media-selected') {
        const record = event.data.record;
        const file = record?.[column];

        if (record?.id != null) {
          onChange({
            id: record.id,
            table: event.data.table || table,
            column,
            alt: (altField && record[altField]) || '',
            filename: file?.filename || '',
          });
        }
        setIsOpen(false);
        dialogRef.current?.close();
      }
    }

    if (isOpen) {
      globalThis.addEventListener('message', handleMessage);
      return () => globalThis.removeEventListener('message', handleMessage);
    }
  }, [isOpen, onChange, column, table, altField]);

  const openPicker = () => {
    setIsOpen(true);
    dialogRef.current?.showModal();
  };

  const clearSelection = () => {
    onChange(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {value?.id
        ? (
          <div style={{ position: 'relative' }}>
            <img
              src={`${basePath}/files/${value.table}/${value.column}/${value.id}${
                value.filename ? `/${encodeURIComponent(value.filename)}` : ''
              }`}
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
              ref={iframeRef}
              src={`${basePath}/${table}?picker=true`}
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
