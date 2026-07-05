import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceAudio = resolve(root, '202407.mp3');
const sourceSubtitles = resolve(root, '2024年07月N2听力音频.srt');
const subtitleCalibrationScript = resolve(
  root,
  'scripts/calibrate-listening-subtitles.py',
);
const outputDirectory = resolve(root, 'public/audio/jlpt-n2/2024-07');
const manifestFile = resolve(root, 'lib/data/jlpt-n2-2024-07.json');

const sectionDefinitions = [
  {
    id: 1,
    title: '课题理解',
    translatedTitle: '課題理解',
    startMarkers: [
      ['1番', 181.44],
      ['2番', 263.4],
      ['3番', 354.12],
      ['4番', 445.92],
      ['5番', 534],
    ],
    endMarker: ['問題2', 628.56],
  },
  {
    id: 2,
    title: '要点理解',
    translatedTitle: 'ポイント理解',
    startMarkers: [
      ['1番', 771.4],
      ['2番', 876.52],
      ['3番', 1022.88],
      ['4番', 1140.92],
      ['5番', 1283.84],
      ['6番', 1396.98],
    ],
    endMarker: ['ここで、ちょっと休みましょう。', 1496.86],
  },
  {
    id: 3,
    title: '概要理解',
    translatedTitle: '概要理解',
    startMarkers: [
      ['1番', 1672.34],
      ['2番', 1738.98],
      ['3番', 1842.82],
      ['4番', 1936.18],
      ['5番', 2013.1],
    ],
    endMarker: ['問題4', 2095.18],
  },
  {
    id: 4,
    title: '即时应答',
    translatedTitle: '即時応答',
    startMarkers: [
      ['1番', 2170.82],
      ['2番', 2200.22],
      ['3番', 2230.66],
      ['4番', 2260.62],
      ['5番', 2289.82],
      ['6番', 2320.82],
      ['7番', 2349.82],
      ['8番', 2387.94],
      ['9番', 2420.5],
      ['10番', 2453.22],
      ['11番', 2485.66],
    ],
    endMarker: ['問題5', 2516.86],
  },
  {
    id: 5,
    title: '综合理解',
    translatedTitle: '総合理解',
    startMarkers: [
      ['1番', 2533.14],
      ['2番', 2707.86],
    ],
    endMarker: null,
  },
];

function parseTime(value) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) throw new Error(`Invalid timestamp: ${value}`);

  const [, hours, minutes, seconds, milliseconds] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(milliseconds) / 1000
  );
}

function formatTimestamp(value) {
  const milliseconds = Math.round(value * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return (
    `${hours.toString().padStart(2, '0')}:` +
    `${minutes.toString().padStart(2, '0')}:` +
    `${seconds.toString().padStart(2, '0')},` +
    remainder.toString().padStart(3, '0')
  );
}

function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}

function formatDuration(value) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function probeDuration(file) {
  return Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        file,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
}

function parseSrt(source) {
  const blocks = source.trim().split(/\r?\n\r?\n+/);
  const cues = blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const id = Number(lines[0]);
    const timing = lines[1]?.match(
      /^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})$/,
    );

    if (!Number.isInteger(id) || !timing || lines.length < 3) {
      throw new Error(`Invalid SRT block:\n${block}`);
    }

    return {
      id,
      absoluteStart: parseTime(timing[1]),
      absoluteEnd: parseTime(timing[2]),
      text: lines.slice(2).join('\n').trim(),
    };
  });

  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const previous = cues[index - 1];
    if (cue.absoluteEnd <= cue.absoluteStart) {
      throw new Error(`SRT cue ${cue.id} has a non-positive duration.`);
    }
    if (previous && cue.absoluteStart < previous.absoluteStart) {
      throw new Error(`SRT cue ${cue.id} is out of chronological order.`);
    }
  }

  return cues;
}

function createManifest(cues, sourceDuration) {
  const findMarker = ([text, approximateStart]) => {
    const candidates = cues
      .filter((cue) => cue.text === text)
      .map((cue) => ({
        cue,
        distance: Math.abs(cue.absoluteStart - approximateStart),
      }))
      .filter((candidate) => candidate.distance <= 20)
      .sort((left, right) => left.distance - right.distance);

    if (candidates.length === 0) {
      throw new Error(
        `No SRT marker "${text}" found within 20 seconds of ` +
          `${approximateStart}.`,
      );
    }
    if (
      candidates.length > 1 &&
      candidates[0].distance === candidates[1].distance
    ) {
      throw new Error(`Ambiguous SRT marker "${text}" near ${approximateStart}.`);
    }
    return candidates[0].cue;
  };

  const sections = sectionDefinitions.map((section) => {
    const startCues = section.startMarkers.map(findMarker);
    const endCue = section.endMarker ? findMarker(section.endMarker) : null;
    const boundaries = [...startCues, endCue];
    const clips = startCues.map((startCue, index) => {
      const clipStart = startCue.absoluteStart;
      const nextBoundary = boundaries[index + 1];
      const clipEnd = nextBoundary
        ? nextBoundary.absoluteStart
        : sourceDuration;
      const duration = roundTime(clipEnd - clipStart);
      const id = `2024-01_${section.id}-${index + 1}`;
      const clipCues = cues
        .filter(
          (cue) =>
            cue.absoluteEnd > clipStart && cue.absoluteStart < clipEnd,
        )
        .map((cue) => ({
          id: cue.id,
          text: cue.text,
          start: roundTime(Math.max(cue.absoluteStart, clipStart) - clipStart),
          end: roundTime(Math.min(cue.absoluteEnd, clipEnd) - clipStart),
        }));

      if (duration <= 0 || clipCues.length === 0) {
        throw new Error(`Invalid clip boundaries for ${id}.`);
      }

      return {
        id,
        number: index + 1,
        title: `第 ${index + 1} 题`,
        audio: `/audio/jlpt-n2/2024-07/${id}.mp3`,
        sourceStart: formatTimestamp(clipStart),
        sourceEnd: formatTimestamp(clipEnd),
        duration,
        durationLabel: formatDuration(duration),
        cues: clipCues,
      };
    });

    return {
      id: section.id,
      title: section.title,
      translatedTitle: section.translatedTitle,
      clips,
    };
  });

  return {
    id: 'jlpt-n2-2024-07',
    title: '2024 年 7 月 JLPT N2 听力',
    description: '按真题结构分段，支持逐句定位、字幕跟随和变速精听。',
    sections,
  };
}

function buildAudio(manifest) {
  mkdirSync(outputDirectory, { recursive: true });

  for (const section of manifest.sections) {
    for (const clip of section.clips) {
      const outputFile = resolve(outputDirectory, `${clip.id}.mp3`);
      process.stdout.write(`Building ${clip.id} (${clip.durationLabel})... `);
      execFileSync(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-ss',
          String(parseTime(clip.sourceStart)),
          '-i',
          sourceAudio,
          '-t',
          String(clip.duration),
          '-map_metadata',
          '-1',
          '-vn',
          '-ac',
          '1',
          '-ar',
          '44100',
          '-codec:a',
          'libmp3lame',
          '-b:a',
          '80k',
          outputFile,
        ],
        { stdio: 'inherit' },
      );
      process.stdout.write('done\n');
    }
  }
}

function verifyOutputs(manifest) {
  const errors = [];
  let checkedCues = 0;

  for (const section of manifest.sections) {
    for (const clip of section.clips) {
      const outputFile = resolve(outputDirectory, `${clip.id}.mp3`);
      const actualDuration = probeDuration(outputFile);
      const durationDifference = Math.abs(actualDuration - clip.duration);
      const latestCueEnd = Math.max(...clip.cues.map((cue) => cue.end));
      checkedCues += clip.cues.length;

      if (durationDifference > 0.08) {
        errors.push(
          `${clip.id}: duration differs by ${durationDifference.toFixed(3)}s`,
        );
      }
      if (latestCueEnd > actualDuration + 0.02) {
        errors.push(
          `${clip.id}: subtitle ends at ${latestCueEnd.toFixed(3)}s, ` +
            `audio ends at ${actualDuration.toFixed(3)}s`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Audio/subtitle verification failed:\n${errors.join('\n')}`);
  }

  const clips = manifest.sections.flatMap((section) => section.clips);
  console.log(
    `Verified ${clips.length} clips and ${checkedCues} subtitle cues. ` +
      'All audio durations match the SRT-derived timelines within 80ms.',
  );
}

execFileSync('python3', [subtitleCalibrationScript, '--check'], {
  stdio: 'inherit',
});

const sourceDuration = probeDuration(sourceAudio);
const cues = parseSrt(readFileSync(sourceSubtitles, 'utf8'));
const manifest = createManifest(cues, sourceDuration);

mkdirSync(dirname(manifestFile), { recursive: true });
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

if (!process.argv.includes('--data-only')) {
  buildAudio(manifest);
  verifyOutputs(manifest);
}

const clips = manifest.sections.flatMap((section) => section.clips);
console.log(
  `Generated ${clips.length} clips in ${manifest.sections.length} sections ` +
    `from ${cues.length} SRT cues.`,
);
