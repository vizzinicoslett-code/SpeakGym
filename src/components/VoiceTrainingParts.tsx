import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import type { AudioTake } from "../types";
import type { SpeedPattern, VoiceScene } from "../data/voiceGuidance";
import {
  differenceRatings,
  noDifferenceTip,
  voiceSteps,
} from "../data/voiceGuidance";
import "./voice.css";

export interface VoiceDirectionProps {
  takeIndex: number;
  speedPattern: SpeedPattern;
  scene: VoiceScene;
}

export function VoiceDirection({
  takeIndex,
  speedPattern,
  scene,
}: VoiceDirectionProps) {
  const step = voiceSteps[takeIndex] ?? voiceSteps[0];
  return (
    <div
      className={`voice-direction voice-guidance voice-guidance--take-${takeIndex + 1}`}
    >
      {takeIndex === 4 ? (
        <>
          <span>带着这个情境，再说同一句话</span>
          <strong>{scene.text}</strong>
          <p>{step.hint}</p>
        </>
      ) : (
        <>
          <Volume2 size={21} aria-hidden="true" />
          {takeIndex === 3 && (
            <strong className="voice-speed-pattern">
              {speedPattern.label}
            </strong>
          )}
          <p>{step.hint}</p>
          {takeIndex === 3 && (
            <p className="voice-guidance-detail">{speedPattern.instruction}</p>
          )}
        </>
      )}
    </div>
  );
}

interface ComparisonTakeProps {
  take?: AudioTake;
  number: 1 | 5;
  kind: string;
}

function ComparisonTake({ take, number, kind }: ComparisonTakeProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const generation = useRef(0);
  const [source, setSource] = useState("");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const blob = take?.blob;
  const available = Boolean(blob && blob.size > 0);

  useEffect(() => {
    const audio = audioRef.current;
    setPlaying(false);
    setError("");
    setSource("");
    if (!blob || blob.size === 0) return;
    const url = URL.createObjectURL(blob);
    setSource(url);
    return () => {
      generation.current += 1;
      audio?.pause();
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !source) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    const currentGeneration = generation.current;
    setError("");
    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (cause) {
      // Switching to the other version can interrupt a still-pending play().
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (generation.current === currentGeneration)
        setError("这段录音暂时无法播放，可以先完成自评。");
    }
  };

  return (
    <div
      className={`voice-ab-take${available ? "" : " voice-ab-take--unavailable"}`}
    >
      <span className="voice-ab-number">TAKE {number}</span>
      <h3>{kind}</h3>
      <button
        type="button"
        className="button secondary voice-ab-play"
        disabled={!source}
        aria-label={`${playing ? "暂停" : "播放"} Take ${number} ${kind}`}
        onClick={() => {
          void togglePlayback();
        }}
      >
        {playing ? (
          <Pause size={17} aria-hidden="true" />
        ) : (
          <Play size={17} aria-hidden="true" />
        )}
        {playing ? "暂停" : "播放"} Take {number}
      </button>
      {available ? (
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          src={source || undefined}
          aria-label={`Take ${number} ${kind}录音`}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setPlaying(false);
            setError("这段录音暂时无法播放，可以先完成自评。");
          }}
        />
      ) : (
        <p className="voice-ab-unavailable">
          未保留 Take {number} 的录音，暂时无法回听。
        </p>
      )}
      {error && (
        <p className="voice-ab-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

export interface VoiceABReviewProps {
  takes: AudioTake[];
  rating: string | undefined;
  onRatingChange: (value: string) => void;
}

export function VoiceABReview({
  takes,
  rating,
  onRatingChange,
}: VoiceABReviewProps) {
  // The full five-take list below shares this review. Keep all playback exclusive,
  // including when the user starts a native audio control instead of an A/B button.
  useEffect(() => {
    const pauseOtherAudio = (event: Event) => {
      if (!(event.target instanceof HTMLAudioElement)) return;
      const active = event.target;
      document.querySelectorAll("audio").forEach((audio) => {
        if (audio !== active) audio.pause();
      });
    };
    document.addEventListener("play", pauseOtherAudio, true);
    return () => document.removeEventListener("play", pauseOtherAudio, true);
  }, []);

  const natural = takes.find((take) => /^Take 1(?:\D|$)/.test(take.label));
  const scene = takes.find((take) => /^Take 5(?:\D|$)/.test(take.label));
  return (
    <section
      className="review-section voice-ab"
      aria-label="Take 1 和 Take 5 对比回听"
    >
      <h2>对比 Take 1 和 Take 5</h2>
      <p className="voice-ab-intro">
        先听平时的声音，再听带着情境的版本。两遍的差别，听得出来吗？
      </p>
      <div className="voice-ab-grid">
        <ComparisonTake number={1} kind="自然版本" take={natural} />
        <ComparisonTake number={5} kind="场景版本" take={scene} />
      </div>
      <div
        className="voice-difference"
        role="group"
        aria-label="Take 1 和 Take 5 的差异自评"
      >
        <p>
          你能明显听出区别吗？<span>选填</span>
        </p>
        <div className="voice-difference-options">
          {differenceRatings.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={rating === value}
              className={rating === value ? "selected" : ""}
              onClick={() => onRatingChange(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {rating === "几乎没区别" && (
        <p className="voice-difference-tip" role="status">
          {noDifferenceTip}
        </p>
      )}
    </section>
  );
}
