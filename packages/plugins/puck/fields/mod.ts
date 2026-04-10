/**
 * Puck field components for CMS integration.
 *
 * @example
 * ```tsx
 * import { ImagePickerField, SelectedImage } from '@hotsauce/plugins/puck/fields';
 *
 * const Image: ComponentConfig = {
 *   fields: {
 *     media: {
 *       type: 'custom',
 *       label: 'Image',
 *       render: ({ value, onChange }) => (
 *         <ImagePickerField value={value} onChange={onChange} />
 *       ),
 *     },
 *   },
 * };
 * ```
 *
 * @module
 */

export {
  ImagePickerField,
  type ImagePickerFieldProps,
  type SelectedImage,
} from './ImagePickerField.tsx';
