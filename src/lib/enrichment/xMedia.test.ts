import {
  buildMediaPrimaryMechanicalSummary,
  formatDuration,
  formatVideoAnnotationLines,
  isMediaPrimaryXContent,
  substantiveXContentLength,
  videoEntries,
} from './xMedia';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(formatDuration(125.116) === '2:05', 'formatDuration');
assert(
  formatVideoAnnotationLines(
    [{ url: 'https://video.twimg.com/x.mp4', thumbnail_url: 'https://pbs.twimg.com/t.jpg', duration: 90 }],
    { statusUrl: 'https://x.com/sdrzn/status/1/video/1' }
  ).join('\n').includes('Video: https://x.com/sdrzn/status/1/video/1'),
  'video annotation uses status url'
);

const philfungBody = [
  '# @philfung',
  '',
  'With @Cline 3.4, install MCP servers with one click via MCP Marketplace.',
  '',
  '> Quote from @sdrzn:',
  '> Cline v3.4 is out with MCP Marketplace!',
  '',
  'Video: https://x.com/sdrzn/status/1892262424881090721/video/1',
  'Thumbnail: https://pbs.twimg.com/ext_tw_video_thumb/x.jpg',
  '(2:05 — not transcribed)',
].join('\n');

assert(!isMediaPrimaryXContent(philfungBody), 'philfung quote+text is not media-primary');
assert(substantiveXContentLength(philfungBody) >= 80, 'philfung has substantive text');

const imageOnlyBody = [
  '# @HangukQuant',
  '',
  'Image: https://pbs.twimg.com/media/chart.jpg',
  '(1 photo(s) attached)',
].join('\n');

assert(!isMediaPrimaryXContent(imageOnlyBody), 'image-only is not video-primary');

const videoOnlyBody = [
  '# @someone',
  '',
  'Video: https://x.com/someone/status/1/video/1',
  'Thumbnail: https://pbs.twimg.com/t.jpg',
  '(1:30 — not transcribed)',
].join('\n');
assert(isMediaPrimaryXContent(videoOnlyBody), 'video-only thin body is video-primary');

const quoteVideos = videoEntries({
  videos: [
    {
      url: 'https://video.twimg.com/x.mp4',
      thumbnail_url: 'https://pbs.twimg.com/t.jpg',
      duration: 125,
      width: 1620,
      height: 1080,
      type: 'video',
    },
  ],
});
const quoteVideoMd = formatVideoAnnotationLines(quoteVideos, {
  statusUrl: 'https://x.com/sdrzn/status/2/video/1',
}).join('\n');
assert(quoteVideoMd.includes('Video: https://x.com/sdrzn/status/2/video/1'), 'quote video lines');
assert(quoteVideoMd.includes('Thumbnail:'), 'quote thumbnail lines');

const mechanical = buildMediaPrimaryMechanicalSummary(
  videoOnlyBody,
  'Someone demo clip',
  'https://x.com/someone/status/1'
);
assert(mechanical.summary.includes('embedded video'), 'mechanical summary for video');
assert(mechanical.tags.includes('media-not-transcribed'), 'mechanical tags');

console.log('xMedia.test.ts: all tests passed');
