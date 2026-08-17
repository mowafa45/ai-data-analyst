/**
 * Next.js API route: /api/chat
 * Streams Claude responses directly from the frontend server,
 * so the app works without the Python backend for pure chat.
 */
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  const { message, history = [], dataContext } = await req.json();

  const systemPrompt = dataContext
    ? `You are an expert AI Data Analyst embedded in a business intelligence SaaS platform.
       
Dataset context:
${dataContext}

Your job is to answer questions about this dataset clearly and specifically.
- Always use exact numbers and percentages
- Mention which columns you're analysing
- Give actionable business insights, not just statistics
- Respond in 3-5 sentences per point, professional but conversational
- If a chart would help, describe what the chart would show clearly
- End with: [Confidence: XX%] where XX reflects your certainty`
    : "You are a helpful AI data analyst assistant.";

  const messages = [
    ...history.slice(-20).map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        });

        for await (const chunk of anthropicStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            const data = JSON.stringify({ text: chunk.delta.text });
            controller.enqueue(encoder.encode(`event: delta\ndata: ${data}\n\n`));
          }
        }

        const final = JSON.stringify({ confidence: 0.88, artifacts: [], follow_up_suggestions: [] });
        controller.enqueue(encoder.encode(`event: done\ndata: ${final}\n\n`));
        controller.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
