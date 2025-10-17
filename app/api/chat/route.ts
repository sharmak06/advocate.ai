// app/api/chat/route.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // Get the message and API key from the client's request
    const { message, legalContext, apiKey } = await req.json();

    // Prefer a server-side API key from environment for security. If not set,
    // fall back to any apiKey provided by the client (not recommended).
    const serverApiKey = process.env.GEMINI_API_KEY ?? apiKey;

    if (!serverApiKey) {
      return NextResponse.json({ error: "API key is required. Set GEMINI_API_KEY in the server environment." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    // Initialize the AI client on the server
  const genAI = new GoogleGenerativeAI(serverApiKey);
    // Determine which model to use. Prefer env var. If not set, try to discover
    // a suitable model from the SDK (if supported) or fall back to tried names.
    const candidateFallbacks = [
      process.env.GEMINI_MODEL,
      "models/text-bison-001",
      "text-bison-001",
      "models/text-bison",
      "models/chat-bison-001",
      "chat-bison-001",
  "models/gemini-1.5",
  "gemini-1.5",
  "models/gemini-1.5-mini",
  "models/gemini-2.5-flash",
  "gemini-2.5-flash",
    ].filter(Boolean) as string[];

  let selectedModelName: string | null = null;
  let lastModelError: any = null;
  let result: any = undefined;

    // First, if GEMINI_MODEL is set, try it directly
    if (process.env.GEMINI_MODEL) {
      candidateFallbacks.unshift(process.env.GEMINI_MODEL);
    }

    // Helper to attempt generation with a model name. Try multiple method names
    // because SDK versions differ (generateContent, generateText, generate).
    const tryModel = async (name: string) => {
      try {
        const m = genAI.getGenerativeModel({ model: name });
        const prompt = `${legalContext ?? ""}\n\nUser question: ${message}`;
        const methodCandidates = ["generateContent", "generateText", "generate"];
        for (const method of methodCandidates) {
          // @ts-ignore
          if (typeof m[method] === "function") {
            try {
              // @ts-ignore
              const res = await m[method](prompt);
              return { name, res, method };
            } catch (err) {
              // store lastModelError and try next
              lastModelError = err;
            }
          }
        }

        // as a fallback, try calling m.call or m.invoke if present
        // @ts-ignore
        if (typeof m.call === "function") {
          try {
            // @ts-ignore
            const res = await m.call({ prompt });
            return { name, res, method: "call" };
          } catch (err) {
            lastModelError = err;
          }
        }

        return { name, err: lastModelError ?? new Error("No supported generation method on model") };
      } catch (err) {
        return { name, err };
      }
    };

    // If SDK exposes a listModels method, use it to find supported models
    if (typeof (genAI as any).listModels === "function") {
      try {
        const lm = await (genAI as any).listModels();
        // lm.models may be an array of model descriptions
        const models = lm?.models ?? [];
        for (const m of models) {
          const mn = m?.name || m?.id;
          const supports = m?.supportedMethods ?? m?.capabilities ?? [];
          // try to pick a model that supports text generation or generateContent
          if (mn && (String(supports).includes("generate") || String(mn).includes("bison") || String(mn).includes("gemini"))) {
            const attempt = await tryModel(mn);
            if ((attempt as any).res) {
              selectedModelName = mn;
              lastModelError = null;
              // use this result below
              // @ts-ignore
              result = (attempt as any).res;
              break;
            } else {
              lastModelError = (attempt as any).err;
            }
          }
        }
      } catch (e) {
        console.error("listModels failure:", e);
        // fall back to try candidate names
      }
    }

    // If not found yet, try candidate names sequentially
    if (!selectedModelName) {
      for (const name of candidateFallbacks) {
        try {
          const attempt = await tryModel(name);
          if ((attempt as any).res) {
            selectedModelName = name;
            // @ts-ignore
            result = (attempt as any).res;
            break;
          } else {
            lastModelError = (attempt as any).err;
          }
        } catch (e) {
          lastModelError = e;
        }
      }
    }

    if (!selectedModelName) {
      console.error("No usable model found. Last error:", lastModelError);
      const readable = lastModelError?.message ?? String(lastModelError);
      return NextResponse.json({ error: `No supported model found. Last error: ${readable}` }, { status: 500 });
    }

    // Normalize extraction of text from various SDK response shapes
    let text = "";
    try {
      if (result?.response) {
        // result.response.text may be a function that returns the text
        if (typeof result.response.text === "function") {
          // some SDK versions return a promise or string
          // await to handle either case
          // @ts-ignore
          text = await result.response.text();
        } else {
          text = String(result.response);
        }
      } else if (Array.isArray((result as any)?.output)) {
        // older/newer shapes may have output array
        text = String((result as any).output?.[0]?.content?.[0]?.text ?? "");
      } else {
        text = String(result ?? "");
      }
    } catch (e) {
      console.error("Failed to extract text from AI response:", e, result);
      return NextResponse.json(
        { error: "Failed to parse AI response." },
        { status: 500 }
      );
    }

    if (!text) {
      console.error("Empty AI response:", result);
      return NextResponse.json({ error: "AI returned an empty response." }, { status: 500 });
    }

    // Send the AI's response back to the client
    return NextResponse.json({ text });
  } catch (error: any) {
    console.error("Error in /api/chat:", error);
    // Return a helpful error message for debugging (avoid leaking secrets)
    return NextResponse.json({ error: error?.message ?? String(error) }, { status: 500 });
  }
}