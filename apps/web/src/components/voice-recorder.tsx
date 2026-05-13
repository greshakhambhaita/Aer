import { useRef, useState } from "react";

type Props = {
  uploadUrl: string; // e.g. "/api/audio/upload"
  onTasksSaved?: (count: number) => void;
};

export function MicRecorder({ uploadUrl, onTasksSaved }: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

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

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const SILENCE_MS = 1200;
      const THRESHOLD = 0.02;

      const checkSilence = () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state !== "recording") return;

        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);

        if (rms < THRESHOLD) {
          if (silenceTimerRef.current == null) {
            silenceTimerRef.current = window.setTimeout(() => {
              stopRecording();
              silenceTimerRef.current = null;
            }, SILENCE_MS);
          }
        } else if (silenceTimerRef.current != null) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        requestAnimationFrame(checkSilence);
      };

      requestAnimationFrame(checkSilence);

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
        audioBitsPerSecond: 16000,
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
      recorder.start(250);
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

    if (silenceTimerRef.current != null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;

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
