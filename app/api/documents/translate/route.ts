import { NextRequest, NextResponse } from 'next/server';
import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

async function extractTextFromPDF(base64Content: string): Promise<string> {
  try {
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