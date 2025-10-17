import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractPDFText, extractPDFTextAdvanced } from '@/lib/pdfExtractor';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { fileContent, fileName } = body;
        
        // Get API key from environment variable or request body as fallback
        const apiKey = process.env.GEMINI_API_KEY || body.apiKey;

        if (!fileContent) {
            return NextResponse.json(
                { error: 'File content is required' },
                { status: 400 }
            );
        }

        if (!apiKey) {
            return NextResponse.json(
                { error: 'API key is not configured. Please set GEMINI_API_KEY in your environment variables.' },
                { status: 400 }
            );
        }

        console.log('Received file:', fileName);
        console.log('File content length:', fileContent.length);

        // Extract text from PDF
        let documentText = '';
        try {
            console.log('Processing PDF file:', fileName);

            // Convert base64 to ArrayBuffer
            const binaryString = atob(fileContent);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const arrayBuffer = bytes.buffer;

            if (arrayBuffer.byteLength === 0) {
                throw new Error('Empty PDF file received');
            }

            console.log('PDF size:', arrayBuffer.byteLength, 'bytes');

            // Check PDF header
            const header = new Uint8Array(arrayBuffer.slice(0, 5));
            const pdfHeader = String.fromCharCode(...header);
            if (!pdfHeader.startsWith('%PDF')) {
                throw new Error('File is not a valid PDF document');
            }

            // Try simple extraction first
            console.log('Attempting simple PDF extraction...');
            documentText = await extractPDFText(arrayBuffer);

            // If simple extraction didn't work well, try advanced method
            if (!documentText || documentText.length < 50 || documentText.includes('No readable text found')) {
                console.log('Simple extraction failed, trying advanced method...');
                try {
                    documentText = await extractPDFTextAdvanced(arrayBuffer);
                } catch (advancedError) {
                    console.warn('Advanced extraction also failed:', advancedError);
                }
            }

            console.log('Final extracted text length:', documentText.length);
            console.log('Text preview:', documentText.substring(0, 300) + '...');

            if (!documentText || documentText.trim().length < 10) {
                throw new Error('No readable text found in the PDF. This might be a scanned document or image-based PDF that requires OCR.');
            }

        } catch (extractError: any) {
            console.error('PDF extraction error:', extractError);
            return NextResponse.json(
                { error: `Failed to process PDF: ${extractError.message}` },
                { status: 400 }
            );
        }

        // Analyze with AI
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ 
                model: "gemini-2.0-flash-exp",
                generationConfig: {
                    temperature: 0.2,
                    topP: 0.8,
                    topK: 40,
                }
            });

            const analysisPrompt = `You are an expert legal document analyzer with expertise in Indian law, court proceedings, and legal documentation. Analyze the following document thoroughly and provide a detailed, accurate analysis.

DOCUMENT CONTENT:
${documentText}

CRITICAL INSTRUCTIONS:
1. READ THE ENTIRE DOCUMENT CAREFULLY before analyzing
2. Extract ALL specific details: names, dates, case numbers, sections, amounts
3. Identify the exact type of legal document
4. Provide a comprehensive summary that captures the essence of the case/document
5. Be specific and detailed - avoid generic statements
6. For court orders: identify the ruling, conditions, and implications
7. For contracts: identify parties, obligations, terms, and conditions
8. For notices: identify the nature, demands, and timelines

Provide your analysis in the following JSON format:

{
    "documentType": "Specific type (e.g., 'Anticipatory Bail Order', 'Criminal Complaint', 'Civil Contract', 'Legal Notice', 'Plea Bargaining Order', 'Divorce Petition', etc.)",
    "summary": "A detailed 4-6 sentence summary covering: (1) What is this document? (2) Who are the parties involved? (3) What is the main issue/dispute? (4) What action was taken or requested? (5) What was the outcome/decision?",
    "keyPoints": [
        "List 8-12 specific points from the document",
        "Include: Case/Document numbers, Full names of parties involved, Specific dates and timelines",
        "Include: Sections of law cited (with full section numbers), Monetary amounts mentioned (with exact figures)",
        "Include: Court names and judge names, Key allegations or claims made",
        "Include: Orders passed or relief sought, Conditions imposed (if any)",
        "Include: Important deadlines or time periods, Specific obligations of each party",
        "Be very specific - use exact quotes for amounts, dates, and legal provisions"
    ],
    "legalConcerns": [
        "List 4-8 specific legal issues, risks, or concerns",
        "For court cases: mention severity of charges, potential penalties, bail conditions",
        "For contracts: identify unfavorable clauses, missing protections, ambiguous terms",
        "Highlight any procedural issues or compliance gaps",
        "Mention jurisdiction and applicable law concerns",
        "Point out any time-sensitive matters requiring immediate attention"
    ],
    "recommendations": [
        "Provide 5-10 specific, actionable recommendations",
        "For accused persons: immediate steps to take, documentation needed, legal rights",
        "For contract parties: negotiation points, protective measures, due diligence steps",
        "Include: which legal experts to consult (criminal lawyer, civil lawyer, etc.)",
        "Suggest: what evidence or documents to gather",
        "Advise: on compliance requirements and deadlines to meet",
        "Recommend: risk mitigation strategies specific to this case"
    ],
    "partiesInvolved": {
        "petitioners": ["List all petitioner names with their relation/role"],
        "respondents": ["List all respondent names"],
        "otherParties": ["Any other relevant parties mentioned"]
    },
    "timelineCritical": [
        "List all important dates mentioned in chronological order",
        "Include: incident dates, filing dates, hearing dates, deadlines",
        "Format: 'Date - Event/Action'"
    ],
    "legalProvisions": [
        "List all legal sections, acts, and provisions cited",
        "Format: 'Section X of Act Name' with brief explanation of what it covers"
    ]
}

EXAMPLES OF GOOD ANALYSIS:
- "This is an anticipatory bail order passed by Patna High Court in a dowry death case where 6 petitioners sought protection from arrest"
- "The contract binds Party A to deliver 1000 units by March 15, 2025, with a penalty of Rs. 50,000 per day for delays"
- "Petitioner must surrender within 6 weeks and furnish bail bonds of Rs. 10,000 each with two sureties"

BAD EXAMPLES (TOO GENERIC):
- "This is a legal document about a case"
- "The parties have certain obligations"
- "There may be legal risks involved"

Your analysis must be detailed, specific, and directly derived from the document content. Do not make assumptions or add information not present in the document.`;

            const result = await model.generateContent(analysisPrompt);
            const response = result.response;
            const text = response.text();

            console.log('AI Response received, length:', text.length);

            try {
                const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
                const analysis = JSON.parse(cleanedText);

                return NextResponse.json({
                    success: true,
                    analysis: {
                        documentType: analysis.documentType || 'Legal Document',
                        summary: analysis.summary || 'Document analysis completed.',
                        keyPoints: Array.isArray(analysis.keyPoints) ? analysis.keyPoints : [],
                        legalConcerns: Array.isArray(analysis.legalConcerns) ? analysis.legalConcerns : [],
                        recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
                        partiesInvolved: analysis.partiesInvolved || {},
                        timelineCritical: Array.isArray(analysis.timelineCritical) ? analysis.timelineCritical : [],
                        legalProvisions: Array.isArray(analysis.legalProvisions) ? analysis.legalProvisions : []
                    }
                });

            } catch (parseError) {
                console.error('JSON parsing error:', parseError);
                console.error('Raw AI response:', text);

                // Try to extract meaningful content even if JSON parsing fails
                return NextResponse.json({
                    success: true,
                    analysis: {
                        documentType: 'Legal Document',
                        summary: text.substring(0, 500) + '...',
                        keyPoints: [
                            'Document uploaded and processed successfully',
                            'Full AI analysis available in raw response',
                            'Manual review recommended for detailed insights'
                        ],
                        legalConcerns: [
                            'Automated JSON parsing encountered an issue',
                            'Professional legal review recommended'
                        ],
                        recommendations: [
                            'Have document reviewed by qualified legal counsel',
                            'Verify all terms and conditions manually',
                            'Ensure compliance with applicable laws'
                        ],
                        partiesInvolved: {},
                        timelineCritical: [],
                        legalProvisions: []
                    },
                    rawResponse: text,
                    parseError: true
                });
            }

        } catch (aiError: any) {
            console.error('AI analysis error:', aiError);
            return NextResponse.json(
                { error: `Failed to analyze document with AI: ${aiError.message}` },
                { status: 500 }
            );
        }

    } catch (error: any) {
        console.error('Document analysis error:', error);
        return NextResponse.json(
            { error: `Failed to analyze document: ${error.message}` },
            { status: 500 }
        );
    }
}