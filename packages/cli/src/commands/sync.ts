import * as fs from 'fs';
import * as path from 'path';
import { PlaudConfig, PlaudAuth, PlaudClient, TranscriptSegment } from '@plaud/core';

function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function segmentsToMarkdown(segments: TranscriptSegment[]): string {
  if (segments.length === 0) {
    return '*(No transcript available)*';
  }
  // Combine segments into a readable transcript
  // Option 1: Plain concatenation with speaker labels
  const lines = segments.map(seg => `**[${formatTimestamp(seg.start_time)}] ${seg.speaker}:** ${seg.content}`);
  return lines.join('\n\n');
}

export async function syncCommand(args: string[]): Promise<void> {
  const folder = args[0];
  if (!folder) {
    console.error('Usage: plaud sync <folder>');
    process.exit(1);
  }

  const config = new PlaudConfig();
  const creds = config.getCredentials();
  const auth = new PlaudAuth(config);
  const client = new PlaudClient(auth, creds?.region ?? 'eu');

  fs.mkdirSync(folder, { recursive: true });

  const recordings = await client.listRecordings();
  console.log(`Found ${recordings.length} recording(s). Checking for new ones...`);

  let synced = 0;
  for (const rec of recordings) {
    const date = new Date(rec.start_time).toISOString().slice(0, 10);
    const slug = rec.filename?.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 50) || rec.id;
    const mdFile = path.join(folder, `${date}_${slug}.md`);

    if (fs.existsSync(mdFile)) continue;

    console.log(`Syncing: ${rec.filename} (${rec.id})...`);
    // Get transcript segments via getTranscript (same as transcript command)
    let segments: TranscriptSegment[] = [];
    try {
      segments = await client.getTranscript(rec.id);
    } catch (err) {
      console.warn(`  Could not fetch transcript for ${rec.id}: ${err}`);
    }
    
    const transcriptText = segmentsToMarkdown(segments);
    const content = [
      '---',
      `plaud_id: ${rec.id}`,
      `title: "${rec.filename}"`,
      `date: ${date}`,
      `duration: ${Math.round(rec.duration / 60000)}m`,
      `source: plaud`,
      '---',
      '',
      `# ${rec.filename}`,
      '',
      transcriptText,
    ].join('\n');

    fs.writeFileSync(mdFile, content);
    synced++;
  }

  console.log(synced > 0 ? `Synced ${synced} new recording(s).` : 'Already up to date.');
}
