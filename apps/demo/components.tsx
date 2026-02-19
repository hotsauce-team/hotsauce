/** @jsxRuntime classic */
/** @jsx React.createElement */
/**
 * User Puck Components
 *
 * This file is built separately from the CMS editor bundle.
 * Build with: deno task build:components
 *
 * Export `puckProps` with `config` inside it — all Puck props in one place.
 */

import { DropZone, React } from '@hotsauce/plugins/puck/client/globals';
import type { ComponentConfig, PuckProps } from '@hotsauce/plugins/puck/types';

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
// Image
// ============================================================================

const Image: ComponentConfig = {
  label: 'Image',
  fields: {
    url: { type: 'text', label: 'Image URL' },
    alt: { type: 'text', label: 'Alt text' },
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
    url: 'https://placehold.co/600x400',
    alt: 'Placeholder image',
    aspectRatio: 'auto',
  },
  render: ({ url, alt, aspectRatio }) => {
    const ratioMod = aspectRatio === '16:9'
      ? 'image--ratio-16-9'
      : aspectRatio === '4:3'
      ? 'image--ratio-4-3'
      : aspectRatio === '1:1'
      ? 'image--ratio-1-1'
      : 'image--ratio-auto';
    return (
      <img
        src={url as string}
        alt={alt as string}
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
      return <div>{richtext}</div>;
    }

    return <div dangerouslySetInnerHTML={{ __html: richtext as string }} />;
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
      // deno-lint-ignore no-explicit-any
      render: ({ children, title }: any) => (
        <main data-page-title={title}>
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
