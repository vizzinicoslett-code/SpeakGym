import { useEffect, useRef, useState } from "react";
import type { AudioTake } from "../types";

export interface AudioPlayerProps {
  take: AudioTake;
  onDelete?: () => void;
  compact?: boolean;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function AudioPlayer({
  take,
  onDelete,
  compact = false,
}: AudioPlayerProps) {
  const [source, setSource] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(take.blob);
    const audio = audioRef.current;
    setSource(url);
    return () => {
      audio?.pause();
      URL.revokeObjectURL(url);
    };
  }, [take.blob]);

  return (
    <div className={`audio-take${compact ? " audio-take--compact" : ""}`}>
      <div className="audio-take-heading">
        <span>{take.label || "训练录音"}</span>
        <span className="audio-take-duration">
          {formatDuration(take.duration)}
        </span>
        {onDelete && (
          <button
            type="button"
            className="audio-take-delete"
            onClick={onDelete}
            aria-label={`删除${take.label || "训练录音"}`}
          >
            删除
          </button>
        )}
      </div>
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={source || undefined}
        aria-label={`${take.label || "训练录音"}播放`}
      />
    </div>
  );
}

export default AudioPlayer;
