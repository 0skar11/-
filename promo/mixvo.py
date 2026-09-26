"""Voiceover version of a promo video: ElevenLabs voice + ElevenLabs music + our whooshes/impacts.

    python3 mixvo.py vo/v1/plan.json

plan.json:
    {
      "video": "out/v1-main.mp4",          # the rendered video (its picture is copied as is)
      "html": "v1-main.html",              # for the whooshes/impacts (music.py --sfx-only)
      "music": "vo/v1/music.mp3", "music_offset": 0.5,   # skip the first 0.5s so the drop hits the logo
      "lines": [{"file": "vo/v1/1.mp3", "at": 0.3, "tempo": 1.0}, ...],
      "out": "out/v1-main-vo.mp4"
    }

Each line has its silence trimmed, is sped up by `tempo` (ffmpeg atempo, pitch kept) and placed at
`at` seconds. The music and effects are ducked under the voice (sidechain compression), and the
result is normalized to -14 LUFS.
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
here = Path(__file__).parent


def ff(*args):
    subprocess.run([FF, '-y', '-loglevel', 'error', *map(str, args)], check=True)


def read(path):
    with wave.open(str(path)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32) / 32768


def write(path, x):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())


def main():
    plan = json.loads(Path(sys.argv[1]).read_text())
    tmp = here / 'out' / 'vo-tmp'
    tmp.mkdir(parents=True, exist_ok=True)
    video = here / plan['video']
    dur = float(subprocess.run([FF, '-i', video], capture_output=True, text=True).stderr
                .split('Duration: ')[1].split(',')[0].split(':')[-1])

    voice = np.zeros(int(SR * (dur + 1)), np.float32)
    trim = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,'
            'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse')
    for i, line in enumerate(plan['lines']):
        wav = tmp / f'line{i}.wav'
        ff('-i', here / line['file'], '-af', f"{trim},atempo={line.get('tempo', 1.0)}", '-ar', SR, '-ac', 1, wav)
        x = read(wav)
        a = int(line['at'] * SR)
        voice[a:a + len(x)] += x[:len(voice) - a]
        print(f"line {i + 1}: {line['at']:.2f}s -> {line['at'] + len(x) / SR:.2f}s")
    write(tmp / 'voice.wav', voice[:int(SR * dur)])

    subprocess.run(['python3', here / 'music.py', here / plan['html'], tmp / 'sfx.wav', '--sfx-only'],
                   check=True, stdout=subprocess.DEVNULL)

    off = plan.get('music_offset', 0)
    graph = (
        f"[1:a]atrim=start={off},asetpts=PTS-STARTPTS,aresample={SR},aformat=channel_layouts=stereo,"
        f"afade=t=out:st={dur - 0.6}:d=0.6,loudnorm=I=-17[mus];"
        f"[2:a]aresample={SR},aformat=channel_layouts=stereo,volume=0.45[sfx];"
        f"[3:a]aresample={SR},loudnorm=I=-14,highpass=f=80,"
        f"acompressor=threshold=0.1:ratio=3:attack=5:release=80,aformat=channel_layouts=stereo,asplit=2[vo][key];"
        f"[mus][sfx]amix=inputs=2:normalize=0[bed];"
        f"[bed][key]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=300[duck];"
        f"[duck][vo]amix=inputs=2:normalize=0,atrim=0:{dur},loudnorm=I=-14:TP=-1.5:LRA=11[a]"
    )
    ff('-i', video, '-i', here / plan['music'], '-i', tmp / 'sfx.wav', '-i', tmp / 'voice.wav',
       '-filter_complex', graph, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
       '-ar', SR, '-movflags', '+faststart', here / plan['out'])
    print('->', plan['out'])


if __name__ == '__main__':
    main()
