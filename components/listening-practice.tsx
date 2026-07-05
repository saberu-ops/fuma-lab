'use client';

import examData from '@/lib/data/jlpt-n2-2024-07.json';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

type Cue = {
  id: number;
  text: string;
  start: number;
  end: number;
  repaired?: boolean;
};

type Clip = {
  id: string;
  number: number;
  title: string;
  audio: string;
  duration: number;
  durationLabel: string;
  cues: Cue[];
};

type ExamSection = {
  id: number;
  title: string;
  translatedTitle: string;
  clips: Clip[];
};

type Exam = {
  title: string;
  description: string;
  sections: ExamSection[];
};

const exam = examData as Exam;
const rates = [0.75, 1, 1.25, 1.5];

function formatTime(value: number) {
  if (!Number.isFinite(value)) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function ControlIcon({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <span aria-hidden="true" className="text-base leading-none" title={label}>
      {children}
    </span>
  );
}

export function ListeningPractice() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [sectionId, setSectionId] = useState(exam.sections[0].id);
  const [clipId, setClipId] = useState(exam.sections[0].clips[0].id);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(
    exam.sections[0].clips[0].duration,
  );
  const [rate, setRate] = useState(1);
  const [showTranscript, setShowTranscript] = useState(true);
  const [repeatCue, setRepeatCue] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const section = useMemo(
    () => exam.sections.find((item) => item.id === sectionId)!,
    [sectionId],
  );
  const clip = useMemo(
    () =>
      section.clips.find((item) => item.id === clipId) ?? section.clips[0],
    [clipId, section],
  );
  const activeCueIndex = clip.cues.findIndex(
    (cue) => currentTime >= cue.start && currentTime < cue.end,
  );
  const activeCue = clip.cues[activeCueIndex];
  const allClips = exam.sections.flatMap((item) => item.clips);
  const completedCount = allClips.filter((item) =>
    completed.has(item.id),
  ).length;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.load();
    setCurrentTime(0);
    setDuration(clip.duration);
    setIsPlaying(false);
    setRepeatCue(false);
  }, [clip.id, clip.duration]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    if (!showTranscript || activeCueIndex < 0) return;
    const target = transcriptRef.current?.querySelector(
      `[data-cue-index="${activeCueIndex}"]`,
    );
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeCueIndex, showTranscript]);

  function chooseSection(nextSection: ExamSection) {
    setSectionId(nextSection.id);
    setClipId(nextSection.clips[0].id);
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
    }
  }

  function seek(nextTime: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const bounded = Math.min(Math.max(0, nextTime), duration);
    audio.currentTime = bounded;
    setCurrentTime(bounded);
  }

  function chooseCue(cue: Cue) {
    seek(cue.start);
    void audioRef.current?.play();
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    if (repeatCue && activeCue && audio.currentTime >= activeCue.end - 0.08) {
      audio.currentTime = activeCue.start;
    }
    setCurrentTime(audio.currentTime);
  }

  function handleEnded() {
    setIsPlaying(false);
    setCompleted((current) => new Set(current).add(clip.id));
  }

  function handleRate(nextRate: number) {
    setRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement) return;
    if (event.code === 'Space') {
      event.preventDefault();
      void togglePlayback();
    }
    if (event.key === 'ArrowLeft') seek(currentTime - 5);
    if (event.key === 'ArrowRight') seek(currentTime + 5);
  }

  return (
    <div
      className="not-prose my-8 overflow-hidden rounded-2xl border bg-fd-card text-fd-card-foreground shadow-sm outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <audio
        ref={audioRef}
        preload="metadata"
        src={clip.audio}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={handleTimeUpdate}
      >
        您的浏览器不支持音频播放。
      </audio>

      <div className="border-b bg-gradient-to-br from-fd-primary/10 via-fd-card to-fd-card px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[0.18em] text-fd-primary uppercase">
              N2 Listening Lab
            </p>
            <h2 className="m-0 text-xl font-semibold tracking-tight">
              {exam.title}
            </h2>
            <p className="mt-1.5 mb-0 text-sm text-fd-muted-foreground">
              {exam.description}
            </p>
          </div>
          <div className="rounded-full border bg-fd-background/70 px-3 py-1.5 text-xs text-fd-muted-foreground">
            已练习 <strong className="text-fd-foreground">{completedCount}</strong>{' '}
            / {allClips.length}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.78fr)]">
        <div className="min-w-0 border-b p-4 sm:p-6 lg:border-r lg:border-b-0">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {exam.sections.map((item) => (
              <button
                key={item.id}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  item.id === section.id
                    ? 'border-fd-primary bg-fd-primary text-fd-primary-foreground'
                    : 'bg-fd-background text-fd-muted-foreground hover:border-fd-primary/50 hover:text-fd-foreground'
                }`}
                onClick={() => chooseSection(item)}
                type="button"
              >
                {item.id}. {item.title}
              </button>
            ))}
          </div>

          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {section.clips.map((item) => (
              <button
                key={item.id}
                aria-label={`${section.title}${item.title}`}
                className={`relative flex size-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold transition ${
                  item.id === clip.id
                    ? 'border-fd-primary bg-fd-primary/10 text-fd-primary'
                    : 'bg-fd-background hover:border-fd-primary/50'
                }`}
                onClick={() => setClipId(item.id)}
                type="button"
              >
                {item.number}
                {completed.has(item.id) && (
                  <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border bg-fd-background p-4 sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="m-0 text-xs text-fd-muted-foreground">
                  問題 {section.id} · {section.translatedTitle || section.title}
                </p>
                <h3 className="mt-1 mb-0 text-lg font-semibold">
                  {clip.title}
                </h3>
              </div>
              <span className="rounded-md bg-fd-muted px-2 py-1 font-mono text-xs text-fd-muted-foreground">
                {clip.durationLabel}
              </span>
            </div>

            <div className="mb-5 flex min-h-24 items-center justify-center rounded-xl bg-fd-muted/55 px-5 py-6 text-center">
              {showTranscript ? (
                <p
                  className="m-0 whitespace-pre-line text-lg leading-8 font-medium"
                  lang="ja"
                >
                  {activeCue?.text ?? '播放音频后，字幕会在这里同步显示。'}
                </p>
              ) : (
                <div>
                  <p className="m-0 text-sm font-medium">盲听模式</p>
                  <p className="mt-1 mb-0 text-xs text-fd-muted-foreground">
                    字幕已隐藏，点击“显示字幕”即可恢复。
                  </p>
                </div>
              )}
            </div>

            <div className="mb-2 flex items-center gap-3 font-mono text-xs text-fd-muted-foreground">
              <span className="w-9 text-right">{formatTime(currentTime)}</span>
              <input
                aria-label="播放进度"
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-fd-primary"
                max={duration || clip.duration}
                min="0"
                onChange={(event) => seek(Number(event.target.value))}
                step="0.05"
                type="range"
                value={Math.min(currentTime, duration || clip.duration)}
              />
              <span className="w-9">{formatTime(duration || clip.duration)}</span>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                aria-label="后退 5 秒"
                className="flex size-10 items-center justify-center rounded-full border bg-fd-card transition hover:bg-fd-muted"
                onClick={() => seek(currentTime - 5)}
                type="button"
              >
                <ControlIcon label="后退 5 秒">↶</ControlIcon>
                <span className="sr-only">后退 5 秒</span>
              </button>
              <button
                aria-label={isPlaying ? '暂停' : '播放'}
                className="flex size-12 items-center justify-center rounded-full bg-fd-primary text-xl text-fd-primary-foreground shadow-sm transition hover:opacity-90"
                onClick={() => void togglePlayback()}
                type="button"
              >
                <ControlIcon label={isPlaying ? '暂停' : '播放'}>
                  {isPlaying ? 'Ⅱ' : '▶'}
                </ControlIcon>
                <span className="sr-only">{isPlaying ? '暂停' : '播放'}</span>
              </button>
              <button
                aria-label="前进 5 秒"
                className="flex size-10 items-center justify-center rounded-full border bg-fd-card transition hover:bg-fd-muted"
                onClick={() => seek(currentTime + 5)}
                type="button"
              >
                <ControlIcon label="前进 5 秒">↷</ControlIcon>
                <span className="sr-only">前进 5 秒</span>
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 border-t pt-4">
              <button
                aria-pressed={showTranscript}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  showTranscript
                    ? 'border-fd-primary/40 bg-fd-primary/10 text-fd-primary'
                    : 'bg-fd-card hover:bg-fd-muted'
                }`}
                onClick={() => setShowTranscript((current) => !current)}
                type="button"
              >
                {showTranscript ? '隐藏字幕' : '显示字幕'}
              </button>
              <button
                aria-pressed={repeatCue}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  repeatCue
                    ? 'border-fd-primary/40 bg-fd-primary/10 text-fd-primary'
                    : 'bg-fd-card hover:bg-fd-muted'
                }`}
                disabled={!activeCue}
                onClick={() => setRepeatCue((current) => !current)}
                type="button"
              >
                {repeatCue ? '逐句循环中' : '逐句循环'}
              </button>
              <div className="flex items-center gap-1 rounded-lg border bg-fd-card p-1">
                {rates.map((item) => (
                  <button
                    key={item}
                    aria-label={`${item} 倍速`}
                    className={`rounded-md px-2 py-1 text-xs transition ${
                      rate === item
                        ? 'bg-fd-muted font-semibold text-fd-foreground'
                        : 'text-fd-muted-foreground hover:text-fd-foreground'
                    }`}
                    onClick={() => handleRate(item)}
                    type="button"
                  >
                    {item}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-3 mb-0 text-center text-[11px] text-fd-muted-foreground">
            键盘：空格播放 / 暂停，← → 前后跳转 5 秒
          </p>
        </div>

        <div className="flex min-h-0 flex-col p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="m-0 text-sm font-semibold">逐句字幕</h3>
              <p className="mt-0.5 mb-0 text-xs text-fd-muted-foreground">
                点击任一句即可定位播放
              </p>
            </div>
            <span className="text-xs text-fd-muted-foreground">
              {clip.cues.length} 句
            </span>
          </div>

          {showTranscript ? (
            <div
              ref={transcriptRef}
              className="max-h-[34rem] space-y-1 overflow-y-auto rounded-xl border bg-fd-background p-2 lg:max-h-[42rem]"
            >
              {clip.cues.map((cue, index) => {
                const active = index === activeCueIndex;
                return (
                  <button
                    key={`${clip.id}-${cue.id}`}
                    data-cue-index={index}
                    className={`grid w-full grid-cols-[2.75rem_1fr] gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                      active
                        ? 'bg-fd-primary/10 text-fd-foreground ring-1 ring-fd-primary/30'
                        : 'text-fd-muted-foreground hover:bg-fd-muted/70 hover:text-fd-foreground'
                    }`}
                    onClick={() => chooseCue(cue)}
                    type="button"
                  >
                    <span className="pt-0.5 font-mono text-[11px] opacity-70">
                      {formatTime(cue.start)}
                    </span>
                    <span
                      className="whitespace-pre-line text-sm leading-6"
                      lang="ja"
                    >
                      {cue.text}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              className="flex min-h-56 flex-1 flex-col items-center justify-center rounded-xl border border-dashed bg-fd-muted/25 text-sm transition hover:bg-fd-muted/50"
              onClick={() => setShowTranscript(true)}
              type="button"
            >
              <span className="mb-2 text-2xl">字幕</span>
              <span className="font-medium">完成盲听后显示逐句文本</span>
              <span className="mt-1 text-xs text-fd-muted-foreground">
                点击显示
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
