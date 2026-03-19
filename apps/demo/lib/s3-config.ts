type S3UrlStyle = 'virtual-hosted' | 'path';

export interface DemoS3Config {
  endpoint: string;
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  urlStyle: S3UrlStyle;
}

function parseS3UrlStyle(value: string | undefined): S3UrlStyle | undefined {
  const allowed = ['path', 'virtual-hosted'] as const;
  return value && allowed.includes(value as S3UrlStyle)
    ? value as S3UrlStyle
    : undefined;
}

function deriveS3UrlStyle(endpoint: string): S3UrlStyle {
  try {
    const { hostname, port } = new URL(endpoint);
    const awsHost = hostname === 's3.amazonaws.com' ||
      hostname.endsWith('.amazonaws.com');
    if (awsHost && !port) {
      return 'virtual-hosted';
    }
  } catch {
    // Keep path style when endpoint isn't a parseable URL.
  }

  // Path style is the safest default for MinIO, R2, and local/dev setups.
  return 'path';
}

/**
 * Resolve demo S3 configuration from environment variables.
 * Returns undefined when required values are missing.
 */
export function getDemoS3Config(): DemoS3Config | undefined {
  const endpoint = Deno.env.get('S3_ENDPOINT');
  const bucket = Deno.env.get('S3_BUCKET');
  const accessKeyId = Deno.env.get('S3_ACCESS_KEY');
  const secretAccessKey = Deno.env.get('S3_SECRET_KEY');
  const urlStyle = parseS3UrlStyle(Deno.env.get('S3_URL_STYLE')) ??
    deriveS3UrlStyle(endpoint ?? '');

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return undefined;
  }

  // deno-lint-ignore no-console
  console.log('S3 config found for:', endpoint);

  return {
    endpoint,
    publicEndpoint: Deno.env.get('S3_PUBLIC_ENDPOINT') ?? endpoint,
    region: Deno.env.get('S3_REGION') ?? 'us-east-1',
    bucket,
    accessKeyId,
    secretAccessKey,
    urlStyle,
  };
}
