import { DemoCallRoom } from "@/components/preview/DemoCallRoom";

export default async function PreviewCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DemoCallRoom sessionId={id} />;
}
