import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Minimal DOMMatrix polyfill for Node environments. pdfjs uses DOMMatrix
// heavily; providing a small compatible implementation prevents runtime
// ReferenceError during server-side builds.
if (typeof globalThis.DOMMatrix === 'undefined') {
  // @ts-ignore
  globalThis.DOMMatrix = class DOMMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;

    constructor(init?: any) {
      if (Array.isArray(init)) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = [init[0] ?? 1, init[1] ?? 0, init[2] ?? 0, init[3] ?? 1, init[4] ?? 0, init[5] ?? 0];
      } else if (init && typeof init === 'object') {
        this.a = init.a ?? 1;
        this.b = init.b ?? 0;
        this.c = init.c ?? 0;
        this.d = init.d ?? 1;
        this.e = init.e ?? 0;
        this.f = init.f ?? 0;
      } else {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      }
    }

    multiplySelf(other: any) {
      const a = this.a * other.a + this.c * other.b;
      const b = this.b * other.a + this.d * other.b;
      const c = this.a * other.c + this.c * other.d;
      const d = this.b * other.c + this.d * other.d;
      const e = this.a * other.e + this.c * other.f + this.e;
      const f = this.b * other.e + this.d * other.f + this.f;
      this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
      return this;
    }

    preMultiplySelf(other: any) {
      const a = other.a * this.a + other.c * this.b;
      const b = other.b * this.a + other.d * this.b;
      const c = other.a * this.c + other.c * this.d;
      const d = other.b * this.c + other.d * this.d;
      const e = other.a * this.e + other.c * this.f + other.e;
      const f = other.b * this.e + other.d * this.f + other.f;
      this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
      return this;
    }

    invertSelf() {
      const det = this.a * this.d - this.b * this.c;
      if (!det || det === 0) {
        // return identity to avoid throwing during build-time operations
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        return this;
      }
      const a = this.d / det;
      const b = -this.b / det;
      const c = -this.c / det;
      const d = this.a / det;
      const e = (this.c * this.f - this.d * this.e) / det;
      const f = (this.b * this.e - this.a * this.f) / det;
      this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
      return this;
    }

    translate(tx: number, ty: number) {
      return this.multiplySelf(new (globalThis as any).DOMMatrix([1, 0, 0, 1, tx, ty]));
    }

    scale(sx: number, sy?: number) {
      if (sy === undefined) sy = sx;
      return this.multiplySelf(new (globalThis as any).DOMMatrix([sx, 0, 0, sy, 0, 0]));
    }

    // convenience aliases used in some code paths
    multiply(other: any) { return this.multiplySelf(other); }
    toString() { return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`; }
  };
}

async function extractTextFromPDF(base64Content: string): Promise<string> {
  try {
    // load pdfjs dynamically after DOM polyfills are in place
    const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf');

    // Set worker source (CDN) when available
    try {
      // some builds expose version
      // @ts-ignore
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '2.16.105'}/pdf.worker.min.js`;
    } catch (e) {
      // ignore worker configuration errors on server
    }

    const binaryString = Buffer.from(base64Content, 'base64');
    const bytes = new Uint8Array(binaryString);

    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    return fullText.trim();
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { fileContent, fileName, targetLanguage, mimeType } = await request.json();
    
    if (!fileContent || !fileName || !targetLanguage) {
      return NextResponse.json(
        { error: 'File content, name, and target language are required' },
        { status: 400 }
      );
    }

    let extractedText = '';
    
    // Extract text from PDF
    if (mimeType === 'application/pdf') {
      try {
        extractedText = await extractTextFromPDF(fileContent);
        
        if (!extractedText || extractedText.trim().length < 50) {
          return NextResponse.json(
            { error: 'Unable to extract readable text from PDF for translation. This may be a scanned document.' },
            { status: 400 }
          );
        }
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        return NextResponse.json(
          { error: 'Failed to parse PDF file.' },
          { status: 400 }
        );
      }
    } else {
      const buffer = Buffer.from(fileContent, 'base64');
      extractedText = buffer.toString('utf-8');
    }

    // Call Gemini API via SDK
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const prompt = `Translate the following legal document to ${targetLanguage}. Maintain all legal terminology accuracy and document structure. Also identify the original language.\n\nDocument content:\n${extractedText.substring(0, 30000)}\n\nProvide your response in this exact format:\nOriginal Language: [detected language]\n---\n[translated content here with proper formatting and line breaks]`;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const modelName = process.env.GEMINI_MODEL ?? 'models/gemini-2.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    const methodCandidates = ['generateContent', 'generateText', 'generate'];
    let result: any = null;
    let lastErr: any = null;
    for (const mname of methodCandidates) {
      // @ts-ignore
      if (typeof model[mname] === 'function') {
        try {
          // @ts-ignore
          result = await model[mname](prompt);
          break;
        } catch (e) {
          lastErr = e;
        }
      }
    }

    if (!result) {
      console.error('AI translation failed:', lastErr);
      return NextResponse.json({ error: 'Failed to translate document with AI. Check model/key.' }, { status: 500 });
    }

    let aiResponse = '';
    if (result?.response && typeof result.response.text === 'function') {
      // @ts-ignore
      aiResponse = await result.response.text();
    } else if (Array.isArray(result?.output)) {
      aiResponse = String(result.output?.[0]?.content?.[0]?.text ?? '');
    } else if (result?.candidates?.[0]?.content?.[0]?.text) {
      aiResponse = result.candidates[0].content[0].text;
    } else {
      aiResponse = String(result ?? '');
    }

    // Extract original language and translated content
    const parts = aiResponse.split('---');
    const originalLanguage = parts[0]?.match(/Original Language: (.+)/)?.[1]?.trim() || 'Unknown';
    const translatedContent = parts[1]?.trim() || aiResponse;

    return NextResponse.json({ translatedContent, originalLanguage }, { status: 200 });

  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Failed to translate document. Please try again.' },
      { status: 500 }
    );
  }
}