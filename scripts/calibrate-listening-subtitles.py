#!/usr/bin/env python3

"""Build sentence-level SRT cues on the real recording timeline.

The raw SRT provides acoustic timing anchors but has coarse, unpunctuated ASR
segments. 202407.txt provides the reviewed transcript and punctuation but was
timed against a different edit of the recording. This script aligns both text
streams, maps reviewed sentences onto the real audio, and snaps cue boundaries
to detected pauses.
"""

from __future__ import annotations

import argparse
import bisect
import dataclasses
import difflib
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
RAW_SRT = ROOT / "2024年07月N2听力音频.raw.srt"
REVIEWED_TRANSCRIPT = ROOT / "202407.txt"
SOURCE_AUDIO = ROOT / "202407.mp3"
OUTPUT_SRT = ROOT / "2024年07月N2听力音频.srt"

TERMINAL_PUNCTUATION = "。？！?!"
LABEL_PATTERN = re.compile(r"^(?:問題[1-5]|例|[0-9０-９]+番)$")
OPTION_PATTERN = re.compile(r"^[1-4１-４]$")
TIME_PATTERN = re.compile(
    r"^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> "
    r"(\d{2}):(\d{2}):(\d{2}),(\d{3})$"
)

TEXT_CORRECTIONS = {
    "前の日のまで": "前の日まで",
    "值引き": "値引き",
    "リハーサ ール": "リハーサル",
    "そうでし たか": "そうでしたか",
    "どこ の会社": "どこの会社",
    "今 の古くって": "今の、古くって",
    "内容かを 聞く": "内容かを聞く",
    "食べる事": "食べること",
    "思っていう人": "思っている人",
    "引越し": "引っ越し",
    "通信販売の何についてについての調査": "通信販売の何についての調査",
    "庭の種の水やり": "庭の花の水やり",
    "なさんは、旅が好きですか": "皆さんは、旅が好きですか",
    "質問1二人は": "質問1。二人は",
    "質問2二人は": "質問2。二人は",
    "店長、山田さん配達": "店長、山田さん、配達",
}

# The reviewed transcript accidentally drops one minute from question 4,
# item 5 onward. Text order is correct; restore the missing minute before
# constructing local timing anchors.
REVIEWED_TIME_OFFSET_START_ID = 470
REVIEWED_TIME_OFFSET_SECONDS = 60


@dataclasses.dataclass
class SourceCue:
    identifier: int
    start: float
    end: float
    text: str
    normalized_start: int = 0
    normalized_end: int = 0


@dataclasses.dataclass
class SemanticCue:
    text: str
    normalized_start: int
    normalized_end: int
    kind: str = "sentence"
    rough_start: float = 0
    rough_end: float = 0
    start: float = 0
    end: float = 0


@dataclasses.dataclass
class Silence:
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start

    @property
    def midpoint(self) -> float:
        return (self.start + self.end) / 2


def parse_time(parts: tuple[str, ...]) -> float:
    hours, minutes, seconds, milliseconds = map(int, parts)
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000


def format_time(value: float) -> str:
    milliseconds = max(0, round(value * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"


def parse_srt(path: Path) -> list[SourceCue]:
    blocks = re.split(r"\r?\n\r?\n+", path.read_text(encoding="utf-8").strip())
    cues: list[SourceCue] = []

    for block in blocks:
        lines = block.splitlines()
        if len(lines) < 3 or not lines[0].isdigit():
            continue
        match = TIME_PATTERN.match(lines[1])
        if not match:
            raise ValueError(f"Invalid SRT timing in {path}: {lines[1]}")
        cues.append(
            SourceCue(
                identifier=int(lines[0]),
                start=parse_time(match.groups()[0:4]),
                end=parse_time(match.groups()[4:8]),
                text="\n".join(lines[2:]).strip(),
            )
        )

    if not cues:
        raise ValueError(f"No SRT cues found in {path}")
    return cues


def normalize(text: str) -> str:
    return re.sub(
        r"[\s、。？！?!「」『』（）()・,.，：:．…ー～〜]",
        "",
        text.casefold(),
    )


def correct_text(text: str) -> str:
    for source, replacement in TEXT_CORRECTIONS.items():
        text = text.replace(source, replacement)
    return text.strip()


def assign_normalized_ranges(cues: list[SourceCue]) -> str:
    cursor = 0
    normalized_parts: list[str] = []
    for cue in cues:
        value = normalize(cue.text)
        cue.normalized_start = cursor
        cursor += len(value)
        cue.normalized_end = cursor
        normalized_parts.append(value)
    return "".join(normalized_parts)


def split_terminal_phrases(text: str) -> list[str]:
    return [
        match.group(0)
        for match in re.finditer(rf".*?[{TERMINAL_PUNCTUATION}]|.+$", text)
        if match.group(0)
    ]


def split_long_cue(cue: SemanticCue, maximum_characters: int = 44) -> list[SemanticCue]:
    if cue.kind != "sentence" or len(normalize(cue.text)) <= maximum_characters:
        return [cue]

    comma_positions = [index + 1 for index, char in enumerate(cue.text) if char == "、"]
    candidates: list[tuple[int, int, int]] = []
    total = len(normalize(cue.text))
    for text_position in comma_positions:
        left_length = len(normalize(cue.text[:text_position]))
        right_length = total - left_length
        if left_length >= 14 and right_length >= 14:
            candidates.append(
                (abs(left_length - total // 2), text_position, left_length)
            )

    if not candidates:
        return [cue]

    _, text_position, left_length = min(candidates)
    split_position = cue.normalized_start + left_length
    left = SemanticCue(
        text=cue.text[:text_position].strip(),
        normalized_start=cue.normalized_start,
        normalized_end=split_position,
    )
    right = SemanticCue(
        text=cue.text[text_position:].strip(),
        normalized_start=split_position,
        normalized_end=cue.normalized_end,
    )
    return split_long_cue(left, maximum_characters) + split_long_cue(
        right, maximum_characters
    )


def build_semantic_cues(reviewed: list[SourceCue]) -> list[SemanticCue]:
    semantic: list[SemanticCue] = []
    pending_text = ""
    pending_start = 0
    pending_end = 0
    pending_option = False

    def flush_pending(kind: str = "fragment") -> None:
        nonlocal pending_text, pending_start, pending_end, pending_option
        if pending_text:
            semantic.append(
                SemanticCue(
                    text=pending_text.strip(),
                    normalized_start=pending_start,
                    normalized_end=pending_end,
                    kind=kind,
                )
            )
        pending_text = ""
        pending_start = 0
        pending_end = 0
        pending_option = False

    for cue in reviewed:
        text = cue.text

        if text.startswith("2024年") and "日本語能力試験" in text:
            flush_pending()
            semantic.append(
                SemanticCue(
                    text=text,
                    normalized_start=cue.normalized_start,
                    normalized_end=cue.normalized_end,
                    kind="label",
                )
            )
            continue

        if LABEL_PATTERN.fullmatch(text):
            flush_pending()
            semantic.append(
                SemanticCue(
                    text=text,
                    normalized_start=cue.normalized_start,
                    normalized_end=cue.normalized_end,
                    kind="label",
                )
            )
            continue

        if OPTION_PATTERN.fullmatch(text):
            flush_pending()
            pending_text = f"{text}．"
            pending_start = cue.normalized_start
            pending_end = cue.normalized_end
            pending_option = True
            continue

        if pending_option:
            pending_text += text
            pending_end = cue.normalized_end
            flush_pending("option")
            continue

        phrase_cursor = cue.normalized_start
        for phrase in split_terminal_phrases(text):
            phrase_length = len(normalize(phrase))
            phrase_start = phrase_cursor
            phrase_cursor += phrase_length

            if not pending_text:
                pending_start = phrase_start
            pending_text += phrase
            pending_end = phrase_cursor

            if phrase[-1] in TERMINAL_PUNCTUATION:
                flush_pending("sentence")

    flush_pending()

    split_cues: list[SemanticCue] = []
    for cue in semantic:
        split_cues.extend(split_long_cue(cue))
    return split_cues


def create_position_mapper(
    reviewed_text: str, raw_text: str
) -> tuple[callable[[int], float], float]:
    matcher = difflib.SequenceMatcher(
        None,
        reviewed_text,
        raw_text,
        autojunk=False,
    )
    blocks = matcher.get_matching_blocks()
    anchors: list[tuple[int, int]] = [(0, 0)]
    for block in blocks:
        anchors.append((block.a, block.b))
        anchors.append((block.a + block.size, block.b + block.size))
    anchors.append((len(reviewed_text), len(raw_text)))

    monotonic: list[tuple[int, int]] = []
    for reviewed_position, raw_position in sorted(set(anchors)):
        if monotonic and (
            reviewed_position < monotonic[-1][0]
            or raw_position < monotonic[-1][1]
        ):
            continue
        if monotonic and reviewed_position == monotonic[-1][0]:
            monotonic[-1] = (
                reviewed_position,
                max(raw_position, monotonic[-1][1]),
            )
        else:
            monotonic.append((reviewed_position, raw_position))

    reviewed_anchors = [item[0] for item in monotonic]

    def map_position(position: int) -> float:
        index = bisect.bisect_right(reviewed_anchors, position) - 1
        index = max(0, min(index, len(monotonic) - 2))
        left_reviewed, left_raw = monotonic[index]
        right_reviewed, right_raw = monotonic[index + 1]
        if right_reviewed == left_reviewed:
            return float(left_raw)
        progress = (position - left_reviewed) / (right_reviewed - left_reviewed)
        return left_raw + progress * (right_raw - left_raw)

    return map_position, matcher.ratio()


def raw_position_to_time(
    cues: list[SourceCue], position: float, side: str
) -> float:
    starts = [cue.normalized_start for cue in cues]
    if side == "start":
        index = bisect.bisect_right(starts, position) - 1
    elif side == "end":
        index = bisect.bisect_left(starts, position) - 1
    else:
        raise ValueError(f"Unsupported timing side: {side}")
    index = max(0, min(index, len(cues) - 1))
    cue = cues[index]
    length = max(1, cue.normalized_end - cue.normalized_start)
    progress = min(1.0, max(0.0, (position - cue.normalized_start) / length))
    return cue.start + progress * (cue.end - cue.start)


def create_reviewed_time_mapper(
    reviewed: list[SourceCue],
    raw: list[SourceCue],
    raw_text: str,
    map_position: callable[[int], float],
) -> tuple[callable[[float], float], int]:
    anchors: list[tuple[float, float]] = []

    for cue in reviewed:
        normalized_cue = normalize(cue.text)
        if len(normalized_cue) < 10:
            continue
        mapped_start = map_position(cue.normalized_start)
        occurrences = [
            match.start()
            for match in re.finditer(re.escape(normalized_cue), raw_text)
        ]
        if not occurrences:
            continue
        raw_start_position = min(
            occurrences,
            key=lambda position: abs(position - mapped_start),
        )
        raw_end_position = raw_start_position + len(normalized_cue)
        anchors.append(
            (
                cue.start,
                raw_position_to_time(raw, raw_start_position, "start"),
            )
        )
        anchors.append(
            (
                cue.end,
                raw_position_to_time(raw, raw_end_position, "end"),
            )
        )

    monotonic: list[tuple[float, float]] = []
    for reviewed_time, raw_time in sorted(anchors):
        if monotonic and reviewed_time == monotonic[-1][0]:
            if raw_time > monotonic[-1][1]:
                monotonic[-1] = (reviewed_time, raw_time)
            continue
        if monotonic and raw_time < monotonic[-1][1]:
            continue
        monotonic.append((reviewed_time, raw_time))

    if len(monotonic) < 20:
        raise ValueError(
            f"Too few reliable transcript timing anchors: {len(monotonic)}"
        )

    reviewed_times = [item[0] for item in monotonic]

    def map_time(value: float) -> float:
        index = bisect.bisect_right(reviewed_times, value) - 1
        index = max(0, min(index, len(monotonic) - 2))
        left_reviewed, left_raw = monotonic[index]
        right_reviewed, right_raw = monotonic[index + 1]
        if right_reviewed == left_reviewed:
            return left_raw
        progress = (value - left_reviewed) / (right_reviewed - left_reviewed)
        return left_raw + progress * (right_raw - left_raw)

    return map_time, len(monotonic)


def detect_silences() -> list[Silence]:
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(SOURCE_AUDIO),
            "-af",
            "silencedetect=noise=-32dB:d=0.18",
            "-f",
            "null",
            "-",
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    silences: list[Silence] = []
    pending_start: float | None = None
    for line in result.stderr.splitlines():
        start_match = re.search(r"silence_start: ([0-9.]+)", line)
        if start_match:
            pending_start = float(start_match.group(1))
        end_match = re.search(r"silence_end: ([0-9.]+)", line)
        if end_match and pending_start is not None:
            silences.append(Silence(pending_start, float(end_match.group(1))))
            pending_start = None
    return silences


def nearest_silence(
    silences: list[Silence], target: float, maximum_distance: float = 1.6
) -> Silence | None:
    candidates = [
        silence
        for silence in silences
        if abs(silence.midpoint - target) <= maximum_distance
    ]
    if not candidates:
        return None
    return min(
        candidates,
        key=lambda silence: (
            abs(silence.midpoint - target) - min(silence.duration, 1.0) * 0.3
        ),
    )


def nearest_silence_edge(
    silences: list[Silence],
    target: float,
    edge: str,
    maximum_distance: float = 1.4,
) -> Silence | None:
    if edge not in {"start", "end"}:
        raise ValueError(f"Unsupported silence edge: {edge}")
    candidates = []
    for silence in silences:
        value = silence.end if edge == "start" else silence.start
        if abs(value - target) <= maximum_distance:
            candidates.append((abs(value - target), -silence.duration, silence))
    return min(candidates)[2] if candidates else None


def assign_times(
    semantic: list[SemanticCue],
    raw: list[SourceCue],
    reviewed: list[SourceCue],
    reviewed_text: str,
    raw_text: str,
    silences: list[Silence],
) -> tuple[float, int]:
    map_position, alignment_ratio = create_position_mapper(reviewed_text, raw_text)
    map_reviewed_time, timing_anchor_count = create_reviewed_time_mapper(
        reviewed,
        raw,
        raw_text,
        map_position,
    )

    for cue in semantic:
        mapped_start = map_position(cue.normalized_start)
        mapped_end = map_position(cue.normalized_end)
        normalized_cue = normalize(cue.text)
        exact_occurrences = (
            [
                match.start()
                for match in re.finditer(
                    re.escape(normalized_cue),
                    raw_text,
                )
            ]
            if len(normalized_cue) >= 8
            else []
        )
        if exact_occurrences:
            exact_start = min(
                exact_occurrences,
                key=lambda position: abs(position - mapped_start),
            )
            mapped_start = exact_start
            mapped_end = exact_start + len(normalized_cue)
            cue.rough_start = raw_position_to_time(raw, mapped_start, "start")
            cue.rough_end = raw_position_to_time(raw, mapped_end, "end")
        else:
            reviewed_start = raw_position_to_time(
                reviewed, cue.normalized_start, "start"
            )
            reviewed_end = raw_position_to_time(
                reviewed, cue.normalized_end, "end"
            )
            cue.rough_start = map_reviewed_time(reviewed_start)
            cue.rough_end = map_reviewed_time(reviewed_end)

        start_silence = nearest_silence_edge(
            silences, cue.rough_start, "start"
        )
        end_silence = nearest_silence_edge(silences, cue.rough_end, "end")
        cue.start = start_silence.end if start_silence else cue.rough_start
        cue.end = end_silence.start if end_silence else cue.rough_end

    for cue in semantic:
        if cue.end <= cue.start:
            cue.start = cue.rough_start
            cue.end = max(cue.rough_end, cue.rough_start + 0.4)

    for index, cue in enumerate(semantic):
        if index > 0 and cue.start < semantic[index - 1].end:
            target = (cue.rough_start + semantic[index - 1].rough_end) / 2
            silence = nearest_silence(silences, target)
            if silence:
                semantic[index - 1].end = silence.start
                cue.start = silence.end
            else:
                boundary = (cue.start + semantic[index - 1].end) / 2
                semantic[index - 1].end = boundary
                cue.start = boundary

    for cue in semantic:
        if cue.end <= cue.start:
            cue.start = cue.rough_start
            cue.end = max(cue.rough_end, cue.rough_start + 0.4)

    for index in range(1, len(semantic)):
        previous = semantic[index - 1]
        current = semantic[index]
        if current.start < previous.end:
            boundary = (current.start + previous.end) / 2
            previous.end = boundary
            current.start = boundary

    return alignment_ratio, timing_anchor_count


def validate(cues: list[SemanticCue], alignment_ratio: float) -> None:
    errors: list[str] = []
    if alignment_ratio < 0.82:
        errors.append(f"Text alignment ratio is too low: {alignment_ratio:.3f}")

    for index, cue in enumerate(cues, start=1):
        duration = cue.end - cue.start
        character_count = len(normalize(cue.text))
        if not cue.text:
            errors.append(f"Cue {index} is empty")
        if duration < 0.2:
            errors.append(f"Cue {index} is too short: {duration:.3f}s")
        if duration > 18:
            errors.append(
                f"Cue {index} is too long: {duration:.3f}s — {cue.text}"
            )
        if character_count > 76:
            errors.append(
                f"Cue {index} has too many characters: {character_count}"
            )
        if index > 1 and cue.start < cues[index - 2].end:
            errors.append(f"Cue {index} overlaps the previous cue")

    if errors:
        raise ValueError("Subtitle calibration failed:\n" + "\n".join(errors))


def write_srt(cues: list[SemanticCue], path: Path) -> None:
    blocks = []
    for index, cue in enumerate(cues, start=1):
        blocks.append(
            f"{index}\n"
            f"{format_time(cue.start)} --> {format_time(cue.end)}\n"
            f"{cue.text}"
        )
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify that the generated SRT matches the checked-in output.",
    )
    arguments = parser.parse_args()

    raw = parse_srt(RAW_SRT)
    reviewed = parse_srt(REVIEWED_TRANSCRIPT)
    for cue in reviewed:
        cue.text = correct_text(cue.text)
        if cue.identifier >= REVIEWED_TIME_OFFSET_START_ID:
            cue.start += REVIEWED_TIME_OFFSET_SECONDS
            cue.end += REVIEWED_TIME_OFFSET_SECONDS

    raw_text = assign_normalized_ranges(raw)
    reviewed_text = assign_normalized_ranges(reviewed)
    semantic = build_semantic_cues(reviewed)
    silences = detect_silences()
    alignment_ratio, timing_anchor_count = assign_times(
        semantic,
        raw,
        reviewed,
        reviewed_text,
        raw_text,
        silences,
    )
    validate(semantic, alignment_ratio)

    generated = "\n\n".join(
        f"{index}\n"
        f"{format_time(cue.start)} --> {format_time(cue.end)}\n"
        f"{cue.text}"
        for index, cue in enumerate(semantic, start=1)
    ) + "\n"

    if arguments.check:
        current = OUTPUT_SRT.read_text(encoding="utf-8")
        if current != generated:
            raise SystemExit(
                "Calibrated SRT is stale. Run "
                "`python3 scripts/calibrate-listening-subtitles.py`."
            )
    else:
        OUTPUT_SRT.write_text(generated, encoding="utf-8")

    durations = [cue.end - cue.start for cue in semantic]
    characters = [len(normalize(cue.text)) for cue in semantic]
    print(
        f"Calibrated {len(semantic)} cues from {len(reviewed)} reviewed "
        f"fragments using {len(raw)} raw timing anchors and "
        f"{timing_anchor_count} matched timing points plus "
        f"{len(silences)} detected pauses."
    )
    print(
        f"Alignment ratio: {alignment_ratio:.3f}; "
        f"maximum cue: {max(durations):.2f}s / {max(characters)} characters."
    )


if __name__ == "__main__":
    main()
