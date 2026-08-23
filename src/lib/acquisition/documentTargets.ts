import type { RemoteDocumentTargetV2 } from './types';

/**
 * V2 document-provider representations. Site knowledge belongs here, not in
 * the generic Chrome byte-transfer capability or the legacy fetch router.
 */
export function remoteDocumentTargetsV2(url: string): RemoteDocumentTargetV2[] {
  try {
    const parsed = new URL(url);
    const targets: RemoteDocumentTargetV2[] = [{ url, sessionUrl: `${parsed.origin}/` }];
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const openReviewId = host === 'openreview.net'
      ? parsed.pathname.match(/^\/pdf\/([a-f0-9]{40})(?:\.pdf)?$/i)?.[1]
      : undefined;
    if (openReviewId) {
      targets.push(
        {
          url: `https://api2.openreview.net/pdf/${openReviewId}.pdf`,
          sessionUrl: 'https://api2.openreview.net/notes?limit=1',
        },
        {
          url: `https://api2.openreview.net/pdf/${openReviewId}`,
          sessionUrl: 'https://api2.openreview.net/notes?limit=1',
        }
      );
    }
    return targets;
  } catch {
    return [{ url, sessionUrl: url }];
  }
}
