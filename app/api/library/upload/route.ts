import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const fileField = formData.get('file') as File | null;

    if (!fileField) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await fileField.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const publicDir = path.resolve(process.cwd(), 'public');
    const casesDir = path.join(publicDir, 'cases');
    if (!fs.existsSync(casesDir)) {
      fs.mkdirSync(casesDir, { recursive: true });
    }

  const originalName = fileField.name || 'upload';
  let ext = path.extname(originalName);
  if (!ext) ext = '.pdf';
  ext = ext.toLowerCase();
  const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const filename = `${Date.now()}-${baseName}${ext}`;
    const filePath = path.join(casesDir, filename);

    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ success: true, filename, url: `/cases/${filename}` });
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
