import { scanProgress } from "@/lib/scan-progress";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const data = JSON.stringify({
          total: scanProgress.total,
          current: scanProgress.current,
          currentCode: scanProgress.currentCode,
          currentName: scanProgress.currentName,
          isScanning: scanProgress.isScanning,
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));

        if (!scanProgress.isScanning && scanProgress.current > 0) {
          controller.close();
          return;
        }
        setTimeout(send, 400);
      };
      send();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
