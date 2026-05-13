import { useRef, useState } from "react";

type Props = {
  uploadUrl: string; // e.g. "/api/audio/upload"
  onTasksSaved?: (count: number) => void;
};

export function MicRecorder({ uploadUrl, onTasksSaved }: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: true,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: "audio/webm",
        });

        await uploadAudio(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic access failed:", err);
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state !== "recording") return;

    recorder.stop();
    setIsRecording(false);

    // stop mic stream to release device
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function uploadAudio(blob: Blob) {
    try {
      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", blob, "recording.webm");

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status}`);
      }

      const data = await res.json();
      if (!data.success) {
        console.error("STT failed:", data.error);
      } else {
        onTasksSaved?.(data.savedTasks ?? 0);
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {!isRecording ? (
        <button
          onClick={startRecording}
          className="px-4 py-2 rounded bg-black text-white"
        >
          Start Recording
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="px-4 py-2 rounded bg-red-600 text-white"
        >
          Stop Recording
        </button>
      )}

      {isUploading && (
        <span className="text-sm text-gray-500">Processing...</span>
      )}
    </div>
  );
}