import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { extractPDFText } from '@/lib/pdfExtractor';

export async function GET(req: Request) {
  try {
    const publicDir = path.resolve(process.cwd(), 'public');
    const casesDir = path.join(publicDir, 'cases');

    if (!fs.existsSync(casesDir)) {
      return NextResponse.json({ documents: [] });
    }

    // match .pdf case-insensitive
    const files = fs
      .readdirSync(casesDir)
      .filter((f) => f.toLowerCase().endsWith('.pdf'));

    const docs = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(casesDir, file);
        try {
          const data = fs.readFileSync(filePath);
          const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          // Use simple extractor first
          let text = await extractPDFText(arrayBuffer as unknown as ArrayBuffer);
          if (!text || text === 'No readable text found in PDF') {
            // fallback to advanced extractor if available
            try {
              const { extractPDFTextAdvanced } = await import('@/lib/pdfExtractor');
              text = await extractPDFTextAdvanced(arrayBuffer as unknown as ArrayBuffer);
            } catch (e) {
              // ignore
            }
          }

          const snippet = (text || '').slice(0, 400);

          return {
            id: file,
            title: path.basename(file, '.pdf'),
            category: 'Imported',
            description: snippet,
            pdf_url: `/cases/${file}`,
            created_at: fs.statSync(filePath).mtime.toISOString(),
            date: null,
            court: null,
            tags: [],
            author: { name: 'Imported', role: 'Importer', email: '' },
          };
        } catch (err) {
          return null;
        }
      })
    );

    return NextResponse.json({ documents: docs.filter(Boolean) });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 });
  }
}
