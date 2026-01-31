# @drizzle-cms/vendor

Vendored third-party dependencies with typed wrappers.

## Why Vendor?

The CMS maintains a strict policy of **zero runtime dependencies** beyond drizzle-orm, postgres, zod, and drizzle-zod. However, some functionality (like QR code generation) requires complex algorithms that would be impractical to implement from scratch.

Vendoring allows us to:

- Include battle-tested code without adding npm dependencies
- Maintain full control over the code we ship
- Provide typed APIs on top of untyped libraries
- Keep explicit license attribution

## Included Libraries

### qrcode-generator

**Source:** [kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)\
**Version:** 2.0.4\
**License:** MIT\
**Size:** ~50KB (ES module with TypeScript declarations, zero dependencies)

QR Code Generator implementing ISO/IEC 18004 with Reed-Solomon error correction.

#### API

```typescript
import { qrcode } from '@drizzle-cms/vendor';

// Create QR code (0 = auto-detect type, 'M' = medium error correction)
const qr = qrcode(0, 'M');
qr.addData('https://example.com');
qr.make();

// Output formats
qr.createSvgTag(4, 4); // SVG markup
qr.createDataURL(4, 4); // data:image/gif;base64,...
qr.createASCII(1, 1); // Terminal output (Unicode)
qr.createImgTag(4, 4); // <img> tag with data URL
qr.createTableTag(4, 4); // HTML table
```

See [qrcode-generator docs](https://github.com/kazuhikoarase/qrcode-generator#api-documentation) for full API.

## Adding New Vendored Libraries

When adding a new library:

1. Create a subdirectory: `packages/vendor/<library-name>/`
2. Copy the source file(s) and LICENSE
3. Create a typed wrapper in `packages/vendor/<name>.ts`
4. Export from `mod.ts`
5. Document in this README

Requirements for vendored code:

- **MIT, Apache 2.0, or BSD license** (compatible with our MIT license)
- **Zero dependencies** (must be self-contained)
- **Small footprint** (ideally under 100KB)
- **Stable, battle-tested** (mature projects only)
- **Clear use case** that can't be reasonably implemented ourselves
