import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
    try {
        const { type, title, description, apiKey } = await req.json();

        if (!type || !title || !description) {
            return NextResponse.json(
                { error: 'All fields are required' },
                { status: 400 }
            );
        }

        const serverApiKey = process.env.GEMINI_API_KEY ?? apiKey;
        if (!serverApiKey) {
            return NextResponse.json({ error: 'API key required on server. Set GEMINI_API_KEY.' }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(serverApiKey);
        const modelName = process.env.GEMINI_MODEL ?? 'models/gemini-2.5-flash';
        const model = genAI.getGenerativeModel({ model: modelName });

        // Document type specific prompts
        const documentTemplates = {
            contract: 'a comprehensive contract agreement',
            nda: 'a non-disclosure agreement (NDA)',
            employment: 'an employment agreement contract',
            rental: 'a rental/lease agreement',
            service: 'a service agreement contract',
            partnership: 'a partnership agreement',
            terms: 'terms of service document',
            privacy: 'a privacy policy document',
            invoice: 'a legal invoice template',
            notice: 'a legal notice document'
        };

        const documentTemplate = documentTemplates[type as keyof typeof documentTemplates] || 'a legal document';

        const generationPrompt = `You are a professional legal document writer. Generate ${documentTemplate} with the following details:\n\nTitle: ${title}\nRequirements: ${description}\n\nPlease create a comprehensive, professional legal document...`;

        const methodCandidates = ["generateContent", "generateText", "generate"];
        let result: any = null;
        let lastErr: any = null;
        for (const mname of methodCandidates) {
            // @ts-ignore
            if (typeof model[mname] === 'function') {
                try {
                    // @ts-ignore
                    result = await model[mname](generationPrompt);
                    break;
                } catch (e) {
                    lastErr = e;
                }
            }
        }

        if (!result) {
            console.error('Document generation failed:', lastErr);
            return NextResponse.json({ error: 'Failed to generate document (model/method issue)' }, { status: 500 });
        }

        let content = '';
        try {
            if (result?.response && typeof result.response.text === 'function') {
                // @ts-ignore
                content = await result.response.text();
            } else if (result?.output?.[0]?.content?.[0]?.text) {
                content = result.output[0].content[0].text;
            } else {
                content = String(result ?? '');
            }
        } catch (e) {
            console.error('Failed to extract generated content:', e, result);
            return NextResponse.json({ error: 'Failed to extract generated content' }, { status: 500 });
        }

        // Clean up the content
        const cleanContent = content
            .replace(/```/g, '')
            .replace(/^\s*markdown\s*/i, '')
            .trim();

        return NextResponse.json({ content: cleanContent });

    } catch (error) {
        console.error('Document generation error:', error);
        return NextResponse.json(
            { error: 'Failed to generate document' },
            { status: 500 }
        );
    }
}